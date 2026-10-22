import pytest

from ai_service.answering import _parse_judge_json, _score


def test_parses_plain_json() -> None:
    parsed = _parse_judge_json(
        '{"faithfulness": 0.9, "relevance": 0.8, "rationale": "Supported."}'
    )

    assert parsed["faithfulness"] == 0.9
    assert parsed["relevance"] == 0.8
    assert parsed["rationale"] == "Supported."


def test_parses_json_inside_markdown_fence() -> None:
    parsed = _parse_judge_json(
        '```json\n{"faithfulness": 1, "relevance": 0.7, "rationale": "Grounded."}\n```'
    )

    assert parsed["faithfulness"] == 1
    assert parsed["relevance"] == 0.7


def test_recovers_scores_from_truncated_rationale() -> None:
    parsed = _parse_judge_json(
        '{"faithfulness": 0.95, "relevance": 0.97, "rationale": "Every cited claim '
        "is traceable to the retrieved sources and the answer addresses"
    )

    assert parsed["faithfulness"] == 0.95
    assert parsed["relevance"] == 0.97
    assert "rationale" not in parsed


def test_recovers_scores_from_text_with_surrounding_prose() -> None:
    parsed = _parse_judge_json(
        'Here is the score: {"faithfulness": 0.4, "relevance": 0.6}'
    )

    assert parsed["faithfulness"] == 0.4
    assert parsed["relevance"] == 0.6


def test_rejects_response_without_scores() -> None:
    with pytest.raises(RuntimeError, match="usable JSON"):
        _parse_judge_json('{"rationale": "No scores here."}')


def test_scores_are_clamped() -> None:
    assert _score(1.4, "faithfulness") == 1.0
    assert _score(-0.2, "relevance") == 0.0
