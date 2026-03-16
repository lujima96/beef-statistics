#!/usr/bin/env python3
"""Parse USDA Beef Carcass Equivalent Index (NW_LS410) into minimal JSON.

This simplified parser now focuses only on National Daily Direct Cattle
"Live Steer" and "Live Heifer" pricing. It reads text files from
``beef_stats/raw/raw_index`` and writes JSON documents to
``beef_stats/processed/processed_index`` with just the header metadata and the
two live categories. This keeps older reports working while producing a
lighter payload tailored to current needs.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

# ─── Ensure scripts/ is on sys.path ─────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]   # …/beef_stats/
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from scripts.config import RAW_DIR as RAW_BASE_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError as e:
    raise ImportError(f"Could not import scripts.config from {ROOT}: {e}")

RAW_DIR = RAW_BASE_DIR / "raw_index"
OUT_DIR = PROCESSED_BASE_DIR / "processed_index"


def _num(s: str) -> float:
    """Convert strings like ``$123``, ``(4.5)`` or ``1,234`` to floats."""
    s = s.strip().replace("$", "").replace(",", "").replace("%", "")
    if s.startswith("(") and s.endswith(")"):
        return -float(s[1:-1])
    return float(s)


def _must_search(pattern: str, text: str, *, flags: int = 0, name: Optional[str] = None) -> re.Match[str]:
    """Search with regex and raise a clear error if not found (helps Pylance too)."""
    m = re.search(pattern, text, flags)
    if not m:
        label = name if name else pattern
        raise ValueError(f"Required pattern not found: {label}")
    return m


def _parse_header(lines: List[str]) -> Dict[str, Any]:
    report_id = lines[0].strip()
    m = re.match(r"(.+?)\s{2,}([A-Za-z]{3},\s[A-Za-z]{3}\s\d{2},\s\d{4})\s{2,}(.+)", lines[1])
    if not m:
        raise ValueError("Could not parse header line")
    location, date_str, source = m.groups()
    date = datetime.strptime(date_str, "%a, %b %d, %Y").strftime("%Y-%m-%d")
    return {
        "report_id": report_id,
        "location": location.strip(),
        "date": date,
        "source": source.strip(),
    }


def _parse_index(text: str) -> Dict[str, Any]:
    m = _must_search(r"Index\s+(\d+-\d+)#\s+(\d+-\d+)#", text, name="Index weights")
    choice_weight, select_weight = m.groups()

    m = _must_search(r"Values\s*=>\s*([\$()\d.,-]+)\s+([\$()\d.,-]+)", text, name="Index values")
    choice_value, select_value = _num(m.group(1)), _num(m.group(2))

    m = _must_search(r"Change\s*=>\s*([\$()\d.,-]+)\s+([\$()\d.,-]+)", text, name="Index change")
    choice_change, select_change = _num(m.group(1)), _num(m.group(2))

    m = _must_search(r"Equivalent of\s+([\d,]+) head", text, name="Index head")
    head = int(m.group(1).replace(",", ""))

    return {
        "choice": {
            "weight_range": choice_weight.replace("#", ""),
            "value": choice_value,
            "change": choice_change,
        },
        "select": {
            "weight_range": select_weight.replace("#", ""),
            "value": select_value,
            "change": select_change,
        },
        "head_count": head,
    }


def _parse_supply_demand(text: str) -> Dict[str, Any]:
    supply_head = int(_must_search(r"SUPPLY \(Live\)\s+([\d,]+) Hd", text, name="Supply head").group(1).replace(",", ""))
    m = _must_search(
        r"SUPPLY \(Live\).*?Equivalent:\s+([\$()\d.,-]+)\s+([\$()\d.,-]+)",
        text,
        flags=re.DOTALL,
        name="Supply equivalent",
    )
    supply_choice, supply_select = _num(m.group(1)), _num(m.group(2))

    demand_head = int(_must_search(r"DEMAND \(Box\)\s+([\d,]+) Hd", text, name="Demand head").group(1).replace(",", ""))
    m = _must_search(
        r"DEMAND \(Box\).*?Equivalent:\s+([\$()\d.,-]+)\s+([\$()\d.,-]+)",
        text,
        flags=re.DOTALL,
        name="Demand equivalent",
    )
    demand_choice, demand_select = _num(m.group(1)), _num(m.group(2))

    m = _must_search(r"Live-Box Spread:\s+([\$()\d.,-]+)\s+([\$()\d.,-]+)", text, name="Live-Box spread")
    spread_choice, spread_select = _num(m.group(1)), _num(m.group(2))

    return {
        "supply": {
            "head": supply_head,
            "equivalent": {"choice": supply_choice, "select": supply_select},
        },
        "demand": {
            "head": demand_head,
            "equivalent": {"choice": demand_choice, "select": demand_select},
        },
        "live_box_spread": {"choice": spread_choice, "select": spread_select},
    }


def _parse_input_breakdown(text: str) -> Dict[str, Any]:
    section: Dict[str, Any] = {}

    ch = _must_search(r"Ch 600-900#\s+\$([\d.]+)", text, name="Choice 600-900 cutout").group(1)
    se = _must_search(r"Se 600-900#\s+\$([\d.]+)", text, name="Select 600-900 cutout").group(1)
    cur = _must_search(r"Current Lds:\s+([\d.]+)", text, name="Current loads").group(1)
    prev = _must_search(r"Previous Lds:\s+([\d.]+)", text, name="Previous loads").group(1)
    section["boxed_beef_cutouts"] = {
        "choice_600_900": _num(ch),
        "select_600_900": _num(se),
        "current_loads": _num(cur),
        "previous_loads": _num(prev),
    }

    cattle: Dict[str, Any] = {}
    patterns: Mapping[str, str] = {
        "live_steer": r"Live Steer:\s+(\d+)\s+\$([\d.]+)\s+([\d,]+)",
        "live_heifer": r"Live Heifer:\s+(\d+)\s+\$([\d.]+)\s+([\d,]+)",
        "dressed_steer": r"Drsd Steer:\s+(\d+)\s+\$([\d.]+)\s+([\d,]+)",
        "dressed_heifer": r"Drsd Heifer:\s+(\d+)\s+\$([\d.]+)\s+([\d,]+)",
    }
    for key, pattern in patterns.items():
        m = re.search(pattern, text)
        if m:
            cattle[key] = {
                "weight": int(m.group(1)),
                "price": _num(m.group(2)),
                "head": int(m.group(3).replace(",", "")),
            }
    section["national_daily_direct_cattle"] = cattle
    return section


def _parse_grading_processing(text: str) -> Dict[str, Any]:
    grading: Dict[str, Dict[str, float]] = {"choice": {}, "select": {}}
    processing: Dict[str, float] = {}
    for line in text.splitlines():
        m = re.match(r"\s*(Ch|Se)\s+(\d+-\d+)#\s*:\s*([\d.]+)%", line)
        if m:
            grp = "choice" if m.group(1) == "Ch" else "select"
            grading[grp][m.group(2).replace("-", "_")] = _num(m.group(3))
        if "Drop Credit" in line:
            processing["drop_credit"] = _num(line.split(":")[-1])
        if "Steer Dressing %" in line:
            processing["steer_dressing_percent"] = _num(line.split(":")[-1])
        if "Heifer Dressing %" in line:
            processing["heifer_dressing_percent"] = _num(line.split(":")[-1])
        if "Processing Cost" in line:
            processing["processing_cost"] = _num(line.split(":")[-1])
        if "Slaughter Cost" in line:
            processing["slaughter_cost"] = _num(line.split(":")[-1])
    return {"grading_breakdown": grading, "processing": processing}


def _parse_outlying(text: str) -> Dict[str, Any]:
    basis = _num(_must_search(r"Basis Value = ([\d.]+)", text, name="Basis value").group(1))

    weights_line = _must_search(r"Carcass Weights\n\s*(.+)\n", text, name="Carcass weights line").group(1)
    raw_weights = re.findall(r"\d+-\d+#|1000#/up", weights_line)
    weights = [w.replace("#", "").replace("/up", "+") for w in raw_weights]

    qualities: List[Dict[str, Any]] = []
    for line in text.splitlines():
        m = re.match(
            r"\s*([A-Za-z0-9\- ]+?)\s+([\-\d.]+)\s+\$([\d.]+)\s+\$([\d.]+)\s+\$([\d.]+)\s+\$([\d.]+)\s+\$([\d.]+)",
            line,
        )
        if m:
            name = m.group(1).strip()
            diff = _num(m.group(2))
            vals = [_num(g) for g in m.groups()[2:]]
            qualities.append({"name": name, "diff": diff, "values": vals})

    return {"basis_value": basis, "weights": weights, "qualities": qualities}


def _parse_notes_and_contacts(text: str) -> Dict[str, Any]:
    if not text.strip():
        return {
            "notes": {"box_loads_method": "", "differentials": "", "index_method": ""},
            "contacts": {"analyst": "", "phone": "", "email": "", "recorded_info": "", "website": []},
        }

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    box_lines = lines[0:2] if len(lines) >= 2 else lines
    diff_line = next((ln for ln in lines if ln.startswith("(1)")), "")
    note_line = next((ln for ln in lines if ln.startswith("Note:")), "")

    notes = {
        "box_loads_method": " ".join([ln.lstrip("*") for ln in box_lines]),
        "differentials": diff_line.split(" ", 1)[1] if " " in diff_line else diff_line,
        "index_method": note_line.split(":", 1)[1].strip() if ":" in note_line else note_line,
    }

    analyst_line = next((ln for ln in lines if "@" in ln), "")
    analyst, phone, email = "", "", ""
    m = re.match(r"(.*?)(\d{3}-\d{3}-\d{4})\s+(\S+@\S+)", analyst_line)
    if m:
        analyst, phone, email = m.group(1).strip(), m.group(2), m.group(3)

    recorded_line = next((ln for ln in lines if "recorded market information" in ln.lower()), "")
    recorded = ""
    m2 = re.search(r"(\d{3}-\d{3}-\d{4})", recorded_line)
    if m2:
        recorded = m2.group(1)

    websites = [ln for ln in lines if ln.startswith("www") or ln.startswith("https")]

    contacts = {
        "analyst": analyst,
        "phone": phone,
        "email": email,
        "recorded_info": recorded,
        "website": websites,
    }
    return {"notes": notes, "contacts": contacts}


def parse_file(path: Path) -> Dict[str, Any]:
    lines = path.read_text(encoding="utf-8").splitlines()
    header = _parse_header(lines)
    rest = "\n".join(lines[2:]).replace("*", "")

    # Extract only the national daily direct cattle block and keep
    # Live Steer / Live Heifer fields (weight, price, head).
    full_breakdown = _parse_input_breakdown(rest)
    cattle = full_breakdown.get("national_daily_direct_cattle", {})
    minimal_cattle: Dict[str, Any] = {}
    for key in ("live_steer", "live_heifer"):
        if key in cattle:
            minimal_cattle[key] = cattle[key]

    out: Dict[str, Any] = dict(header)
    out["sections"] = {"national_daily_direct_cattle": minimal_cattle}
    return out


def run() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in sorted(RAW_DIR.glob("*.txt")):
        try:
            data = parse_file(path)
        except Exception as e:
            print(f"Skipping {path.name}: {e}")
            continue
        out_file = OUT_DIR / f"{path.stem}.json"
        out_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Wrote {out_file}")


def main() -> int:
    run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
