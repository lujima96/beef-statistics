import os
import re
import json
from datetime import datetime
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "slaughter"

def parse_slaughter_data(raw_text_content, filename):
    data = {
        "report_code": None,
        "today": None,
        "week_ago": None,
        "year_ago_actual": None, 
        "week_to_date": None,
        "same_period_last_week": None,
        "same_period_last_year": None,
        "previous_day_estimated": {
            "steer_and_heifer": {"friday": None, "saturday": None}, 
            "cow_and_bull": {"friday": None, "saturday": None}
        }
    }

    # Find the main section by looking for a unique phrase
    section_start_marker = "DAILY CATTLE SLAUGHTER"
    section_start_index = raw_text_content.find(section_start_marker)

    if section_start_index != -1:
        # Extract relevant text for this section
        # Go back a bit to capture report code, and forward until next AMS/USDA section
        relevant_text_start = max(0, section_start_index - 50)
        
        end_section_match = re.search(r'AMS \d+/|USDA BY-PRODUCT|BEEF PRODUCTION', raw_text_content[section_start_index + len(section_start_marker):])
        if end_section_match:
            relevant_text_end_index = section_start_index + len(section_start_marker) + end_section_match.start()
        else:
            relevant_text_end_index = len(raw_text_content)

        relevant_text = raw_text_content[relevant_text_start:relevant_text_end_index]

        # Extract report_code
        report_code_match = re.search(r'(AMS (?:\d+/)?SJ_LS710|SJ_LS710)', relevant_text)
        if report_code_match:
            extracted_report_code = report_code_match.group(1).strip()
            data["report_code"] = extracted_report_code # Removed hardcoded transformation

        # Extract values
        today_match = re.search(r'Today(?: \(est\))?\s*\n?([\d,]+)', relevant_text)
        if today_match:
            data["today"] = int(today_match.group(1).replace(',', ''))

        week_ago_match = re.search(r'Week Ago(?: \(est\))?\s*\n?([\d,]+)', relevant_text)
        if week_ago_match:
            data["week_ago"] = int(week_ago_match.group(1).replace(',', ''))

        year_ago_match = re.search(r'Year Ago(?: \(act\))?\s*\n?([\d,]+)', relevant_text)
        if year_ago_match:
            data["year_ago_actual"] = int(year_ago_match.group(1).replace(',', '')) 

        week_to_date_match = re.search(r'Week to Date\s*\n?([\d,]+)', relevant_text)
        if week_to_date_match:
            data["week_to_date"] = int(week_to_date_match.group(1).replace(',', '')) # Removed hardcoded value

        same_period_last_week_match = re.search(r'Same Period Last Week\s*\n?([\d,]+)', relevant_text)
        if same_period_last_week_match:
            data["same_period_last_week"] = int(same_period_last_week_match.group(1).replace(',', ''))

        same_period_last_year_match = re.search(r'Same Period Last Year\s*\n?([\d,]+)', relevant_text)
        if same_period_last_year_match:
            data["same_period_last_year"] = int(same_period_last_year_match.group(1).replace(',', ''))

        # Previous Day Estimated - updated regex for nested structure
        previous_day_match = re.search(r'Previous Day(?: Estimated)?\s*\n?Steer and Heifer\s*\n?([\d,]+)\s*\n?([\d,]+)?\s*\n?Cow and Bull\s*\n?([\d,]+)\s*\n?([\d,]+)?', relevant_text)
        if previous_day_match:
            # Check if 'saturday' value exists in raw text
            if previous_day_match.group(2) and previous_day_match.group(4):
                data["previous_day_estimated"]["steer_and_heifer"]["friday"] = int(previous_day_match.group(1).replace(',', ''))
                data["previous_day_estimated"]["steer_and_heifer"]["saturday"] = int(previous_day_match.group(2).replace(',', ''))
                data["previous_day_estimated"]["cow_and_bull"]["friday"] = int(previous_day_match.group(3).replace(',', ''))
                data["previous_day_estimated"]["cow_and_bull"]["saturday"] = int(previous_day_match.group(4).replace(',', ''))
            else:
                # Flat structure for 2018-12-04.json
                data["previous_day_estimated"] = {
                    "steer_and_heifer": int(previous_day_match.group(1).replace(',', '')),
                    "cow_and_bull": int(previous_day_match.group(3).replace(',', ''))
                }

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

            parsed_data = parse_slaughter_data(content, filename)

            # Removed hardcoded year_ago_actual to year_ago transformation

            final_json_output = {
                "estimated_daily_cattle_slaughter": parsed_data
            }

            try:
                with open(output_file_path, 'w') as outfile:
                    json.dump(final_json_output, outfile, indent=2)
                print(f"Successfully processed {filename} and saved to {output_file_path}")
            except Exception as e:
                print(f"Error writing JSON to {output_file_path}: {e}")

if __name__ == "__main__":
    main()

