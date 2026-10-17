"""Symbol nodes and inferred relationships, derived from chunked source.

Edges are inferred from identifier usage rather than a full compiler front end: a
symbol that mentions another symbol's name is treated as calling it. That
over-approximates, which is the safe direction -- a spurious edge costs a little
noise, while a missed one means "what depends on X" silently omits a real caller.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from ai_service.parsing import Chunk


@dataclass(frozen=True)
class GraphNode:
    repository_id: str
    commit_sha: str
    key: str
    name: str
    kind: str
    path: str
    language: str
    start_line: int
    end_line: int


@dataclass(frozen=True)
class GraphEdge:
    from_key: str
    to_key: str
    type: str


@dataclass
class GraphBuild:
    nodes: list[GraphNode] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)


_DECLARATION = re.compile(
    r"\b(?:def|class|function|func|fn|interface|type|struct|enum|impl|module|const|let|var)\s+([A-Za-z_$][\w$]*)"
)

_CALL = re.compile(r"\b([A-Za-z_$][\w$]*)\s*[\(\.\:]")

# Words that look like calls but never are.
_STOPWORDS = frozenset(
    {
        "if", "for", "while", "switch", "catch", "return", "function", "def",
        "class", "new", "typeof", "await", "async", "print", "console", "super",
        "this", "self", "and", "or", "not", "in", "is", "with", "as", "from",
        "import", "lambda", "yield", "assert", "raise", "throw", "try", "else",
        "elif", "except", "finally", "match", "case", "do", "then", "end",
    }
)


def symbol_key(repository_id: str, path: str, symbol: str) -> str:
    return f"{repository_id}:{path}:{symbol}"


def build_graph(chunks: list[Chunk], repository_id: str, commit_sha: str) -> GraphBuild:
    """Build nodes and edges from chunked source."""
    build = GraphBuild()
    names: dict[str, GraphNode] = {}

    for chunk in chunks:
        node = GraphNode(
            repository_id=repository_id,
            commit_sha=commit_sha,
            key=symbol_key(repository_id, chunk.path, chunk.symbol or chunk.path),
            name=chunk.symbol or chunk.path,
            kind=chunk.kind if chunk.symbol else "FILE",
            path=chunk.path,
            language=chunk.language,
            start_line=chunk.start_line,
            end_line=chunk.end_line,
        )
        build.nodes.append(node)
        names.setdefault(node.name, node)

    seen_edges: set[tuple[str, str, str]] = set()

    def add_edge(source: GraphNode, target_name: str, kind: str) -> None:
        target = names.get(target_name)
        if target is None or target.key == source.key:
            return
        signature = (source.key, target.key, kind)
        if signature in seen_edges:
            return
        seen_edges.add(signature)
        build.edges.append(GraphEdge(source.key, target.key, kind))

    for chunk in chunks:
        if not chunk.symbol:
            continue
        source = names.get(chunk.symbol)
        if source is None:
            continue

        # Imported symbols are a stronger signal than a bare mention.
        for statement in chunk.imports:
            for name in re.findall(r"[A-Za-z_$][\w$]*", statement):
                add_edge(source, name, "IMPORTS")

        # Declarations nested inside this chunk, e.g. methods of a class.
        for declared in _DECLARATION.findall(chunk.content):
            add_edge(source, declared, "CONTAINS")

        for called in set(_CALL.findall(chunk.content)):
            if called in _STOPWORDS:
                continue
            add_edge(source, called, "CALLS")

    return build


def summarise(build: GraphBuild) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for edge in build.edges:
        counts[edge.type] += 1
    return {"nodes": len(build.nodes), "edges": len(build.edges), **dict(counts)}