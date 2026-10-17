"""Reading repository snapshots out of object storage.

The TypeScript worker is the only writer; this streams the same tar.gz back out
of R2 so the archive is never held in memory or unpacked to disk.
"""

from __future__ import annotations

import re
import tarfile
from collections.abc import Iterator
from dataclasses import dataclass
from typing import IO

from ai_service.config import Settings


@dataclass(frozen=True)
class SourceFile:
    path: str
    data: bytes


def _client(settings: Settings):
    import boto3
    from botocore.config import Config

    endpoint, access_key, secret_key, _bucket = settings.require_storage()
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


def iter_archive_files(
    settings: Settings, key: str, *, max_file_bytes: int | None = None
) -> Iterator[SourceFile]:
    """Stream a .tar.gz from R2, yielding each regular file once.

    `max_file_bytes` skips individual oversized files rather than aborting: one
    pathological blob should not stop a repository from being indexed.
    """
    limit = max_file_bytes or settings.max_file_bytes
    client = _client(settings)
    bucket = settings.storage_bucket
    buffer = client.get_object(Bucket=bucket, Key=key)["Body"]

    with tarfile.open(fileobj=_BytesReader(buffer), mode="r|gz") as archive:
        for member in archive:
            if not member.isfile():
                continue
            if member.size > limit:
                continue

            handle = archive.extractfile(member)
            if handle is None:
                continue

            path = _clean_path(member.name)
            if path is None:
                continue

            data = handle.read()
            if len(data) > limit:
                continue
            yield SourceFile(path=path, data=data)


class _BytesReader:
    """Adapt a boto3 StreamingBody to the fileobj tarfile expects."""

    def __init__(self, stream: IO[bytes]) -> None:
        self._stream = stream

    def read(self, size: int = -1) -> bytes:
        return self._stream.read(size)

    def close(self) -> None:  # pragma: no cover - tarfile closes this
        pass


def _clean_path(name: str) -> str | None:
    """Normalise a member path and reject anything that escapes the root.

    Archives always come from GitHub's `/archive/{ref}.tar.gz` endpoint, which
    nests every entry under a single `{owner}-{repo}-{sha}/` directory. That
    prefix is stripped so paths are repository-relative, matching what the
    TypeScript side stores.

    Returns None for anything malformed or absolute rather than guessing.
    """
    normalised = name.replace("\\", "/")

    # Absolute paths, and Windows drive letters, never appear in a GitHub
    # archive. Reject them outright: stripping a leading segment from an
    # absolute path would silently re-root it somewhere unexpected.
    if normalised.startswith("/") or re.match(r"^[A-Za-z]:", normalised):
        return None

    parts: list[str] = []
    for part in normalised.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            return None
        parts.append(part)

    if len(parts) < 2:
        # No root directory to strip, so the layout is not what we expect.
        return None

    # Drop the `{owner}-{repo}-{sha}` root directory.
    return "/".join(parts[1:]) or None