import re
import json
import os
from datetime import datetime
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

def parse_report(content):
    """
    Parses the report section from the raw text content.
    """
    report_name_match = re.search(r"^(National Daily Cattle & Beef Summary)", content, re.MULTILINE)
    # Capture the date anywhere on a line (can appear after location)
    # Examples:
    #   "Tuesday, December 4, 2018"
    #   "Des Moines, Iowa     Friday, August 22, 2025     USDA ..."
    report_date_match = re.search(
        r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})",
        content,
        re.MULTILINE,
    )
    report_code_match = re.search(r"((?:AMS \d+\/)?LM_XB403)", content)
    location_match = re.search(r"^(Des Moines, Iowa)", content, re.MULTILINE)
    
    report_date = None
    if report_date_match:
        date_str = report_date_match.group(1).strip()
        report_date = datetime.strptime(date_str, "%B %d, %Y").strftime("%Y-%m-%d")

    report_data = {
        'report_code': report_code_match.group(1).replace(" ", "_") if report_code_match else None,
        'report_name': report_name_match.group(1).strip() if report_name_match else None,
        'report_date': report_date,
        'location': location_match.group(1).strip() if location_match else None
    }
    
    return {"report": report_data}

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "report"

def main():
    raw_catalog_dir = RAW_CATALOG_DIR
    processed_catalog_dir = PROCESSED_DIR

    os.makedirs(processed_catalog_dir, exist_ok=True)

    for filename in os.listdir(raw_catalog_dir):
        if not filename.endswith(".txt"):
            continue

        input_file = raw_catalog_dir / filename
        date_str = filename.split('_')[0]
        output_file = processed_catalog_dir / f"{date_str}.json"

        if output_file.exists():
            print(f"Skipping {filename}, {output_file} already exists")
            continue

        with open(input_file, 'r') as f:
            content = f.read()

        data = parse_report(content)

        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)

        print(f"Processed {filename} and saved to {output_file}")


if __name__ == "__main__":
    main()
