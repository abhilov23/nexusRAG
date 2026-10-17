"""Storage configuration resolution.

Covers the R2 vs generic S3/MinIO split, which both stacks have to agree on or
the TypeScript worker writes to a different bucket than Python reads.
"""

from __future__ import annotations

import pytest

from ai_service.config import Settings


def test_missing_storage_names_every_absent_variable():
    settings = Settings(
        _env_file=None,
        S3_ENDPOINT=None,
        S3_ACCESS_KEY=None,
        S3_SECRET_KEY=None,
        S3_BUCKET=None,
        CLOUDFLARE_ACCOUNT_ID=None,
        R2_ACCESS_KEY_ID=None,
        R2_SECRET_ACCESS_KEY=None,
        R2_BUCKET_NAME=None,
    )

    with pytest.raises(RuntimeError) as caught:
        settings.require_storage()

    message = str(caught.value)
    assert "CLOUDFLARE_ACCOUNT_ID" in message
    assert "R2_ACCESS_KEY_ID" in message
    assert "R2_BUCKET_NAME" in message


def test_r2_endpoint_is_derived_from_the_account_id():
    settings = Settings(
        _env_file=None,
        S3_ENDPOINT=None,
        CLOUDFLARE_ACCOUNT_ID="acct123",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
        R2_BUCKET_NAME="snapshots",
    )

    endpoint, access_key, secret_key, bucket = settings.require_storage()

    assert endpoint == "https://acct123.r2.cloudflarestorage.com"
    assert (access_key, secret_key, bucket) == ("key", "secret", "snapshots")
    assert settings.storage_bucket == "snapshots"


def test_explicit_r2_endpoint_overrides_the_derived_one():
    settings = Settings(
        _env_file=None,
        S3_ENDPOINT=None,
        CLOUDFLARE_ACCOUNT_ID="acct123",
        R2_ENDPOINT="https://custom.example",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
        R2_BUCKET_NAME="snapshots",
    )

    endpoint, *_ = settings.require_storage()
    assert endpoint == "https://custom.example"


def test_minio_wins_when_s3_endpoint_is_present():
    """Generic S3 takes priority, matching @repo/storage on the TypeScript side."""
    settings = Settings(
        _env_file=None,
        S3_ENDPOINT="http://localhost:9000",
        S3_ACCESS_KEY="minioadmin",
        S3_SECRET_KEY="minioadmin",
        S3_BUCKET="archives",
        CLOUDFLARE_ACCOUNT_ID="acct123",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
        R2_BUCKET_NAME="snapshots",
    )

    endpoint, access_key, secret_key, bucket = settings.require_storage()

    assert endpoint == "http://localhost:9000"
    assert bucket == "archives"
    assert settings.storage_bucket == "archives"


def test_partial_minio_config_is_rejected_not_silently_r2():
    settings = Settings(
        _env_file=None,
        S3_ENDPOINT="http://localhost:9000",
        S3_ACCESS_KEY="minioadmin",
        S3_SECRET_KEY=None,
        S3_BUCKET="archives",
        CLOUDFLARE_ACCOUNT_ID="acct123",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
        R2_BUCKET_NAME="snapshots",
    )

    with pytest.raises(RuntimeError, match="S3_SECRET_KEY"):
        settings.require_storage()