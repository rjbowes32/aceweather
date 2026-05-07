from __future__ import annotations

from pathlib import Path
import sys

MAX_LINES = 400
ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "public",
]
SUFFIXES = {".js", ".css", ".html"}
EXCLUDED = {
    ROOT / "public" / "openapi.json",
    ROOT / "public" / "llms.txt",
    ROOT / "public" / "report-api.md",
}


def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for _ in handle)


def main() -> int:
    offenders: list[tuple[Path, int]] = []
    for target in TARGETS:
        for path in target.rglob("*"):
            if not path.is_file() or path.suffix not in SUFFIXES or path in EXCLUDED:
                continue
            lines = count_lines(path)
            if lines > MAX_LINES:
                offenders.append((path, lines))

    if offenders:
        print(f"UI file length check failed. Max allowed lines per file: {MAX_LINES}")
        for path, lines in sorted(offenders):
            print(f"- {path.relative_to(ROOT)}: {lines} lines")
        return 1

    print(f"UI file length check passed. All checked files are <= {MAX_LINES} lines.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
