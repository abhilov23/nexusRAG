# AI Service

The code-understanding half of NexusRAG. It owns parsing, chunking, embeddings
and indexing; the TypeScript side owns ingestion.

```text
GitHub ──▶ worker (TS) ──▶ BullMQ ──▶ ai-service (Python) ──▶ Qdrant
                    │                      ▲
                    └──▶ R2 snapshot ──────┘
```

## Why Python

Tree-sitter grammars, embedding models and retrieval code are Python-first. Keeping
them here means the ingestion orchestration stays in one TypeScript codebase and the
AI work sits behind a clean seam.

## How it talks to the rest of the app

This service **consumes the same BullMQ queue** the TypeScript producer writes to.
There is no HTTP hop on the indexing path.

> **Caution:** BullMQ has no official Python client. `src/ai_service/bullmq/protocol.py`
> reimplements the parts of its Redis wire format a worker needs (verified against
> bullmq 5.81.5). If BullMQ changes its protocol, or we move to a different queue,
> **that one file is the only thing to change**. Nothing outside it knows the format.

The FastAPI app (`src/ai_service/main.py`) exists for health and readiness only —
it is not a data plane.

## Running

```bash
# from the repo root
pnpm ai:install     # uv sync
pnpm ai:test        # pytest + ruff
pnpm ai:dev         # FastAPI on :8000
pnpm ai:worker      # queue consumer
```

Configuration comes from the monorepo-root `.env`; see `src/ai_service/config.py`.

## Environment

| Variable                                                                    | Required            | Purpose           |
| --------------------------------------------------------------------------- | ------------------- | ----------------- |
| `REDIS_URL`                                                                 | yes                 | BullMQ queue      |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | yes                 | Reading snapshots |
| `QDRANT_URL`, `QDRANT_API_KEY`                                              | yes                 | Vector store      |
| `OPENAI_API_KEY`                                                            | for real embeddings | Embeddings        |

Without `OPENAI_API_KEY` the service falls back to `DeterministicEmbeddings`, which
produces stable but **semantically meaningless** vectors. That mode exists so the
plumbing is testable; it logs a warning and must not be used for retrieval quality.

## Layout

```text
src/ai_service/
├── main.py              # FastAPI: /health, /ready
├── worker.py            # queue consumer entrypoint
├── config.py            # settings, reads the root .env
├── pipeline.py          # snapshot -> chunks -> vectors
├── bullmq/
│   ├── protocol.py      # the ONLY file that knows the BullMQ wire format
│   └── consumer.py      # reserve / complete / fail with backoff
├── parsing/
│   ├── languages.py     # extension -> grammar, path filtering
│   └── chunker.py       # Tree-sitter code-aware splitting
├── embedding/
│   └── provider.py      # OpenAI + deterministic
└── storage/
    ├── snapshots.py     # stream tar.gz out of R2
    └── vectors.py       # Qdrant upsert/delete
```

## Chunking

Chunks follow Tree-sitter structure (functions, classes, methods) rather than byte
offsets, so each chunk keeps its symbol name and file-level imports. That metadata is
prepended to the embedded text, which is what lets a bare fragment retrieve well for
questions like "where is auth handled".

Smoke-check it against a real codebase:

```bash
uv run python tests/smoke_real_repo.py
```

## Tests

```bash
uv run pytest              # 18 tests, no network required
uv run python tests/smoke_real_repo.py   # chunk every file in this repo
```

`tests/protocol_check.py` is the cross-language check: it needs a live Redis and
drives a job enqueued by the Node producer through success, retry and terminal
failure.
