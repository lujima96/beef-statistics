"""Parsers for sections of the boxed PM report."""

from __future__ import annotations

import re
from typing import Any


_HEADER_PATTERN = re.compile(r"\b(IMPS/FL|Sub-Primal|Trades|Pounds|Price|Weighted)\b")
_IMPS_PATTERN = re.compile(r"^\d+[A-Z0-9]*$")
_FAT_LIMIT_PATTERN = re.compile(r"^[1-6]$")
_INTEGER_PATTERN = re.compile(r"^[\d,]+$")
_RANGE_PATTERN = re.compile(r"^[-\d,\.]+\s*-\s*[-\d,\.]+$")
_NOISE_PATTERNS = (
    re.compile(r"^Page \d+ of \d+$", re.I),
    re.compile(r"^=== PAGE \d+ ===$", re.I),
    re.compile(r"^(National Daily Boxed Beef|Agricultural Marketing Service|Livestock, Poultry, and Grain Market News)", re.I),
    re.compile(r"^(Morning|Afternoon|Source:|USDA Livestock|General inquiries, please call:|User Guides @|XML Format|www\.ams\.usda\.gov|https?://)", re.I),
    re.compile(r"^LM_XB\d+$", re.I),
    re.compile(r"^Email us with accessibility issues", re.I),
)


def parse_subprimal_section(section: str) -> list[dict[str, Any]]:
    """Parse tabulated sub-primal data."""

    entries: list[dict[str, Any]] = []
    last_imps: str | None = None
    lines = [line.strip() for line in section.splitlines() if not _is_noise_line(line)]
    i = 0
    while i < len(lines):
        token = lines[i]
        current_imps: str | None = None
        fat_limit: str | None = None

        if _IMPS_PATTERN.fullmatch(token) and i + 1 < len(lines) and _FAT_LIMIT_PATTERN.fullmatch(lines[i + 1]):
            current_imps = token
            fat_limit = lines[i + 1]
            last_imps = current_imps
            i += 2
        elif _FAT_LIMIT_PATTERN.fullmatch(token) and last_imps:
            current_imps = last_imps
            fat_limit = token
            i += 1
        else:
            i += 1
            continue

        if i >= len(lines):
            break
        sub_primal = lines[i]
        i += 1

        trades = pounds = 0
        low = high = avg = None

        if i < len(lines) and lines[i] == "-":
            i += 1
        elif (
            i + 3 < len(lines)
            and _INTEGER_PATTERN.fullmatch(lines[i])
            and _INTEGER_PATTERN.fullmatch(lines[i + 1])
            and _RANGE_PATTERN.fullmatch(lines[i + 2])
        ):
            trades = int(lines[i].replace(",", ""))
            pounds = int(lines[i + 1].replace(",", ""))
            low_text, high_text = [part.strip() for part in lines[i + 2].split("-", 1)]
            low = _safe_float(low_text)
            high = _safe_float(high_text)
            avg = _safe_float(lines[i + 3])
            i += 4

        entries.append(
            {
                "imps": current_imps,
                "fat_limit": fat_limit,
                "sub_primal": sub_primal,
                "trades": trades,
                "pounds": pounds,
                "low": low,
                "high": high,
                "weighted_average": avg,
            }
        )

    return entries


def parse_simple_section(section: str) -> list[dict[str, Any]]:
    """Parse simpler tables that only contain an item name and metrics."""

    entries: list[dict[str, Any]] = []

    for line in section.splitlines():
        raw_line = line
        line = line.strip()
        if not line or line.startswith("-"):
            continue

        match = re.search(
            r"(\d+)\s+([\d,]+)\s+([\-\d,\.]+)\s*-\s*([\-\d,\.]+)\s+([\-\d,\.]+)\s*$",
            line,
        )

        if match:
            name = line[: match.start()].strip()
            trades = int(match.group(1))
            pounds = int(match.group(2).replace(",", ""))
            low = _safe_float(match.group(3))
            high = _safe_float(match.group(4))
            avg = _safe_float(match.group(5))
        else:
            simple_match = re.search(r"(\d+)\s+([\d,]+)\s*$", line)
            if simple_match:
                name = line[: simple_match.start()].strip()
                trades = int(simple_match.group(1))
                pounds = int(simple_match.group(2).replace(",", ""))
                low = high = avg = None
            else:
                parts = raw_line.split("  ")
                name = parts[0].strip()
                trades = pounds = 0
                low = high = avg = None

        entries.append(
            {
                "item": name,
                "trades": trades,
                "pounds": pounds,
                "low": low,
                "high": high,
                "weighted_average": avg,
            }
        )

    return entries


def _safe_float(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = value.replace(",", "").strip()
    if not cleaned:
        return None
    return float(cleaned)


def _is_noise_line(raw_line: str) -> bool:
    line = raw_line.strip()
    if not line or line.startswith("-") or _HEADER_PATTERN.search(raw_line):
        return True
    return any(pattern.search(line) for pattern in _NOISE_PATTERNS)
