"""Settings for the AI service.

The monorepo keeps a single ``.env`` at its root, so this resolves that path
explicitly rather than relying on the process working directory -- the same
reasoning @repo/database uses on the TypeScript side.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Queue ---------------------------------------------------------------
    redis_url: str = Field(default="redis://localhost:6379")
    # The indexing stage's queue. Separate from the archive-ingestion queue the
    # TypeScript worker consumes -- two consumers on one queue race for jobs.
    queue_name: str = Field(default="repository-indexing", alias="INDEXING_QUEUE_NAME")
    ingestion_queue_name: str = Field(
        default="repository-ingestion", alias="INGESTION_QUEUE_NAME"
    )

    # --- Object storage (S3-compatible: Cloudflare R2 or MinIO) --------------
    # Generic S3_* wins when S3_ENDPOINT is set, matching @repo/storage on the
    # TypeScript side, so both stacks agree on which bucket is in use.
    s3_endpoint: str | None = Field(default=None, alias="S3_ENDPOINT")
    s3_access_key: str | None = Field(default=None, alias="S3_ACCESS_KEY")
    s3_secret_key: str | None = Field(default=None, alias="S3_SECRET_KEY")
    s3_bucket: str | None = Field(default=None, alias="S3_BUCKET")

    r2_account_id: str | None = Field(default=None, alias="CLOUDFLARE_ACCOUNT_ID")
    r2_endpoint: str | None = Field(default=None, alias="R2_ENDPOINT")
    r2_access_key_id: str | None = Field(default=None, alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(default=None, alias="R2_SECRET_ACCESS_KEY")
    r2_bucket: str | None = Field(default=None, alias="R2_BUCKET_NAME")

    # --- Vector store --------------------------------------------------------
    qdrant_url: str = Field(default="http://localhost:6333")
    qdrant_api_key: str | None = Field(default=None, alias="QDRANT_API_KEY")
    qdrant_collection: str = Field(default="code_chunks")

    # --- Lexical search (Elasticsearch) ---------------------------------------
    # None rather than a localhost default: lexical indexing is optional, and
    # defaulting to a URL makes every run attempt a connection that will time
    # out when no cluster is configured.
    elasticsearch_url: str | None = Field(default=None, alias="ELASTICSEARCH_URL")
    elasticsearch_api_key: str | None = Field(default=None, alias="ELASTICSEARCH_API_KEY")
    elasticsearch_username: str | None = Field(default=None, alias="ELASTICSEARCH_USERNAME")
    elasticsearch_password: str | None = Field(default=None, alias="ELASTICSEARCH_PASSWORD")

    # --- Code graph (Neo4j) --------------------------------------------------
    neo4j_uri: str | None = Field(default=None, alias="NEO4J_URI")
    neo4j_username: str | None = Field(default=None, alias="NEO4J_USERNAME")
    neo4j_password: str | None = Field(default=None, alias="NEO4J_PASSWORD")

    # --- AI endpoints --------------------------------------------------------
    # Chat and embeddings are configured separately, so each can point at a
    # different host, model and key. The wire format is the OpenAI one, which
    # most hosted inference servers accept unchanged -- so switching vendor is
    # a .env edit, not a code change.
    #
    # LLM_API_KEY / EMBEDDING_API_KEY each fall back to OPENAI_API_KEY, and
    # EMBEDDING_BASE_URL falls back to LLM_BASE_URL, so setting one host and key
    # is enough for the common case.
    llm_base_url: str = Field(default="https://api.openai.com/v1", alias="LLM_BASE_URL")
    llm_model: str = Field(default="gpt-4o-mini", alias="LLM_MODEL")
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")
    # Cost telemetry, not billing. Keep these aligned with the configured model
    # so the dashboard shows a real estimate instead of a hardcoded number.
    llm_input_cost_per_1m: float = Field(
        default=0.15, alias="LLM_INPUT_COST_PER_1M"
    )
    llm_output_cost_per_1m: float = Field(
        default=0.60, alias="LLM_OUTPUT_COST_PER_1M"
    )

    embedding_base_url: str | None = Field(default=None, alias="EMBEDDING_BASE_URL")
    embedding_model: str = Field(default="text-embedding-3-small", alias="EMBEDDING_MODEL")
    embedding_dimensions: int = Field(default=1536, alias="EMBEDDING_DIMENSIONS")
    embedding_api_key: str | None = Field(default=None, alias="EMBEDDING_API_KEY")
    embedding_batch_size: int = Field(default=64, alias="EMBEDDING_BATCH_SIZE")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")

    max_file_bytes: int = Field(default=2 * 1024 * 1024, alias="MAX_FILE_BYTES")
    max_archive_bytes: int = Field(default=512 * 1024 * 1024, alias="MAX_ARCHIVE_BYTES")

    # --- Indexing completion callback ------------------------------------------
    # The web app marks a repository INDEXING once its archive is stored; this
    # worker reports back when vectors are actually written (or terminally
    # failed) so READY always means searchable. Bearer-shared secret, never a
    # session cookie.
    internal_api_key: str | None = Field(default=None, alias="INTERNAL_API_KEY")
    web_base_url: str = Field(default="http://localhost:3000", alias="WEB_BASE_URL")

    # --- Resolved AI settings -------------------------------------------------

    @property
    def resolved_llm_api_key(self) -> str | None:
        return self.llm_api_key or self.openai_api_key

    @property
    def resolved_embedding_api_key(self) -> str | None:
        """Embeddings fall back through every credential the operator set.

        LLM_API_KEY is included deliberately: it is the primary variable someone
        configures first, and omitting it would silently produce deterministic
        vectors that cannot be searched -- the worst possible failure mode here.
        """
        return (
            self.embedding_api_key or self.llm_api_key or self.openai_api_key
        )

    @property
    def resolved_embedding_base_url(self) -> str:
        """Embeddings default to the LLM host: they are usually the same vendor."""
        return self.embedding_base_url or self.llm_base_url

    def estimate_llm_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Estimated USD cost from configured per-million token rates.

        This is intentionally an estimate: providers bill cached tokens,
        reasoning tokens and rounding differently. The dashboard labels it as
        an estimate rather than pretending it is an invoice.
        """
        return (
            prompt_tokens / 1_000_000 * self.llm_input_cost_per_1m
            + completion_tokens / 1_000_000 * self.llm_output_cost_per_1m
        )

    def require_storage(self) -> tuple[str, str, str, str]:
        """Return (endpoint, access_key, secret_key, bucket), whichever provider is set.

        Raises a message naming the exact missing variables, so the failure points
        at the .env rather than at a generic boto3 credential error.
        """
        # Generic S3/MinIO takes priority, matching @repo/storage in TypeScript.
        if self.s3_endpoint:
            required = {
                "S3_ENDPOINT": self.s3_endpoint,
                "S3_ACCESS_KEY": self.s3_access_key,
                "S3_SECRET_KEY": self.s3_secret_key,
                "S3_BUCKET": self.s3_bucket,
            }
            missing = [name for name, value in required.items() if not value]
            if missing:
                raise RuntimeError(
                    "Incomplete S3 configuration, missing: " + ", ".join(missing)
                )
            return (
                str(required["S3_ENDPOINT"]),
                str(required["S3_ACCESS_KEY"]),
                str(required["S3_SECRET_KEY"]),
                str(required["S3_BUCKET"]),
            )

        endpoint = self.r2_endpoint or (
            f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
            if self.r2_account_id
            else None
        )
        required = {
            "CLOUDFLARE_ACCOUNT_ID (or R2_ENDPOINT)": endpoint,
            "R2_ACCESS_KEY_ID": self.r2_access_key_id,
            "R2_SECRET_ACCESS_KEY": self.r2_secret_access_key,
            "R2_BUCKET_NAME": self.r2_bucket,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(
                "Incomplete R2 configuration, missing: " + ", ".join(missing)
            )
        return (
            str(endpoint),
            str(self.r2_access_key_id),
            str(self.r2_secret_access_key),
            str(self.r2_bucket),
        )

    @property
    def storage_bucket(self) -> str:
        """Bucket name for archive reads, resolved from whichever provider is set."""
        return self.require_storage()[3]


@lru_cache
def get_settings() -> Settings:
    return Settings()