"""Graph construction: symbol nodes and inferred relationships."""

from __future__ import annotations

from ai_service.graphing import build_graph, summarise, symbol_key
from ai_service.parsing import chunk_file

SOURCE = b'''
import jwt

def sign_token(user):
    return jwt.sign(user)

class AuthService:
    def verify(self, token):
        return validate_token(token)

def validate_token(t):
    return bool(t)
'''


def test_graph_has_a_node_per_symbol():
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    build = build_graph(chunks, "repo1", "abc123")

    names = {node.name for node in build.nodes}
    assert {"sign_token", "AuthService", "validate_token"} <= names, names


def test_symbol_keys_are_unique_per_repository():
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    build = build_graph(chunks, "repo1", "abc123")

    keys = [node.key for node in build.nodes]
    assert len(keys) == len(set(keys))

    other = build_graph(chunks, "repo2", "abc123")
    assert other.nodes[0].key != build.nodes[0].key, "keys must be scoped to a repository"


def test_edges_are_inferred_between_real_symbols():
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    build = build_graph(chunks, "repo1", "abc123")

    edges = {(e.from_key.split(":")[-1], e.to_key.split(":")[-1], e.type) for e in build.edges}

    # `verify` is a method inside the class chunk, not its own node, so the call
    # to validate_token is attributed to AuthService. That is the intended
    # granularity: chunking a class in half would fragment it.
    assert ("AuthService", "validate_token", "CALLS") in edges, edges


def test_third_party_imports_are_not_linked():
    """The graph models this repository's structure, not its dependencies.

    `jwt` is not a symbol here, so linking to it would produce an edge that
    cannot be traversed to anything.
    """
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    build = build_graph(chunks, "repo1", "abc123")

    targets = {e.to_key.split(":")[-1] for e in build.edges}
    assert "jwt" not in targets, targets


def test_intra_repo_imports_are_linked():
    source = b"""
from helpers import normalise_email

def submit(email):
    return normalise_email(email)


def normalise_email(email):
    return email.strip().lower()
"""
    chunks = chunk_file("src/handlers.py", source).chunks
    build = build_graph(chunks, "repo1", "abc123")

    edges = {(e.from_key.split(":")[-1], e.to_key.split(":")[-1], e.type) for e in build.edges}
    assert ("submit", "normalise_email", "IMPORTS") in edges, edges


def test_no_self_edges():
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    build = build_graph(chunks, "repo1", "abc123")

    for edge in build.edges:
        assert edge.from_key != edge.to_key


def test_stopwords_never_become_edges():
    source = b"""
def process(items):
    if items:
        for item in items:
            return self.handle(item)
    return None
"""
    chunks = chunk_file("src/svc.py", source).chunks
    build = build_graph(chunks, "repo1", "abc123")

    targets = {e.to_key.split(":")[-1] for e in build.edges}
    assert not (targets & {"if", "for", "return", "self"}), targets


def test_edges_are_deduplicated():
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    build = build_graph(chunks, "repo1", "abc123")

    signatures = {(e.from_key, e.to_key, e.type) for e in build.edges}
    assert len(signatures) == len(build.edges), "duplicate edges emitted"


def test_summarise_counts_by_relationship():
    chunks = chunk_file("src/auth.py", SOURCE).chunks
    summary = summarise(build_graph(chunks, "repo1", "abc123"))

    assert summary["nodes"] > 0
    assert summary["edges"] > 0
    assert summary["CALLS"] > 0


def test_anonymous_file_chunk_still_yields_a_node():
    source = b"a = 1\nb = 2\n"
    chunks = chunk_file("config.py", source).chunks
    build = build_graph(chunks, "repo1", "abc123")

    assert len(build.nodes) == 1
    assert build.nodes[0].kind == "FILE"


def test_symbol_key_format_is_stable():
    assert symbol_key("repo", "src/a.ts", "fn") == "repo:src/a.ts:fn"