"""Answer generation.

Retrieval and graph traversal have already narrowed the repository down to a
small set of grounded chunks. This module's only job is to turn that into an
answer the user can check: no claim without a citation, and an explicit refusal
when the sources do not cover the question.

The model host, name and key come from LLM_BASE_URL / LLM_MODEL / LLM_API_KEY,
so the vendor is chosen in configuration rather than in code.
"""

from __future__ import annotations

import json
import logging
import re
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

JUDGE_PROMPT = """You are a strict evaluator of retrieval-augmented answers.

Score two dimensions independently, from 0.0 to 1.0:
- faithfulness: every factual claim in the answer is supported by the supplied
  retrieved context. A refusal or a statement that the context is insufficient
  is faithful when the context genuinely lacks the answer.
- relevance: the answer actually addresses the question, rather than merely
  repeating nearby source code.

Return ONLY a JSON object with this shape:
{"faithfulness": 0.0, "relevance": 0.0, "rationale": "one sentence, at most 25 words"}

Do not add markdown fences or any text outside the JSON object."""


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


@dataclass
class JudgeResult:
    faithfulness: float
    relevance: float
    rationale: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


_JUDGE_SCORE = re.compile(
    r"""["']?(faithfulness|relevance)["']?\s*:\s*(-?\d+(?:\.\d+)?)""",
    re.IGNORECASE,
)
_JUDGE_RATIONALE = re.compile(r"""["']rationale["']\s*:\s*"((?:\\.|[^"\\])*)\"""")


def _parse_judge_json(text: str) -> dict[str, object]:
    """Read the judge's JSON, tolerating fences and truncated rationales.

    Models sometimes wrap JSON in markdown or hit the token limit while writing
    the rationale. The scores are emitted first, so they are still recoverable
    even when the trailing rationale is cut off. A missing score is never
    guessed: that still raises.
    """
    stripped = text.strip()
    candidates = [stripped]

    fenced = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
    fenced = re.sub(r"\s*```$", "", fenced)
    if fenced != stripped:
        candidates.append(fenced)

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        candidates.append(stripped[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and (
            "faithfulness" in parsed or "relevance" in parsed
        ):
            return parsed

    # A truncated response can still contain complete score fields.
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", stripped):
        try:
            parsed, _ = decoder.raw_decode(stripped[match.start() :])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "faithfulness" in parsed and "relevance" in parsed:
            return parsed

    scores: dict[str, float] = {}
    for name, raw in _JUDGE_SCORE.findall(stripped):
        scores.setdefault(name.lower(), float(raw))
    if "faithfulness" in scores and "relevance" in scores:
        logger.warning("judge response was truncated; recovered its score fields")
        recovered: dict[str, object] = dict(scores)
        rationale = _JUDGE_RATIONALE.search(stripped)
        if rationale:
            try:
                recovered["rationale"] = json.loads(f'"{rationale.group(1)}"')
            except json.JSONDecodeError:
                recovered["rationale"] = rationale.group(1)
        return recovered

    raise RuntimeError("The judge response was not usable JSON")


def _score(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RuntimeError(f"The judge response omitted {name}")
    return max(0.0, min(1.0, float(value)))


def judge_answer(
    question: str,
    answer: str,
    context: str,
    settings: Settings,
) -> JudgeResult:
    """Score faithfulness and relevance with the configured chat model.

    This is a model judgement, not ground truth. It is exposed as a separate,
    explicitly-labelled metric so it is never confused with retrieval precision,
    which is computed against user-supplied expected paths.
    """
    key = settings.resolved_llm_api_key
    if not key or key.strip() in ("", "...", "changeme"):
        raise NoApiKeyError("No chat API key configured")

    result = ai.chat(
        [
            {"role": "system", "content": JUDGE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Question:\n{question}\n\n"
                    f"Answer:\n{answer}\n\n"
                    f"Retrieved context:\n{context}"
                ),
            },
        ],
        settings,
        temperature=0.0,
        max_tokens=800,
    )

    parsed = _parse_judge_json(result.text)
    rationale = parsed.get("rationale")
    return JudgeResult(
        faithfulness=_score(parsed.get("faithfulness"), "faithfulness"),
        relevance=_score(parsed.get("relevance"), "relevance"),
        rationale=rationale[:2000] if isinstance(rationale, str) else "",
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
    )


__all__ = [
    "JUDGE_PROMPT",
    "SYSTEM_PROMPT",
    "Answer",
    "JudgeResult",
    "NoApiKeyError",
    "Source",
    "build_prompt",
    "generate_answer",
    "judge_answer",
]
