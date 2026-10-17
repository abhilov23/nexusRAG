"""Code-aware chunking.

Splits a source file along Tree-sitter structure (functions, classes, methods)
rather than at arbitrary byte offsets, so each chunk carries the definition it
came from and its imports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .languages import language_for, parser_for

# Node types that are worth chunking on their own.
_DEFINITION_NODES = frozenset(
    {
        "function_definition",
        "function_declaration",
        "function_item",
        "method_definition",
        "method_declaration",
        "class_definition",
        "class_declaration",
        "struct_item",
        "impl_item",
        "trait_item",
        "interface_declaration",
        "enum_declaration",
        "enum_item",
        "module_declaration",
        "type_declaration",
        "arrow_function",
        "decorated_definition",
        "lexical_declaration",
        "variable_declaration",
    }
)

# Node types that are structural noise on their own but matter inside a chunk.
_NOISE_NODES = frozenset({"comment", "line_comment", "block_comment"})


@dataclass(frozen=True)
class Chunk:
    """One code-aware unit of a file."""

    path: str
    language: str
    content: str
    start_line: int
    end_line: int
    symbol: str | None = None
    kind: str = "block"
    imports: tuple[str, ...] = ()

    @property
    def chunk_id(self) -> str:
        return f"{self.path}:{self.start_line}:{self.symbol or self.kind}"

    def to_embedding_text(self) -> str:
        """The text actually sent to the embedding model.

        Path and symbol are prepended deliberately: it is what lets a bare code
        fragment retrieve well for questions like "where is auth handled".
        """
        header = f"{self.path}"
        if self.symbol:
            header += f" :: {self.symbol}"
        return f"{header}\n\n{self.content}"


@dataclass
class FileParseResult:
    path: str
    language: str
    chunks: list[Chunk] = field(default_factory=list)
    error: str | None = None


def _node_text(node: Any, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _line_of(node: Any) -> int:
    return node.start_point[0] + 1


def _symbol_name(node: Any, source: bytes) -> str | None:
    """Best-effort definition name, without depending on per-language node shapes."""
    stack = [node]
    while stack:
        current = stack.pop()
        field = current.child_by_field_name("name")
        if field is not None:
            return _node_text(field, source)
        for child in current.children:
            if child.type in {"identifier", "type_identifier", "property_identifier"}:
                return _node_text(child, source)
            if child.type not in _NOISE_NODES:
                stack.append(child)
    return None


def _collect_imports(root: Any, source: bytes) -> tuple[str, ...]:
    """File-level import statements, so a chunk carries its dependencies."""
    imports: list[str] = []
    for child in root.children:
        if child.type in {
            "import_statement",
            "import_declaration",
            "import_from_statement",
            "import_spec",
            "use_declaration",
            "using_directive",
            "require",
        }:
            text = _node_text(child, source).strip()
            if text:
                imports.append(text)
    return tuple(imports[:50])


def _walk_definitions(node: Any, source: bytes, out: list[tuple[Any, str]]) -> None:
    """Collect definition nodes, ignoring anything nested inside a definition."""
    if node.type in _DEFINITION_NODES:
        out.append((node, node.type))
        return
    for child in node.children:
        _walk_definitions(child, source, out)


def chunk_file(path: str, source: bytes, max_chunk_bytes: int = 24_000) -> FileParseResult:
    """Parse one file and split it into code-aware chunks.

    A file whose definitions would each fit comfortably yields one chunk per
    definition. A file with no recognisable definitions (a config file, a script)
    yields a single chunk for the whole file, which is still more useful to
    retrieve than arbitrary slices.
    """
    language = language_for(path)
    if language is None:
        return FileParseResult(path=path, language="", error="unsupported file type")

    parser = parser_for(language)
    if parser is None:
        return FileParseResult(path=path, language=language, error="grammar unavailable")

    try:
        tree = parser.parse(source)
    except Exception as error:  # pragma: no cover - grammar level failure
        return FileParseResult(path=path, language=language, error=f"parse failed: {error}")

    root = tree.root_node
    if root.has_error:
        # Still index it: partially-valid code is usually still worth retrieving,
        # and the tree-sitter error nodes mark exactly where it broke.
        pass

    imports = _collect_imports(root, source)

    definitions: list[tuple[Any, str]] = []
    _walk_definitions(root, source, definitions)

    # Case 1: no recognisable definitions (config files, scripts, markup).
    # Emit the whole file as one chunk -- still far more retrievable than
    # arbitrary byte slices.
    if not definitions:
        return FileParseResult(
            path=path,
            language=language,
            chunks=[
                _whole_file_chunk(path, language, source, root, imports, max_chunk_bytes)
            ],
        )

    # Case 2: one chunk per definition, splitting any that exceed the ceiling.
    chunks: list[Chunk] = []
    for node, kind in definitions:
        text = _node_text(node, source)
        if not text.strip():
            continue
        encoded = len(text.encode("utf-8"))
        symbol = _symbol_name(node, source)

        if encoded > max_chunk_bytes:
            for part, offset in _split_oversized(text, max_chunk_bytes):
                chunks.append(
                    Chunk(
                        path=path,
                        language=language,
                        content=part,
                        start_line=_line_of(node) + offset,
                        end_line=_line_of(node) + offset + part.count("\n"),
                        symbol=symbol,
                        kind=kind,
                        imports=imports,
                    )
                )
            continue

        chunks.append(
            Chunk(
                path=path,
                language=language,
                content=text,
                start_line=_line_of(node),
                end_line=node.end_point[0] + 1,
                symbol=symbol,
                kind=kind,
                imports=imports,
            )
        )

    # Case 3: definitions existed but were all empty. Keep the file.
    if not chunks:
        chunks.append(
            _whole_file_chunk(path, language, source, root, imports, max_chunk_bytes)
        )

    return FileParseResult(path=path, language=language, chunks=chunks)


def _whole_file_chunk(
    path: str,
    language: str,
    source: bytes,
    root: Any,
    imports: tuple[str, ...],
    max_bytes: int,
) -> Chunk:
    """One chunk for an entire file, line-split if it exceeds the ceiling."""
    text = source.decode("utf-8", errors="replace")

    if len(text.encode("utf-8")) <= max_bytes:
        return Chunk(
            path=path,
            language=language,
            content=text,
            start_line=1,
            end_line=root.end_point[0] + 1,
            symbol=None,
            kind="file",
            imports=imports,
        )

    content, offset = _split_oversized(text, max_bytes)[0]
    return Chunk(
        path=path,
        language=language,
        content=content,
        start_line=1 + offset,
        end_line=1 + offset + content.count("\n"),
        symbol=None,
        kind="file",
        imports=imports,
    )


def _split_oversized(text: str, max_bytes: int) -> list[tuple[str, int]]:
    """Split text on line boundaries, returning (chunk, start_line_offset) pairs."""
    parts: list[tuple[str, int]] = []
    buffer: list[str] = []
    size = 0
    start = 0

    for offset, line in enumerate(text.splitlines()):
        line_size = len(line.encode("utf-8")) + 1
        if size + line_size > max_bytes and buffer:
            parts.append(("\n".join(buffer), start))
            buffer, size, start = [], 0, offset
        buffer.append(line)
        size += line_size

    if buffer:
        parts.append(("\n".join(buffer), start))
    return parts