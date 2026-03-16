"""Command line interface for the boxed PM builder."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .parser import parse_boxed_pm
from .paths import PROCESSED_BOXED_PM_DIR, RAW_BOXED_PM_DIR


def _iter_raw_files(directory: Path) -> Iterable[Path]:
    """Return the raw report files in a stable order."""

    return sorted(directory.glob("*.txt"))


def _has_valid_subprimal_values(output_path: Path) -> bool:
    try:
        obj = json.loads(output_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    sections = obj.get("sub_primal_negotiated_cut_prices", {})
    if not isinstance(sections, dict):
        return False
    for rows in sections.values():
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            if row.get("weighted_average") is not None:
                return True
    return False


def run() -> None:
    """Process raw boxed PM text files into JSON payloads."""

    os.makedirs(PROCESSED_BOXED_PM_DIR, exist_ok=True)

    for file in _iter_raw_files(RAW_BOXED_PM_DIR):
        date_str = file.stem.split("_")[0]
        output_path = PROCESSED_BOXED_PM_DIR / f"{date_str}.json"
        if output_path.exists() and _has_valid_subprimal_values(output_path):
            continue

        text = file.read_text(encoding="utf-8", errors="ignore")
        parsed = parse_boxed_pm(text)
        with open(output_path, "w") as f:
            json.dump(parsed, f, indent=2)
        print(f"Processed {file.name} -> {output_path.name}")


def main() -> int:  # pragma: no cover - CLI wrapper
    """Run the boxed PM builder as a CLI."""

    run()
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
