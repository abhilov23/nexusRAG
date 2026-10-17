"""File-extension to Tree-sitter language mapping.

Kept explicit rather than guessed: an unmapped extension is a cheap skip, but a
*wrong* mapping produces confident garbage chunks.
"""

from __future__ import annotations

from functools import lru_cache

from tree_sitter_language_pack import get_parser

# Directories that never contain source worth indexing.
IGNORED_DIRECTORIES = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        "vendor",
        "dist",
        "build",
        "out",
        "target",
        ".next",
        ".turbo",
        ".venv",
        "venv",
        "__pycache__",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        "coverage",
        ".gradle",
        ".idea",
        ".vscode",
        "bower_components",
        ".tox",
    }
)

# Binary/asset extensions that are never code.
IGNORED_EXTENSIONS = frozenset(
    {
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".avif",
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
        ".pdf", ".zip", ".gz", ".tar", ".bz2", ".xz", ".7z", ".rar",
        ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv", ".webm",
        ".so", ".dylib", ".dll", ".exe", ".bin", ".o", ".a", ".class", ".jar",
        ".pyc", ".pyo", ".wasm",
        ".lock", ".sum",
    }
)

EXTENSION_LANGUAGES: dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".hh": "cpp",
    ".cs": "c_sharp",
    ".swift": "swift",
    ".m": "objc",
    ".mm": "objc",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".sql": "sql",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "scss",
    ".less": "css",
    ".vue": "vue",
    ".svelte": "svelte",
    ".lua": "lua",
    ".pl": "perl",
    ".r": "r",
    ".dart": "dart",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hs": "haskell",
    ".ml": "ocaml",
    ".clj": "clojure",
    ".zig": "zig",
    ".nim": "nim",
    ".sol": "solidity",
    ".tf": "hcl",
    ".hcl": "hcl",
    ".proto": "proto",
    ".graphql": "graphql",
    ".gql": "graphql",
}

# Extensionless files that are still code.
FILENAME_LANGUAGES: dict[str, str] = {
    "Makefile": "make",
    "Dockerfile": "dockerfile",
    "Rakefile": "ruby",
    "Gemfile": "ruby",
    "BUILD": "bazel",
    "WORKSPACE": "starlark",
}


def is_ignored_path(path: str) -> bool:
    """True when the path should be skipped before it is even opened."""
    parts = path.split("/")
    if any(part in IGNORED_DIRECTORIES for part in parts[:-1]):
        return True
    name = parts[-1]
    if not name:
        return True
    if name in IGNORED_EXTENSIONS:
        return True
    dot = name.rfind(".")
    if dot <= 0:
        return name not in FILENAME_LANGUAGES
    return name[dot:].lower() in IGNORED_EXTENSIONS


def language_for(path: str) -> str | None:
    """Resolve the Tree-sitter language for a repository-relative path."""
    name = path.rsplit("/", 1)[-1]
    if name in FILENAME_LANGUAGES:
        return FILENAME_LANGUAGES[name]

    dot = name.rfind(".")
    if dot <= 0:
        return None
    return EXTENSION_LANGUAGES.get(name[dot:].lower())


@lru_cache(maxsize=64)
def parser_for(language: str):
    """Return a cached Tree-sitter parser, or None if the grammar is unavailable."""
    try:
        return get_parser(language)  # type: ignore[no-any-return]
    except Exception:
        return None