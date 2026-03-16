import os
import re
import json
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "cutter"

def parse_cutter_data(raw_text_content):
    data = {}

    # Find the main section by looking for a unique phrase
    section_start_marker = "USDA NATIONAL CUTTER COW CARCASS CUTOUT"
    section_start_index = raw_text_content.find(section_start_marker)

    if section_start_index != -1:
        # Extract report_code dynamically
        report_code_match = re.search(r"(AMS\s*\d+/)?LM_XB405", raw_text_content[:section_start_index])
        if report_code_match:
            data["report_code"] = report_code_match.group(0).strip().replace(" ", "_")
        else:
            data["report_code"] = "LM_XB405"

        # Extract relevant text for this section
        relevant_text = raw_text_content[section_start_index:]

        # Extract value, change, and lean_90pct
        # Using a regex that captures the value, change (with optional parentheses), and 90% lean
        match = re.search(
            r"USDA NATIONAL CUTTER COW CARCASS CUTOUT\s*\n"
            r"(?:\$[\d\.]+\s*\n)*" # Match and discard lines starting with $
            r"([\d\.]+)\s*\n"
            r"(.+?)\s*\n"
            r"90% lean:\s*\n"
            r"([\d\.]+)",
            relevant_text,
            re.DOTALL
        )

        if match:
            data["value"] = float(match.group(1))

            change_str = match.group(2)
            # Now, parse the change_str more robustly to handle both (X.XX) and X.XX
            change_value_match = re.search(r"([\(]?)(-?\d+\.\d+)([\)]?)", change_str)
            if change_value_match:
                change_val = float(change_value_match.group(2))
                if change_value_match.group(1) == '(' and change_value_match.group(3) == ')':
                    data["change"] = -abs(change_val)
                else:
                    data["change"] = change_val
            else:
                data["change"] = None # Or handle as an error

            data["lean_90pct"] = float(match.group(3))

    return data

def main():
    raw_catalog_dir = RAW_CATALOG_DIR
    processed_catalog_dir = PROCESSED_DIR

    os.makedirs(processed_catalog_dir, exist_ok=True)

    for filename in os.listdir(raw_catalog_dir):
        if filename.endswith(".txt"):
            raw_file_path = raw_catalog_dir / filename

            # Extract date from filename (e.g., 2025-08-13_LSDDCBS.txt -> 2025-08-13)
            date_str = filename.split('_')[0]

            output_file_path = processed_catalog_dir / f"{date_str}.json"

            if output_file_path.exists():
                print(f"Skipping {filename}, {output_file_path} already exists")
                continue

            with open(raw_file_path, 'r') as f:
                content = f.read()

            parsed_data = parse_cutter_data(content)

            final_json_output = {
                "national_cutter_cow_carcass_cutout": parsed_data
            }

            try:
                with open(output_file_path, 'w') as outfile:
                    json.dump(final_json_output, outfile, indent=2)
                print(f"Successfully processed {filename} and saved to {output_file_path}")
            except Exception as e:
                print(f"Error writing JSON to {output_file_path}: {e}")

if __name__ == "__main__":
    main()
