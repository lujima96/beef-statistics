"""High level parser for boxed PM reports."""

from __future__ import annotations

import re
from typing import Any, Dict, List

from .metadata import (
    extract_location,
    extract_report_date,
    extract_report_id,
    extract_source,
)
from .sections import parse_simple_section, parse_subprimal_section

SubPrimalData = Dict[str, Any]
GroundBeefEntry = Dict[str, Any]


def parse_boxed_pm(text: str) -> Dict[str, Any]:
    """Parse boxed PM text into a simplified payload."""

    data: Dict[str, Any] = {"run": "PM"}

    report_id = extract_report_id(text)
    if report_id:
        data["report_id"] = report_id

    report_date = extract_report_date(text)
    if report_date:
        data["report_date"] = report_date

    location = extract_location(text)
    if location:
        data["location"] = location

    source = extract_source(text)
    if source:
        data["source"] = source

    sub_primal = _parse_sub_primal_sections(text)
    if sub_primal:
        data["sub_primal_negotiated_cut_prices"] = sub_primal

    gb_items, gb_lines = _parse_ground_beef_section(text)
    if gb_items:
        data["ground_beef"] = gb_items
    if gb_lines:
        data["ground_beef_items"] = gb_lines

    minimal: Dict[str, Any] = {
        "run": "PM",
        "report_id": data.get("report_id", ""),
        "report_date": data.get("report_date", ""),
        "location": data.get("location", ""),
        "source": data.get("source", ""),
        "sub_primal_negotiated_cut_prices": {
            key: _simplify_subprimal_rows(rows)
            for key, rows in sub_primal.items()
        },
    }

    if gb_items:
        minimal["ground_beef"] = gb_items
    if gb_lines:
        minimal["ground_beef_items"] = gb_lines

    return minimal


def _parse_sub_primal_sections(text: str) -> Dict[str, List[SubPrimalData]]:
    sub_primal: Dict[str, List[SubPrimalData]] = {}

    choice_match = re.search(
        r"Choice Cuts,? Fat Limitations 1-6.*?(.*?)(?:Select Cuts,? Fat Limitations 1-6|Choice, Select & Ungraded Cuts|GB -)",
        text,
        re.S | re.IGNORECASE,
    )
    if choice_match:
        sub_primal["choice"] = parse_subprimal_section(choice_match.group(1))

    select_match = re.search(
        r"Select Cuts,? Fat Limitations 1-6.*?(.*?)(?:Choice, Select & Ungraded Cuts|GB -)",
        text,
        re.S | re.IGNORECASE,
    )
    if select_match:
        sub_primal["select"] = parse_subprimal_section(select_match.group(1))

    mixed_match = re.search(
        r"Choice, Select & Ungraded Cuts.*?(.*?)(?:GB -)",
        text,
        re.S | re.IGNORECASE,
    )
    if mixed_match:
        sub_primal["mixed"] = parse_subprimal_section(mixed_match.group(1))

    return sub_primal


def _parse_ground_beef_section(text: str) -> tuple[list[GroundBeefEntry], list[GroundBeefEntry]]:
    gb_match = re.search(
        r"GB\s*-\s*STEER/HEIFER SOURCE.*?(.*?)(?:BLENDED GB|BEEF TRIMMINGS|FAT LIMITATIONS|Source:)",
        text,
        re.S | re.IGNORECASE,
    )

    gb_items: list[GroundBeefEntry] = []
    gb_lines: list[GroundBeefEntry] = []

    if not gb_match:
        return gb_items, gb_lines

    for entry in parse_simple_section(gb_match.group(1)):
        name = str(entry.get("item") or "")
        percent_match = re.search(r"(\d{2})%", name)
        percent_val = int(percent_match.group(1)) if percent_match else None

        gb_lines.append(
            {
                "label": name,
                "percent": percent_val,
                "trades": entry.get("trades"),
                "pounds": entry.get("pounds"),
                "low": entry.get("low"),
                "high": entry.get("high"),
                "weighted_average": entry.get("weighted_average"),
            }
        )

        ground_beef_match = re.search(r"Ground\s*Beef\s*(\d{2})%", name, re.I)
        if ground_beef_match:
            pct = int(ground_beef_match.group(1))
            avg = entry.get("weighted_average")
            if avg is not None:
                gb_items.append({"percent": pct, "weighted_average": float(avg)})

    return gb_items, gb_lines


def _simplify_subprimal_rows(rows: List[SubPrimalData]) -> List[SubPrimalData]:
    simplified: List[SubPrimalData] = []
    for row in rows:
        simplified.append(
            {
                "imps": row.get("imps"),
                "sub_primal": row.get("sub_primal"),
                "fat_limit": row.get("fat_limit"),
                "weighted_average": row.get("weighted_average"),
            }
        )
    return simplified
