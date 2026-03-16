import json
import os
import os
import re
from typing import Dict, List
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR


EXPECTED_HEADERS = {"High", "Low", "Close", "Settle", "Change"}


def _clean_change(value: str) -> float | None:
    if value == "N/A":
        return None
    value = value.strip()
    if value.startswith("(") and value.endswith(")"):
        inner = value[1:-1].strip()
        sign = -1 if "-" in inner else 1
        inner = inner.replace("-", "")
        try:
            return sign * float(inner)
        except ValueError:
            return None
    try:
        return float(value)
    except ValueError:
        return None


def _clean_float(value: str) -> float | None:
    if value == "N/A":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_cme_feeder_cattle_data(raw_text_content: str) -> Dict[str, Dict[str, float | None]]:
    """Parse the CME FEEDER CATTLE section of a raw report."""
    marker = "CME FEEDER CATTLE"
    start = raw_text_content.find(marker)
    if start == -1:
        return {}

    section = raw_text_content[start + len(marker):]

    lines = [line.strip() for line in section.splitlines() if line.strip()]

    # locate header lines
    i = 0
    while i < len(lines) and lines[i] not in EXPECTED_HEADERS:
        i += 1
    headers: List[str] = []
    while i < len(lines) and lines[i] in EXPECTED_HEADERS and len(headers) < 4:
        headers.append(lines[i])
        i += 1
    if len(headers) < 4:
        return {}

    normalized_headers = [h.lower() for h in headers]

    data: Dict[str, Dict[str, float | None]] = {}
    num_fields = len(headers)
    while i < len(lines):
        month = lines[i]
        if not re.fullmatch(r"[A-Z]{3}", month):
            break
        i += 1
        values: List[str] = []
        for _ in range(num_fields):
            if i < len(lines) and not re.fullmatch(r"[A-Z]{3}", lines[i]):
                values.append(lines[i])
                i += 1
            else:
                values.append("N/A")
        record: Dict[str, float | None] = {}
        for header, value in zip(normalized_headers, values):
            if header == "change":
                record[header] = _clean_change(value)
            else:
                record[header] = _clean_float(value)
        data[month.lower()] = record
    return data


RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "cme_feeder_cattle"

def main() -> None:
    raw_catalog_dir = RAW_CATALOG_DIR
    processed_catalog_dir = PROCESSED_DIR

    os.makedirs(processed_catalog_dir, exist_ok=True)

    for filename in os.listdir(raw_catalog_dir):
        if not filename.endswith(".txt"):
            continue

        raw_text_file = raw_catalog_dir / filename
        date_str = filename.split('_')[0]
        output_json_file = processed_catalog_dir / f"{date_str}.json"

        if output_json_file.exists():
            print(f"Skipping {filename}, {output_json_file} already exists")
            continue

        with open(raw_text_file, "r") as f:
            content = f.read()
        parsed = parse_cme_feeder_cattle_data(content)

        final_output = {"cme_feeder_cattle": parsed}

        try:
            with open(output_json_file, "w") as f:
                json.dump(final_output, f, indent=2)
            print(f"Successfully processed {filename} and saved to {output_json_file}")
        except Exception as e:
            print(f"Error writing JSON to {output_json_file}: {e}")


if __name__ == "__main__":
    main()
