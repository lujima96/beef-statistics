"""Utilities for verifying processed JSON files against raw text sources."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable, List


def compare_raw_processed(
    raw_dir: Path,
    processed_dir: Path,
    parser: Callable[[Path], dict],
    *,
    limit: int | None = None,
) -> List[Path]:
    """Return raw files whose parsed content differs from existing JSON.

    Parameters
    ----------
    raw_dir: Path
        Directory containing raw ``.txt`` files.
    processed_dir: Path
        Directory containing processed ``.json`` files with matching stems.
    parser: Callable[[Path], dict]
        Function that parses a raw text file into a dictionary.
    limit: int | None
        If provided, only the first ``limit`` raw files are checked.
    """
    mismatches: List[Path] = []
    raw_files = sorted(raw_dir.glob("*.txt"))
    if limit is not None:
        raw_files = raw_files[:limit]

    for raw_path in raw_files:
        proc_path = processed_dir / f"{raw_path.stem}.json"
        if not proc_path.exists():
            mismatches.append(raw_path)
            continue
        parsed = parser(raw_path)
        existing = json.loads(proc_path.read_text(encoding="utf-8"))
        if parsed != existing:
            mismatches.append(raw_path)
    return mismatches


def main() -> int:
    """Validate equivalency index processed files match their raw sources."""
    try:
        from scripts.equiv_index_builder import raw_index_parser
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Failed to import parser: {exc}")
        return 1

    mismatches = compare_raw_processed(
        raw_index_parser.RAW_DIR,
        raw_index_parser.OUT_DIR,
        raw_index_parser.parse_file,
    )
    if mismatches:
        for p in mismatches:
            print(f"Mismatch: {p.name}")
        return 1
    print("All processed files match their raw sources.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
