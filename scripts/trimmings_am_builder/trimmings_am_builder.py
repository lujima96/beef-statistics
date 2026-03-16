import json
import os
import re
from datetime import datetime
from pathlib import Path
import sys

# Allow running as a script or as a module
if __package__ is None or __package__ == "":  # pragma: no cover - script execution
    sys.path.append(str(Path(__file__).resolve().parents[2]))
    from scripts.config import RAW_DIR, PROCESSED_DIR
else:  # pragma: no cover - package import
    from ..config import RAW_DIR, PROCESSED_DIR

RAW_TRIMMINGS_AM_DIR = RAW_DIR / "raw_trimmings_am"
PROCESSED_TRIMMINGS_AM_DIR = PROCESSED_DIR / "processed_trimmings_am"

MONTH_PATTERN = (
    r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
    r"Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
)


def _parse_line(section_category: str | None, line: str) -> dict | None:
    """Parse a single data line within a market section."""
    line = line.strip()
    m = re.match(r"(Fresh|Frozen)\s+(\d{2}(?:-\d{2})?%)\s*(.*)", line)
    if not m:
        return None
    ff, lean_pct, rest = m.groups()
    trades = 0
    pounds = 0
    low = high = avg = None
    rest = rest.replace("$", "").strip()
    if rest and rest != "-":
        m2 = re.search(
            r"(\d+)\s+([\d,]+)\s+([\d.]+)\s*-\s*([\d.]+)\s+([\d.]+)", rest
        )
        if not m2:
            m2 = re.search(
                r"(\d+)\s+([\d,]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", rest
            )
        if not m2:
            m2 = re.search(r"(\d+)\s+([\d,]+)", rest)
        if m2:
            trades = int(m2.group(1))
            pounds = int(m2.group(2).replace(",", ""))
            if m2.lastindex and m2.lastindex >= 5:
                low = float(m2.group(3))
                high = float(m2.group(4))
                avg = float(m2.group(5))
    return {
        "category": section_category,
        "lean_label": f"{ff} {lean_pct}",
        "trades": trades,
        "pounds": pounds,
        "low": low,
        "high": high,
        "weighted_average": avg,
    }


def _parse_market_section(section_text: str) -> list[dict]:
    entries: list[dict] = []
    current_category: str | None = None
    for line in section_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in {"Chemical Lean", "Bull Product"}:
            current_category = stripped
            continue
        parsed = _parse_line(current_category, stripped)
        if parsed:
            entries.append(parsed)
    return entries


def parse_trimmings_am(text: str) -> dict:
    """Parse raw trimmings AM text into structured JSON."""
    # Report code
    report_code_match = re.search(r"LM[_\s]?XB\s*400", text.replace("\n", " "))
    report_code = "LM_XB400"
    if report_code_match:
        report_code = report_code_match.group(0).replace(" ", "").replace("\n", "")
        if not report_code.startswith("LM_XB"):
            report_code = "LM_XB" + report_code.split("XB")[-1]

    # Report date
    date_match = re.search(rf"({MONTH_PATTERN})\s+\d{{1,2}},\s+\d{{4}}", text)
    report_date = None
    if date_match:
        raw_date = date_match.group(0)
        for fmt in ("%B %d, %Y", "%b %d, %Y"):
            try:
                report_date = datetime.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                break
            except ValueError:
                continue
    if report_date is None:
        raise ValueError("Could not parse report date")

    # Clean text for section parsing
    clean_lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("Source:") or stripped.startswith("Page"):
            continue
        if stripped.startswith("=== PAGE BREAK ==="):
            continue
        clean_lines.append(line)
    clean_text = "\n".join(clean_lines)

    # Current volume
    cv: dict[str, dict[str, float | int]] = {}
    m_c = re.search(
        r"Central:?\s+([\d.]+)\s+Loads.*?([\d,]+)\s+pounds",
        clean_text,
        re.S,
    )
    m_n = re.search(
        r"National:?\s+([\d.]+)\s+Loads.*?([\d,]+)\s+pounds",
        clean_text,
        re.S,
    )
    if m_c:
        cv["central"] = {
            "loads": float(m_c.group(1)),
            "pounds": int(m_c.group(2).replace(",", "")),
        }
    if m_n:
        cv["national"] = {
            "loads": float(m_n.group(1)),
            "pounds": int(m_n.group(2).replace(",", "")),
        }

    # Market sections
    markets: list[dict] = []
    central_match = re.search(
        r"FOB Plant - Central(.*?)(?:FOB Plant - National|Regional Breakdown:)",
        clean_text,
        re.S,
    )
    if central_match:
        central_lines = _parse_market_section(central_match.group(1))
        # Keep only 50-59% and 70-79% lean ranges
        filtered: list[dict] = []
        for row in central_lines:
            m = re.search(r"(\d{2})(?:-(\d{2}))?%", row.get("lean_label", ""))
            if not m:
                continue
            lo = int(m.group(1))
            hi = int(m.group(2) or m.group(1))
            if not (hi < 50 or lo > 59) or not (hi < 70 or lo > 79):
                # The above uses two disjoint ranges; include if overlaps either
                pass
            # More explicit overlap check for both ranges
            in_50s = not (hi < 50 or lo > 59)
            in_70s = not (hi < 70 or lo > 79)
            if in_50s or in_70s:
                filtered.append(row)
        markets.append({"market_key": "central", "lines": filtered})
    national_match = re.search(
        r"FOB Plant - National(.*?)(?:Regional Breakdown:)",
        clean_text,
        re.S,
    )
    if national_match:
        national_lines = _parse_market_section(national_match.group(1))
        filtered: list[dict] = []
        for row in national_lines:
            m = re.search(r"(\d{2})(?:-(\d{2}))?%", row.get("lean_label", ""))
            if not m:
                continue
            lo = int(m.group(1))
            hi = int(m.group(2) or m.group(1))
            in_50s = not (hi < 50 or lo > 59)
            in_70s = not (hi < 70 or lo > 79)
            if in_50s or in_70s:
                filtered.append(row)
        markets.append({"market_key": "national", "lines": filtered})

    data = {
        "report_code": report_code,
        "report_date": report_date,
        "run": "AM",
        "current_volume": cv,
        "sections": {"markets": markets},
    }
    return data


def run() -> None:
    os.makedirs(PROCESSED_TRIMMINGS_AM_DIR, exist_ok=True)
    for file in sorted(RAW_TRIMMINGS_AM_DIR.glob("*.txt")):
        date_str = file.stem.split("_")[0]
        out_path = PROCESSED_TRIMMINGS_AM_DIR / f"{date_str}.json"
        if out_path.exists():
            continue
        text = file.read_text(encoding="utf-8", errors="ignore")
        parsed = parse_trimmings_am(text)
        with open(out_path, "w") as f:
            json.dump(parsed, f, indent=2)
        print(f"Processed {file.name} -> {out_path.name}")


def main() -> int:  # pragma: no cover - CLI wrapper
    run()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
