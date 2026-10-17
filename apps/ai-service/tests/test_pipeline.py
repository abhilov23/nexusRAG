"""End-to-end: GitHub-style tarball -> chunks -> vectors, no network needed.

Uses an in-memory Qdrant and the deterministic embedder, so this verifies the
whole pipeline shape rather than embedding quality.
"""

from __future__ import annotations

import io
import tarfile

from qdrant_client import QdrantClient

from ai_service.config import Settings
from ai_service.parsing import chunk_file
from ai_service.pipeline import index_repository
from ai_service.storage.snapshots import _clean_path


def test_settings() -> Settings:
    """No API key configured, so embeddings resolve to the deterministic path."""
    return Settings(
        _env_file=None,
        EMBEDDING_DIMENSIONS=32,
        OPENAI_API_KEY=None,
        LLM_API_KEY=None,
        EMBEDDING_API_KEY=None,
    )


ROOT = "expressjs-express-abc123"

FILES: dict[str, bytes] = {
    "lib/auth.js": b"""
'use strict';

const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign({ id: user.id }, process.env.SECRET);
}

class AuthService {
  verify(token) {
    return jwt.verify(token, process.env.SECRET);
  }
}
""",
    "lib/router/index.js": b"""
const express = require('express');

module.exports = function createRouter() {
  return express.Router();
}
""",
    "README.md": b"# express\n\nA fast web framework.\n",
    "node_modules/junk/index.js": b"module.exports = 'should be skipped';",
    "package-lock.json": b'{"lockfileVersion": 3}',
}


def build_archive() -> bytes:
    """A tar.gz shaped exactly like GitHub's /archive/{ref}.tar.gz."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name, data in FILES.items():
            info = tarfile.TarInfo(f"{ROOT}/{name}")
            info.size = len(data)
            info.mtime = 0
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def read_archive(raw: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        for member in archive:
            if not member.isfile():
                continue
            path = _clean_path(member.name)
            if path is None:
                continue
            handle = archive.extractfile(member)
            out.append((path, handle.read() if handle else b""))
    return out


def test_clean_path_strips_github_root():
    assert _clean_path(f"{ROOT}/lib/auth.js") == "lib/auth.js"
    assert _clean_path(f"{ROOT}/a/b/c.js") == "a/b/c.js"
    assert _clean_path(f"{ROOT}/README.md") == "README.md"
    assert _clean_path(f"{ROOT}/../../etc/passwd") is None
    # A top-level file inside the archive root is legitimate.
    assert _clean_path(f"{ROOT}/LICENSE") == "LICENSE"
    # With no root directory there is nothing to strip, so refuse rather than
    # guess and index something under the wrong path.
    assert _clean_path("loose.js") is None
    # Absolute paths never occur in a GitHub archive; stripping a segment from
    # one would silently re-root it.
    assert _clean_path("/absolute/path.js") is None
    assert _clean_path("C:/windows/system32/x.js") is None
    assert _clean_path(f"{ROOT}\\lib\\auth.js") == "lib/auth.js"


def test_archive_round_trip_reads_relative_paths():
    files = read_archive(build_archive())
    paths = {p for p, _ in files}
    assert "lib/auth.js" in paths
    assert "README.md" in paths
    assert f"{ROOT}/lib/auth.js" not in paths


def test_pipeline_indexes_only_source_files():
    client = QdrantClient(":memory:")

    result = index_repository(
        client=client,
        collection="code_chunks",
        repository_id="repo-1",
        commit_sha="abc123",
        files=read_archive(build_archive()),
        settings=test_settings(),
    )

    assert result.files_seen == 5
    # README.md and package-lock.json are not source; node_modules is filtered.
    assert result.files_parsed == 2, result.files_skipped
    assert result.chunks > 0
    assert result.vectors == result.chunks

    points, _ = client.scroll(
        collection_name="code_chunks",
        scroll_filter=None,
        limit=100,
        with_payload=True,
        with_vectors=False,
    )
    indexed = {p.payload["path"] for p in points}
    assert indexed == {"lib/auth.js", "lib/router/index.js"}, indexed

    # The auth file's classes and functions should be separately addressable.
    symbols = {p.payload.get("symbol") for p in points if p.payload["path"] == "lib/auth.js"}
    assert {"signToken", "AuthService"} <= symbols, symbols


def test_reindexing_replaces_rather_than_duplicates():
    client = QdrantClient(":memory:")
    files = read_archive(build_archive())

    first = index_repository(
        client=client,
        collection="code_chunks",
        repository_id="repo-1",
        commit_sha="abc123",
        files=files,
        settings=test_settings(),
    )
    second = index_repository(
        client=client,
        collection="code_chunks",
        repository_id="repo-1",
        commit_sha="def456",
        files=files,
        settings=test_settings(),
    )

    assert second.vectors == first.vectors
    count = client.count(collection_name="code_chunks", exact=True).count
    assert count == first.vectors, f"expected replacement, got {count} points"

    # Every surviving point should carry the new commit.
    points, _ = client.scroll("code_chunks", scroll_filter=None, limit=100, with_payload=True)
    assert {p.payload["commitSha"] for p in points} == {"def456"}


def test_deleted_code_does_not_leave_stale_vectors():
    client = QdrantClient(":memory:")

    index_repository(
        client=client,
        collection="code_chunks",
        repository_id="repo-1",
        commit_sha="abc123",
        files=read_archive(build_archive()),
        settings=test_settings(),
    )

    # A later commit that drops lib/auth.js entirely.
    reduced = [f for f in read_archive(build_archive()) if f[0] != "lib/auth.js"]
    index_repository(
        client=client,
        collection="code_chunks",
        repository_id="repo-1",
        commit_sha="def456",
        files=reduced,
        settings=test_settings(),
    )

    points, _ = client.scroll("code_chunks", scroll_filter=None, limit=100, with_payload=True)
    paths = {p.payload["path"] for p in points}
    assert "lib/auth.js" not in paths, paths


def test_deterministic_embeddings_are_stable_and_distinct():
    from ai_service.ai import deterministic

    embedder = deterministic

    a = embedder("def authenticate(): pass", 16)
    b = embedder("def authenticate(): pass", 16)
    c = embedder("class UserRepository: pass", 16)

    assert a == b, "same text must embed identically across runs"
    assert a != c, "different text must embed differently"
    assert len(a) == 16
    assert abs(sum(v * v for v in a) - 1.0) < 1e-6, "vectors must be unit length"


def test_chunker_and_pipeline_agree_on_the_same_file():
    files = dict(read_archive(build_archive()))
    auth_chunks = chunk_file("lib/auth.js", files["lib/auth.js"])
    router_chunks = chunk_file("lib/router/index.js", files["lib/router/index.js"])

    client = QdrantClient(":memory:")
    result = index_repository(
        client=client,
        collection="code_chunks",
        repository_id="repo-1",
        commit_sha="abc123",
        files=list(files.items()),
        settings=test_settings(),
    )

    expected = len(auth_chunks.chunks) + len(router_chunks.chunks)
    assert result.vectors == expected, f"{result.vectors} vectors vs {expected} chunks"