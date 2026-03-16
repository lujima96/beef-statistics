"""High level parser for boxed AM reports."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from .sections import parse_simple_section, parse_subprimal_section

MONTHS_REGEX = (
    "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
    "Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
)


def parse_boxed_am(text: str) -> dict[str, Any]:
    """Parse the boxed AM text into the simplified payload."""

    data: dict[str, Any] = {"run": "AM"}

    report_id_match = re.search(r"(LM_XB\d{3}|AMS_\d+)", text)
    if report_id_match:
        data["report_id"] = report_id_match.group(1)

    date_match = re.search(rf"({MONTHS_REGEX})\s+\d{{1,2}},\s+\d{{4}}", text)
    if date_match:
        raw_date = date_match.group(0)
        for fmt in ("%B %d, %Y", "%b %d, %Y"):
            try:
                dt = datetime.strptime(raw_date, fmt)
                data["report_date"] = dt.strftime("%Y-%m-%d")
                break
            except ValueError:
                continue

    loc_match = re.search(r"Source:.*?,\s*([A-Za-z .]+,\s*[A-Z]{2})", text)
    if not loc_match:
        loc_match = re.search(r"([A-Za-z .]+,\s*[A-Z]{2})\s*\|", text)
    if loc_match:
        data["location"] = loc_match.group(1).strip()

    source_match = re.search(r"Source:\s*([^\n]+)", text)
    if source_match:
        source_text = source_match.group(1)
        source_text = re.sub(r"Page.*", "", source_text)
        source_text = re.sub(r",\s*[A-Za-z .]+,\s*[A-Z]{2}.*", "", source_text)
        data["source"] = source_text.strip()

    sub_primal: dict[str, list[dict[str, Any]]] = {}
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

    if sub_primal:
        data["sub_primal_negotiated_cut_prices"] = sub_primal

    gb_match = re.search(
        r"GB\s*-\s*STEER/HEIFER SOURCE.*?(.*?)(?:BLENDED GB|BEEF TRIMMINGS|FAT LIMITATIONS|Source:)",
        text,
        re.S | re.IGNORECASE,
    )
    gb_items: list[dict[str, Any]] = []
    gb_lines: list[dict[str, Any]] = []
    if gb_match:
        gb_entries = parse_simple_section(gb_match.group(1))
        for entry in gb_entries:
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
            series_match = re.search(r"Ground\s*Beef\s*(\d{2})%", name, re.I)
            if series_match:
                percent = int(series_match.group(1))
                avg = entry.get("weighted_average")
                if avg is not None:
                    gb_items.append({"percent": percent, "weighted_average": float(avg)})

    if gb_items:
        data["ground_beef"] = gb_items
    if gb_lines:
        data["ground_beef_items"] = gb_lines

    simplified: dict[str, list[dict[str, Any]]] = {}

    def simplify(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "imps": row.get("imps"),
                "sub_primal": row.get("sub_primal"),
                "fat_limit": row.get("fat_limit"),
                "weighted_average": row.get("weighted_average"),
            }
            for row in rows
        ]

    if "choice" in sub_primal:
        simplified["choice"] = simplify(sub_primal["choice"])
    if "select" in sub_primal:
        simplified["select"] = simplify(sub_primal["select"])
    if "mixed" in sub_primal:
        simplified["mixed"] = simplify(sub_primal["mixed"])

    minimal: dict[str, Any] = {
        "run": "AM",
        "report_id": data.get("report_id", ""),
        "report_date": data.get("report_date", ""),
        "location": data.get("location", ""),
        "source": data.get("source", ""),
        "sub_primal_negotiated_cut_prices": simplified,
    }
    if gb_items:
        minimal["ground_beef"] = gb_items
    if gb_lines:
        minimal["ground_beef_items"] = gb_lines

    return minimal
