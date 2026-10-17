"""Calls to the configured model host.

Chat and embeddings both go over HTTP to whatever host is in the environment.
The default is OpenAI, but the wire format is the OpenAI one, which most hosted
inference servers implement -- so changing the host is a `.env` edit, not a code
change.

    LLM_BASE_URL=https://your-host/v1
    LLM_MODEL=your-model
    LLM_API_KEY=your-key
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from ai_service.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class ChatResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


def _post(
    url: str,
    payload: dict[str, Any],
    api_key: str | None,
    timeout: int = 60,
) -> dict[str, Any]:
    """POST JSON and return the parsed response.

    Errors are logged, never returned to a client: provider errors can carry
    account, quota and routing detail.
    """
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        logger.error("model host returned HTTP %s for %s", error.code, url)
        raise RuntimeError("The model provider rejected the request") from error
    except urllib.error.URLError as error:
        logger.error("could not reach %s: %s", url, error.reason)
        raise RuntimeError("Could not reach the model provider") from error


def chat(
    messages: list[dict[str, str]],
    settings: Settings,
    *,
    temperature: float = 0.1,
    max_tokens: int | None = None,
) -> ChatResult:
    """Call the chat model at LLM_BASE_URL."""
    key = settings.resolved_llm_api_key
    if not key:
        raise RuntimeError("No chat API key configured (LLM_API_KEY or OPENAI_API_KEY)")

    payload: dict[str, Any] = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens

    body = _post(f"{settings.llm_base_url.rstrip('/')}/chat/completions", payload, key)

    try:
        text = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as error:
        raise RuntimeError("The chat response had no message content") from error

    usage = body.get("usage", {})
    return ChatResult(
        text=text,
        prompt_tokens=int(usage.get("prompt_tokens", 0)),
        completion_tokens=int(usage.get("completion_tokens", 0)),
    )


def embed(texts: list[str], settings: Settings) -> list[list[float]]:
    """Embed text at EMBEDDING_BASE_URL.

    Falls back to deterministic vectors when no key is configured, so
    development works without credentials. Those vectors are stable but carry no
    meaning -- retrieval quality in that mode is not real.
    """
    if not texts:
        return []

    key = settings.resolved_embedding_api_key
    if not key:
        logger.warning(
            "No embedding API key configured; using deterministic embeddings. "
            "Vectors written in this mode are NOT semantically searchable."
        )
        return [deterministic(text, settings.embedding_dimensions) for text in texts]

    payload = {"model": settings.embedding_model, "input": texts}
    body = _post(
        f"{settings.resolved_embedding_base_url.rstrip('/')}/embeddings", payload, key
    )

    try:
        return [item["embedding"] for item in body["data"]]
    except (KeyError, TypeError) as error:
        raise RuntimeError("The embedding response had no data array") from error


def embed_batched(
    chunks: list[Any], settings: Settings, batch_size: int | None = None
) -> list[list[float]]:
    """Embed chunks in batches, preserving order.

    Batching here rather than per-call so indexing a repository is a handful of
    requests instead of thousands.
    """
    size = batch_size or settings.embedding_batch_size
    vectors: list[list[float]] = []
    for start in range(0, len(chunks), size):
        batch = chunks[start : start + size]
        vectors.extend(embed([c.to_embedding_text() for c in batch], settings))
    return vectors


def deterministic(text: str, size: int = 1536) -> list[float]:
    """Stable hash-based vector. Useful offline; not a semantic embedding."""
    import hashlib
    import math

    values: list[float] = []
    counter = 0
    while len(values) < size:
        digest = hashlib.sha256(f"{counter}:{text}".encode()).digest()
        for byte in digest:
            if len(values) == size:
                break
            values.append((byte / 127.5) - 1.0)
        counter += 1
    norm = math.sqrt(sum(v * v for v in values)) or 1.0
    return [v / norm for v in values]


def dimensions(settings: Settings) -> int:
    return settings.embedding_dimensions