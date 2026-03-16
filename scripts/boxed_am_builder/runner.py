"""File processing entry point for boxed AM parsing."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .parser import parse_boxed_am
from .paths import PROCESSED_BOXED_AM_DIR, RAW_BOXED_AM_DIR


def iter_raw_reports() -> Iterable[Path]:
    """Yield raw report files in ascending order."""

    return sorted(RAW_BOXED_AM_DIR.glob("*.txt"))


def build_output_path(raw_file: Path) -> Path:
    """Return the processed JSON path for a raw report file."""

    date_str = raw_file.stem.split("_")[0]
    return PROCESSED_BOXED_AM_DIR / f"{date_str}.json"


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
    """Parse all new raw boxed AM reports into JSON payloads."""

    os.makedirs(PROCESSED_BOXED_AM_DIR, exist_ok=True)

    for raw_file in iter_raw_reports():
        output_path = build_output_path(raw_file)
        if output_path.exists() and _has_valid_subprimal_values(output_path):
            continue
        text = raw_file.read_text(encoding="utf-8", errors="ignore")
        parsed = parse_boxed_am(text)
        with open(output_path, "w", encoding="utf-8") as fh:
            json.dump(parsed, fh, indent=2)
