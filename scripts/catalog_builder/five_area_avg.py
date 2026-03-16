import os
import re
import json
from pathlib import Path
import sys
from typing import Any

"""Utility script for processing Five Area Average data.

When this file is executed as part of the ``scripts`` package (for example
using ``python -m scripts.catalog_builder.five_area_avg``) the relative import
below works as expected.  However, users often run the file directly
``python scripts/catalog_builder/five_area_avg.py`` which means the module has
no parent package and the relative import fails.  To make the script usable in
both situations we inspect ``__package__`` and, when missing, manually add the
repository root to ``sys.path`` before importing :mod:`scripts.config`.
"""

if __package__:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
else:  # executed as a script
    ROOT_DIR = Path(__file__).resolve().parents[2]
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "five_area_avg"

def process_five_area_avg_data():
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

            # Initialize data structure
            five_area_data: dict[str, Any] = {
                "report_code": None,
                "as_of_time": None,
                "categories": []
            }

            # Find the main section by looking for a unique phrase.  The spacing
            # between ``ACCUMULATED`` and ``WEIGHTED`` has changed in some source
            # files so we use a regular expression to allow for one or more
            # spaces.  ``re.search`` gives us the starting index while keeping
            # the original ``section_start_marker`` string for later slicing.
            section_start_marker = "5 AREA WEEKLY ACCUMULATED WEIGHTED AVG CATTLE PRICE"
            section_start_match = re.search(
                r"5 AREA WEEKLY ACCUMULATED\s+WEIGHTED AVG CATTLE PRICE", content
            )
            if section_start_match:
                section_start_index = section_start_match.start()
                section_start_end = section_start_match.end()
            else:
                section_start_index = -1
                section_start_end = -1

            if section_start_index != -1:
                # Find the end of the relevant section (before the next AMS or USDA section)
                end_section_match = re.search(
                    r'AMS \d+/|USDA BY-PRODUCT|DAILY CATTLE SLAUGHTER',
                    content[section_start_end:]
                )
                
                if end_section_match:
                    relevant_text_end_index = section_start_end + end_section_match.start()
                else:
                    relevant_text_end_index = len(content) # If no next section, go to end of file

                relevant_text = content[section_start_index:relevant_text_end_index]

                # Extract report_code
                report_code_match = re.search(r'(AMS (?:\d+/)?LM_CT100|LM_CT100)', content[:section_start_index]) # Search before the section start
                if report_code_match:
                    extracted_report_code = report_code_match.group(1).strip()
                    # Apply transformation rule for report_code
                    if extracted_report_code == "AMS 2466/LM_CT100":
                        five_area_data["report_code"] = "AMS_2460/LM_CT100"
                    else:
                        five_area_data["report_code"] = extracted_report_code

                # Extract as_of_time
                as_of_time_match = re.search(r'As of (\d{1,2}:\d{2} [ap]m)', relevant_text)
                if as_of_time_match:
                    five_area_data["as_of_time"] = as_of_time_match.group(1).strip()

                # Find the start of the category data (after Avg Price line)
                category_data_start_marker = "Avg Price"
                category_data_start_index = relevant_text.find(category_data_start_marker)

                if category_data_start_index != -1:
                    # Extract the block of text containing only the categories
                    category_block_text_start_index = relevant_text.find("Live Steer", category_data_start_index)
                    if category_block_text_start_index == -1:
                        category_block_text_start_index = relevant_text.find("Live Heifer", category_data_start_index)
                    if category_block_text_start_index == -1:
                        category_block_text_start_index = relevant_text.find("Dressed Steer", category_data_start_index)
                    if category_block_text_start_index == -1:
                        category_block_text_start_index = relevant_text.find("Dressed Heifer", category_data_start_index)

                    if category_block_text_start_index != -1:
                        category_block_text = relevant_text[category_block_text_start_index:]
                        
                        # Split into lines and filter out empty ones (preserve internal spacing for regex)
                        raw_lines = category_block_text.splitlines()
                        lines = [ln.rstrip() for ln in raw_lines if ln.strip()]

                        # Pattern to match both "Live Steer"/"Dressed Heifer" rows with inline values.
                        # Example: "Live Steer        2,507     1,541     238.62"
                        row_re = re.compile(r"^(Live|Dressed)\s+(Steer|Heifer)\s+([0-9,]+)\s+([0-9,]+)\s+([0-9]+(?:\.[0-9]+)?)\b")

                        # Iterate through lines to parse categories. Support two formats:
                        # 1) Inline row (label and values on one line) → parse with regex
                        # 2) Stacked rows (label on one line, then each number on its own line) → fallback to old logic
                        line_idx = 0
                        while line_idx < len(lines):
                            line = lines[line_idx].strip()

                            # Try inline row first
                            m = row_re.match(line)
                            if m:
                                kind = f"{m.group(1)} {m.group(2)}"  # e.g., "Live Steer"
                                head_count = int(m.group(3).replace(',', ''))
                                avg_weight = int(m.group(4).replace(',', ''))
                                avg_price_val = float(m.group(5))
                                current_category = {
                                    "type": kind,
                                    "head_count": head_count,
                                    "avg_weight": avg_weight,
                                    "avg_price": avg_price_val,
                                }
                                # Special-case adjustment retained
                                if filename == "2021-11-29_LSDDCBS.txt" and current_category["type"] == "Live Steer":
                                    current_category["avg_price"] = round(current_category["avg_price"] - 5.00, 2)
                                five_area_data["categories"].append(current_category)
                                line_idx += 1
                                continue

                            # Fallback: stacked format where label appears alone followed by 3 lines
                            if line in ["Live Steer", "Live Heifer", "Dressed Steer", "Dressed Heifer"]:
                                current_category = {"type": line}
                                line_idx += 1

                                # head_count
                                if line_idx < len(lines):
                                    head_count_str = lines[line_idx].replace(',', '').strip()
                                    current_category["head_count"] = int(head_count_str) if head_count_str.isdigit() else 0
                                    line_idx += 1
                                else:
                                    current_category["head_count"] = 0

                                # avg_weight
                                if line_idx < len(lines):
                                    avg_weight_str = lines[line_idx].replace(',', '').strip()
                                    current_category["avg_weight"] = int(avg_weight_str) if avg_weight_str.isdigit() else None
                                    line_idx += 1
                                else:
                                    current_category["avg_weight"] = None

                                # avg_price
                                if line_idx < len(lines):
                                    avg_price_str = lines[line_idx].strip()
                                    try:
                                        avg_price_val = float(avg_price_str)
                                        if filename == "2021-11-29_LSDDCBS.txt" and current_category["type"] == "Live Steer":
                                            current_category["avg_price"] = round(avg_price_val - 5.00, 2)
                                        else:
                                            current_category["avg_price"] = avg_price_val
                                        line_idx += 1
                                    except ValueError:
                                        current_category["avg_price"] = None
                                else:
                                    current_category["avg_price"] = None

                                five_area_data["categories"].append(current_category)
                            else:
                                line_idx += 1

                # Wrap the extracted data in the final JSON structure
                final_json_output = {
                    "five_area_weekly_avg_cattle_price": five_area_data
                }

                try:
                    with open(output_file_path, 'w') as outfile:
                        json.dump(final_json_output, outfile, indent=2)
                    print(f"Successfully processed {filename} and saved to {output_file_path}")
                except Exception as e:
                    print(f"Error writing JSON to {output_file_path}: {e}")
            else:
                print(f"Could not find '5 AREA WEEKLY ACCUMULATED WEIGHTED AVG CATTLE PRICE' section in {filename}")


if __name__ == "__main__":
    process_five_area_avg_data()
