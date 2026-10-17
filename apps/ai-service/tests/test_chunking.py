"""Chunking behaviour that has to hold regardless of language pack changes."""

from __future__ import annotations

from ai_service.parsing import chunk_file, is_ignored_path, language_for

PYTHON_SOURCE = b'''
import os
from pathlib import Path


def validate_token(token: str) -> bool:
    """Check a JWT is structurally sane."""
    return token.count(".") == 2


class AuthService:
    def login(self, user, password):
        return validate_token("a.b.c")
'''

TS_SOURCE = b"""
import { Request } from "express";

export async function getRepoOwner(req: Request): Promise<string> {
  return req.params.owner;
}

export class RepoService {
  async sync(id: string) {
    return id;
  }
}
"""

GO_SOURCE = b"""
package main

import "fmt"

func HandleUpload(w http.ResponseWriter, r *http.Request) {
    fmt.Println("hi")
}

type Server struct {
    Addr string
}
"""


def test_python_definitions_become_chunks():
    result = chunk_file("svc/auth.py", PYTHON_SOURCE)

    assert result.error is None
    symbols = {c.symbol for c in result.chunks}
    assert "validate_token" in symbols, symbols
    assert "AuthService" in symbols, symbols


def test_python_imports_are_attached():
    result = chunk_file("svc/auth.py", PYTHON_SOURCE)

    joined = " ".join(result.chunks[0].imports)
    assert "import os" in joined
    assert "from pathlib import Path" in joined


def test_typescript_functions_and_classes():
    result = chunk_file("src/repo.ts", TS_SOURCE)

    assert result.error is None
    symbols = {c.symbol for c in result.chunks}
    assert "getRepoOwner" in symbols, symbols
    assert "RepoService" in symbols, symbols


def test_go_functions_and_types():
    result = chunk_file("cmd/main.go", GO_SOURCE)

    assert result.error is None
    symbols = {c.symbol for c in result.chunks}
    assert "HandleUpload" in symbols, symbols
    assert "Server" in symbols, symbols


def test_every_chunk_has_line_numbers_inside_the_file():
    result = chunk_file("svc/auth.py", PYTHON_SOURCE)
    total_lines = PYTHON_SOURCE.decode().count("\n") + 1

    for chunk in result.chunks:
        assert 1 <= chunk.start_line <= total_lines
        assert chunk.start_line <= chunk.end_line


def test_file_without_definitions_falls_back_to_one_chunk():
    source = b'a = 1\nb = 2\nc = a + b\n'
    result = chunk_file("config.py", source)

    assert len(result.chunks) == 1
    assert result.chunks[0].kind == "file"


def test_unsupported_extension_is_skipped():
    result = chunk_file("docs/readme.md", b"# hello")

    assert result.chunks == []
    assert result.error == "unsupported file type"


def test_oversized_definition_splits_on_line_boundaries():
    body = "\n".join(f"    x{i} = {i}" for i in range(4000))
    source = f"def huge():\n{body}\n".encode()

    result = chunk_file("big.py", source, max_chunk_bytes=2000)

    assert len(result.chunks) > 1
    for chunk in result.chunks:
        assert len(chunk.content.encode()) <= 4000
        assert chunk.content.strip()


def test_embedding_text_carries_path_and_symbol():
    result = chunk_file("svc/auth.py", PYTHON_SOURCE)
    chunk = next(c for c in result.chunks if c.symbol == "validate_token")

    text = chunk.to_embedding_text()
    assert text.startswith("svc/auth.py :: validate_token")


def test_path_filtering():
    assert is_ignored_path("node_modules/react/index.js")
    assert is_ignored_path("a/b/__pycache__/x.pyc")
    assert is_ignored_path("dist/main.js")
    assert is_ignored_path("logo.png")
    assert not is_ignored_path("src/app/page.tsx")
    assert not is_ignored_path("packages/db/schema.prisma")


def test_language_resolution():
    assert language_for("a/b.py") == "python"
    assert language_for("a/b.tsx") == "tsx"
    assert language_for("Dockerfile") == "dockerfile"
    assert language_for("notes.txt") is None