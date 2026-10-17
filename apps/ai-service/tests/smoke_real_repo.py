"""Chunk every real source file in the monorepo and report what happened.

Not a pass/fail test -- it is the smoke check that the extension map and grammar
set actually cover the languages this repository is written in.
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from ai_service.parsing import chunk_file, is_ignored_path, language_for

REPO_ROOT = Path(__file__).resolve().parents[3]
SKIP_DIRS = {"node_modules", ".git", ".next", ".venv", "dist", "generated", ".turbo", "__pycache__"}


def main() -> int:
    counts: Counter[str] = Counter()
    errors: Counter[str] = Counter()
    total_chunks = 0
    total_bytes = 0
    symbols = 0
    files = 0

    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        if is_ignored_path(rel):
            continue

        language = language_for(rel)
        if language is None:
            continue

        try:
            source = path.read_bytes()
        except OSError:
            continue

        result = chunk_file(rel, source)
        files += 1
        counts[language] += 1

        if result.error:
            errors[result.error] += 1
            continue

        total_chunks += len(result.chunks)
        total_bytes += sum(len(c.content.encode()) for c in result.chunks)
        symbols += sum(1 for c in result.chunks if c.symbol)

    print(f"files chunked : {files}")
    print(f"chunks        : {total_chunks}")
    print(f"named symbols : {symbols} ({symbols * 100 // max(total_chunks, 1)}% of chunks)")
    print(f"chunk bytes   : {total_bytes:,}")
    print("by language   :", dict(counts.most_common()))
    if errors:
        print("ERRORS        :", dict(errors))
    else:
        print("errors        : none")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())