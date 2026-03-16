import os
import re
import json
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "carcass_price_index"

def parse_value(value_str):
    """Cleans and converts a string to a float, handling special cases."""
    if value_str is None:
        return None
    s = str(value_str).strip().replace('$', '').replace(',', '')
    print(f"parse_value input: {value_str}, stripped: {s}") # Debug print
    if s.lower() in ['unchanged', 'unch']:
        return 0.0
    if s.startswith('(') and s.endswith(')'):
        return -abs(float(s[1:-1]))
    try:
        return float(s)
    except (ValueError, TypeError):
        return None

def main():
    """
    Parses raw beef statistics files to extract carcass price index data
    and saves it to JSON files.
    """
    raw_dir = RAW_CATALOG_DIR
    processed_dir = PROCESSED_DIR
    os.makedirs(processed_dir, exist_ok=True)

    for filename in os.listdir(raw_dir):
        if not filename.endswith('.txt'):
            continue

        file_path = raw_dir / filename
        date_str = os.path.basename(filename).split('_')[0]
        output_filename = f"{date_str}.json"
        output_path = os.path.join(processed_dir, output_filename)

        if os.path.exists(output_path):
            print(f"Skipping {filename}, {output_path} already exists")
            continue

        with open(file_path, 'r') as f:
            content = f.read()

        print(f"Processing file: {filename}") # Debug print
        # Extract report_code from the full content
        report_code_match = re.search(r"(AMS\s*\d+/)?NW_LS410", content)
        report_code = report_code_match.group(0).strip().replace(' ', '_') if report_code_match else "NW_LS410"
        print(f"  Report code: {report_code}") # Debug print

        # Isolate the section for "USDA BEEF CARCASS PRICE EQUIVALENT INDEX VALUE"
        section_match = re.search(
            r"NW_LS410.*?(?=AMS |LM_|CME|SJ_)",
            content,
            re.DOTALL
        )
        if not section_match:
            print(f"  Section match not found for {filename}") # Debug print
            continue

        section_text = section_match.group(0)
        print(f"  Section text found for {filename}") # Debug print

        # Find the line with Choice and Select values
        choice_value = None
        select_value = None
        steer_dressing = None
        heifer_dressing = None
        choice_change = None
        select_change = None

        choice_select_values_match = re.search(
            r"Choice\s+Select\s*.*?(\n\s*[\$]?[-]?\d+\.\d+\s+[\$]?[-]?\d+\.\d+\s+[-]?\d+\.\d+\s+[-]?\d+\.\d+)",
            section_text,
            re.DOTALL
        )
        if choice_select_values_match:
            values_line = choice_select_values_match.group(1)
            all_values = re.findall(r'\(?\$?[-]?\d+\.?\d*\)?', values_line)
            if len(all_values) >= 4:
                choice_value = parse_value(all_values[0])
                select_value = parse_value(all_values[1])
                steer_dressing = parse_value(all_values[2])
                heifer_dressing = parse_value(all_values[3])
        print(f"  Parsed values: Choice={choice_value}, Select={select_value}, Steer={steer_dressing}, Heifer={heifer_dressing}") # Debug print

        # Find the line with Change values
        change_keyword_match = re.search(r"Change", section_text)
        if change_keyword_match:
            # Get the text after "Change"
            text_after_change = section_text[change_keyword_match.end():]

            # Find the first number after "Change"
            first_change_match = re.search(r'\(?[-]?\d+\.?\d*\)?', text_after_change)
            if first_change_match:
                choice_change = parse_value(first_change_match.group(0))
                
                # Find the second number after the first change
                second_change_match = re.search(r'\(?[-]?\d+\.?\d*\)?', text_after_change[first_change_match.end():])
                if second_change_match:
                    select_change = parse_value(second_change_match.group(0))
        print(f"  Parsed changes: Choice={choice_change}, Select={select_change}") # Debug print

        # Construct the JSON output
        data = {
            "beef_carcass_price_equivalent_index": {
                "report_code": report_code,
                "choice": {
                    "weight_range": "600-900#",
                    "value": choice_value,
                    "change": choice_change,
                },
                "select": {
                    "weight_range": "600-900#",
                    "value": select_value,
                    "change": select_change,
                },
                "dressing_percent": {
                    "steer": steer_dressing,
                    "heifer": heifer_dressing,
                },
            }
        }

        # Write to a new JSON file
        print(f"  Writing to: {output_path}") # Debug print

        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)

if __name__ == "__main__":
    main()
