import os
import re
import json
from datetime import datetime
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

def parse_beef_production_data(raw_text_content, filename):
    data = {
        "report_code": None,
        "week_end_date": None,
        "this_week_estimate": {
            "slaughter": None,
            "live_weights": None,
            "dressed_weights": None,
            "production_million_lbs": None
        },
        "last_week_estimate": {
            "slaughter": None,
            "live_weights": None,
            "dressed_weights": None,
            "production_million_lbs": None
        },
        "last_year_actual": {
            "slaughter": None,
            "live_weights": None,
            "dressed_weights": None,
            "production_million_lbs": None
        }
    }

    # Find the main section by looking for a unique phrase
    section_start_marker = "BEEF PRODUCTION"
    section_start_index = raw_text_content.find(section_start_marker)

    if section_start_index != -1:
        # Extract relevant text for this section
        relevant_text_start = max(0, section_start_index - 50)
        
        end_section_match = re.search(r'AMS \d+/|USDA BEEF CARCASS PRICE EQUIVALENT INDEX VALUE', raw_text_content[section_start_index + len(section_start_marker):])
        if end_section_match:
            relevant_text_end_index = section_start_index + len(section_start_marker) + end_section_match.start()
        else:
            relevant_text_end_index = len(raw_text_content)

        relevant_text = raw_text_content[relevant_text_start:relevant_text_end_index]

        # Extract report_code
        report_code_match = re.search(r'(AMS (?:\d+/)?SJ_LS712|SJ_LS712)', relevant_text)
        if report_code_match:
            extracted_report_code = report_code_match.group(1).strip()
            # Transformation for report_code: replace space with underscore after AMS
            data["report_code"] = extracted_report_code.replace("AMS ", "AMS_")

        # Extract week_end_date
        week_end_date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', relevant_text)
        if week_end_date_match:
            data["week_end_date"] = datetime.strptime(week_end_date_match.group(1), '%m/%d/%Y').strftime('%Y-%m-%d')

        # Extract production data
        slaughter_match = re.search(r'Slaughter\s*\n?([\d,]+)\s*\n?([\d,]+)\s*\n?([\d,]+)', relevant_text)
        live_weights_match = re.search(r'Live Weights\s*\n?([\d,]+)\s*\n?([\d,]+)\s*\n?([\d,]+)', relevant_text)
        dressed_weights_match = re.search(r'Dressed Weights\s*\n?([\d,]+)\s*\n?([\d,]+)\s*\n?([\d,]+)', relevant_text)
        production_lbs_match = re.search(r'Beef Production \(millions of pounds\)\s*\n?([\d.]+)\s*\n?([\d.]+)\s*\n?([\d.]+)', relevant_text)

        if slaughter_match and live_weights_match and dressed_weights_match and production_lbs_match:
            data["this_week_estimate"]["slaughter"] = int(slaughter_match.group(1).replace(',', ''))
            data["this_week_estimate"]["live_weights"] = int(live_weights_match.group(1).replace(',', ''))
            data["this_week_estimate"]["dressed_weights"] = int(dressed_weights_match.group(1).replace(',', ''))
            
            prod_lbs_this_week = float(production_lbs_match.group(1).rstrip('.'))
            data["this_week_estimate"]["production_million_lbs"] = int(prod_lbs_this_week) if prod_lbs_this_week.is_integer() else prod_lbs_this_week

            data["last_week_estimate"]["slaughter"] = int(slaughter_match.group(2).replace(',', ''))
            data["last_week_estimate"]["live_weights"] = int(live_weights_match.group(2).replace(',', ''))
            data["last_week_estimate"]["dressed_weights"] = int(dressed_weights_match.group(2).replace(',', ''))
            
            prod_lbs_last_week = float(production_lbs_match.group(2).rstrip('.'))
            data["last_week_estimate"]["production_million_lbs"] = int(prod_lbs_last_week) if prod_lbs_last_week.is_integer() else prod_lbs_last_week

            data["last_year_actual"]["slaughter"] = int(slaughter_match.group(3).replace(',', ''))
            data["last_year_actual"]["live_weights"] = int(live_weights_match.group(3).replace(',', ''))
            data["last_year_actual"]["dressed_weights"] = int(dressed_weights_match.group(3).replace(',', ''))
            
            prod_lbs_last_year = float(production_lbs_match.group(3).rstrip('.'))
            data["last_year_actual"]["production_million_lbs"] = int(prod_lbs_last_year) if prod_lbs_last_year.is_integer() else prod_lbs_last_year

    return data

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "beef_production"

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

            parsed_data = parse_beef_production_data(content, filename)

            final_json_output = {
                "beef_production": parsed_data
            }

            try:
                with open(output_file_path, 'w') as outfile:
                    json.dump(final_json_output, outfile, indent=2)
                print(f"Successfully processed {filename} and saved to {output_file_path}")
            except Exception as e:
                print(f"Error writing JSON to {output_file_path}: {e}")

if __name__ == "__main__":
    main()
