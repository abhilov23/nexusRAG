"""Lexical and graph indexing.

Runs entirely against fakes: no Elasticsearch, no Neo4j, no network. What is
being verified is the document shape we send, the batching, and -- most
importantly -- that an unreachable store degrades instead of raising.
"""

from __future__ import annotations

from ai_service.graphing import build_graph
from ai_service.parsing import chunk_file
from ai_service.storage.graph_store import write_subgraph
from ai_service.storage.lexical import INDEX_SETTINGS, build_client, index_chunks


class FakeIndices:
    def __init__(self):
        self.created: list[str] = []

    def exists(self, index: str) -> bool:
        return index in self.created

    def create(self, index: str, **kwargs) -> None:
        self.created.append(index)


class FakeElasticsearch:
    def __init__(self):
        self.indices = FakeIndices()
        self.batches: list[list[dict]] = []
        self.deleted_for: list[str] = []

    def bulk(self, operations: list[dict], refresh: bool = False) -> dict:
        # Operations alternate action/document, so pair them up.
        self.batches.append(operations)
        return {"errors": False, "items": []}

    def delete_by_query(self, index: str, query: dict, **kwargs) -> None:
        self.deleted_for.append(query["term"]["repositoryId"])


class BrokenElasticsearch:
    """Every call raises, as an unreachable cluster would."""

    def bulk(self, *args, **kwargs):
        raise ConnectionError("cluster unreachable")

    def delete_by_query(self, *args, **kwargs):
        raise ConnectionError("cluster unreachable")

    class indices:
        @staticmethod
        def exists(index: str) -> bool:
            raise ConnectionError("cluster unreachable")


PY_SOURCE = b"""
import os


def normalise_email(value):
    return value.strip().lower()


def submit(value):
    return normalise_email(value)
"""


def chunks():
    return chunk_file("src/handlers.py", PY_SOURCE).chunks


def test_index_mapping_matches_the_typescript_client():
    """Both sides must agree or a query written for one mis-scores against the other."""
    properties = INDEX_SETTINGS["mappings"]["properties"]

    assert properties["repositoryId"]["type"] == "keyword"
    assert properties["commitSha"]["type"] == "keyword"
    assert properties["content"]["type"] == "text"
    assert properties["content"]["analyzer"] == "code_analyzer"
    assert properties["symbol"]["type"] == "text"
    assert "keyword" in properties["path"]["fields"]


def test_indexing_sends_action_document_pairs():
    client = FakeElasticsearch()
    written = index_chunks(client, chunks(), "repo1", "abc123")

    assert written == len(chunks())
    assert "code_chunks" in client.indices.created

    operations = client.batches[0]
    assert len(operations) % 2 == 0, "bulk operations must alternate action and document"
    assert operations[0]["index"]["_index"] == "code_chunks"
    assert operations[1]["repositoryId"] == "repo1"
    assert operations[1]["commitSha"] == "abc123"
    assert operations[1]["content"]


def test_document_ids_are_stable_across_runs():
    from ai_service.storage.lexical import document_id

    first = [document_id("repo1", c) for c in chunks()]
    second = [document_id("repo1", c) for c in chunks()]
    assert first == second, "re-indexing must replace, not duplicate"

    other = [document_id("repo2", c) for c in chunks()]
    assert first != other, "ids must be scoped per repository"


def test_batches_respect_the_size_limit():
    client = FakeElasticsearch()
    many = chunks() * 300
    written = index_chunks(client, many, "repo1", "abc123", batch_size=500)

    assert written == len(many)
    assert len(client.batches) > 1, "should have split into multiple bulk calls"


def test_lexical_indexing_degrades_instead_of_raising():
    written = index_chunks(BrokenElasticsearch(), chunks(), "repo1", "abc123")
    assert written == 0, "an unreachable cluster must yield 0, not raise"


def test_empty_chunks_write_nothing():
    client = FakeElasticsearch()
    assert index_chunks(client, [], "repo1", "abc123") == 0
    assert client.batches == []


# --- graph ------------------------------------------------------------------


class FakeSession:
    def __init__(self, sink: list):
        self.sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def run(self, query: str, **params) -> None:
        self.sink.append((query, params))


class FakeDriver:
    def __init__(self, sink: list | None = None):
        self.sink = sink if sink is not None else []
        self.closed = False

    def session(self):
        return FakeSession(self.sink)

    def close(self):
        self.closed = True


def test_graph_write_sends_nodes_before_edges():
    sink: list = []
    driver = FakeDriver(sink)
    build = build_graph(chunks(), "repo1", "abc123")

    assert write_subgraph(driver, build, "repo1") is True

    statements = [query for query, _ in sink]
    node_index = next(i for i, q in enumerate(statements) if "MERGE (s:Symbol" in q)
    edge_index = next(i for i, q in enumerate(statements) if "MERGE (a)-[r:RELATES" in q)
    assert node_index < edge_index, "edges must follow nodes or they dangle"


def test_graph_write_clears_the_previous_subgraph():
    sink: list = []
    driver = FakeDriver(sink)
    write_subgraph(driver, build_graph(chunks(), "repo1", "abc123"), "repo1")

    assert any("DETACH DELETE" in query for query, _ in sink)


def test_graph_write_binds_repository_scope():
    sink: list = []
    driver = FakeDriver(sink)
    write_subgraph(driver, build_graph(chunks(), "repo1", "abc123"), "repo1")

    # Schema statements are bare strings with no parameters -- and one of them
    # contains the literal text "repositoryId". Filter on the params actually
    # being bound instead.
    data_statements = [
        params for _, params in sink if params.get("repositoryId") is not None
    ]
    assert data_statements, "expected data statements"
    for params in data_statements:
        assert params["repositoryId"] == "repo1"

    # Nothing may be written without a repository scope.
    for query, params in sink:
        if "MERGE (s:Symbol" in query or "RELATES" in query:
            assert params.get("repositoryId") == "repo1", query


class BrokenDriver:
    def session(self):
        raise ConnectionError("neo4j unreachable")


def test_graph_write_degrades_instead_of_raising():
    build = build_graph(chunks(), "repo1", "abc123")
    assert write_subgraph(BrokenDriver(), build, "repo1") is False


def test_empty_graph_is_not_written():
    sink: list = []
    driver = FakeDriver(sink)
    from ai_service.graphing import GraphBuild

    assert write_subgraph(driver, GraphBuild(), "repo1") is False
    assert sink == [], "no statements should be sent for an empty graph"


def test_client_construction_variants():
    """API key and basic auth must both be accepted; neither may be required."""
    from ai_service.config import Settings

    with_key = Settings(
        _env_file=None,
        ELASTICSEARCH_URL="https://x.es.cloud.es.io:443",
        ELASTICSEARCH_API_KEY="abc",
    )
    assert build_client(with_key) is not None

    with_basic = Settings(
        _env_file=None,
        ELASTICSEARCH_URL="http://localhost:9200",
        ELASTICSEARCH_USERNAME="elastic",
        ELASTICSEARCH_PASSWORD="pw",
    )
    assert build_client(with_basic) is not None

    anonymous = Settings(_env_file=None, ELASTICSEARCH_URL="http://localhost:9200")
    assert build_client(anonymous) is not None