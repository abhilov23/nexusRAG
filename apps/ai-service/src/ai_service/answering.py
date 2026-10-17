"""Answer generation.

Retrieval and graph traversal have already narrowed the repository down to a
small set of grounded chunks. This module's only job is to turn that into an
answer the user can check: no claim without a citation, and an explicit refusal
when the sources do not cover the question.

The model host, name and key come from LLM_BASE_URL / LLM_MODEL / LLM_API_KEY,
so the vendor is chosen in configuration rather than in code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ai_service import ai
from ai_service.config import Settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are NexusRAG, answering questions about a codebase.

Rules:
- Answer only from the <source> blocks provided. They are the retrieved code.
- Cite every claim with the source id and path, like [3] or [3: src/auth.ts].
- If the sources do not contain the answer, say so plainly and name what is missing.
- Never invent file paths, symbols, or behaviour that are not in the sources.
- Be concise. Quote the relevant code rather than describing it vaguely."""


@dataclass
class Source:
    index: int
    repository_id: str
    path: str
    start_line: int
    end_line: int
    symbol: str | None
    language: str

    def open_tag(self) -> str:
        symbol = f' symbol="{self.symbol}"' if self.symbol else ""
        return (
            f'<source id="{self.index}" path="{self.path}" '
            f'lines="{self.start_line}-{self.end_line}"{symbol}>'
        )


@dataclass
class Answer:
    text: str
    sources: list[Source] = field(default_factory=list)
    model: str = ""
    grounded: bool = True
    prompt_tokens: int = 0
    completion_tokens: int = 0


def build_prompt(
    question: str, sources: list[Source], chunks: list[dict[str, object]]
) -> str:
    blocks = [
        f"{source.open_tag()}\n{chunk.get('content', '')}\n</source>"
        for source, chunk in zip(sources, chunks, strict=True)
    ]
    return f"{question}\n\n" + "\n\n".join(blocks)


class NoApiKeyError(RuntimeError):
    """Raised when answer generation is attempted without credentials."""


def generate_answer(
    question: str,
    sources: list[Source],
    chunks: list[dict[str, object]],
    settings: Settings,
) -> Answer:
    """Call the configured chat provider and return a cited answer.

    Refuses rather than answering without sources: an uncited answer is worse
    than none, because the user cannot tell it apart from a correct one.
    """
    if not sources:
        return Answer(
            text=(
                "I could not find anything in the indexed repositories that covers "
                "this. Try rephrasing, or check that the relevant repository has "
                "finished indexing."
            ),
            sources=[],
            grounded=False,
        )

    key = settings.resolved_llm_api_key
    if not key or key.strip() in ("", "...", "changeme"):
        raise NoApiKeyError("No chat API key configured")

    result = ai.chat(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_prompt(question, sources, chunks)},
        ],
        settings,
        temperature=0.1,
    )

    return Answer(
        text=result.text,
        sources=sources,
        model=settings.llm_model,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
    )


__all__ = [
    "SYSTEM_PROMPT",
    "Answer",
    "NoApiKeyError",
    "Source",
    "build_prompt",
    "generate_answer",
]
