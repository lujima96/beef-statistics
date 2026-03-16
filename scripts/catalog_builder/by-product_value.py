import re
import json
import os
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

def parse_byproduct_value(raw_text_content):
    data = {}

    # Report Code
    report_code_match = re.search(r'((?:AMS[ _]\d{4}/)?NW_LS441)\s+USDA BY-PRODUCT DROP VALUE \(STEER\) - DAILY', raw_text_content)
    if report_code_match:
        data['report_code'] = report_code_match.group(1)

    # Value
    value_match = re.search(r'USDA BY-PRODUCT DROP VALUE \(STEER\) - DAILY\s*\n(?:.*\n){0,3}?(\d+\.\d+)', raw_text_content)
    if value_match:
        data['value'] = float(value_match.group(1))

    # Change
    change_match = re.search(r'Change:\s*([\(]?)([-\d\.]+|unchanged|UNCH)([\)]?)', raw_text_content, re.IGNORECASE)
    if change_match:
        change_str = change_match.group(2)
        if change_str.lower() == 'unchanged' or change_str.lower() == 'unch':
            data['change'] = "unchanged"
        else:
            change_val = float(change_str)
            if change_match.group(1) == '(' and change_match.group(3) == ')':
                data['change'] = -abs(change_val)
            else:
                data['change'] = change_val

    return data

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "by_product_value"

def main():
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

        with open(raw_text_file, 'r') as f:
            raw_text_content = f.read()

        parsed_data = parse_byproduct_value(raw_text_content)

        final_json_output = {"byproduct_drop_value": parsed_data}

        try:
            with open(output_json_file, 'w') as f:
                json.dump(final_json_output, f, indent=2)
            print(f"Successfully processed {filename} and saved to {output_json_file}")
        except Exception as e:
            print(f"Error writing JSON to {output_json_file}: {e}")

if __name__ == "__main__":
    main()
