import re
import json
import os
from pathlib import Path
try:
    from ..config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR
except ImportError:  # pragma: no cover
    from scripts.config import RAW_DIR, PROCESSED_DIR as PROCESSED_BASE_DIR

RAW_CATALOG_DIR = RAW_DIR / "raw_catalog"
PROCESSED_DIR = PROCESSED_BASE_DIR / "processed_catalog" / "daily_cutout"

def parse_daily_cutout(raw_text_content):
    data = {}

    # Weight Range
    weight_range_match = re.search(r'(\d{3}-\d{3}#)', raw_text_content)
    if weight_range_match:
        data['weight_range'] = weight_range_match.group(1)

    # Cutout Values and Change from Prior Day
    cutout_values_match = re.search(r'(?:Current )?Cutout Values:?\s*[\n\s]*(\d+\.\d+)\s*[\n\s]*(\d+\.\d+)\s*[\n\s]*(\d+\.\d+)', raw_text_content)
    if cutout_values_match:
        data['choice_cutout'] = float(cutout_values_match.group(1))
        data['select_cutout'] = float(cutout_values_match.group(2))
        data['choice_select_spread'] = float(cutout_values_match.group(3))

    # Change from Prior Day
    lines = re.split(r'\r?\n', raw_text_content)
    change_line_index = -1
    for i, line in enumerate(lines):
        stripped_line = line.strip()
        if "Change from prior day:" in stripped_line or "Change from Prior Day" in stripped_line:
            change_line_index = i
            break

    if change_line_index != -1:
        # Prefer numbers on the same line as the label
        line_text = lines[change_line_index]
        after_colon = line_text.split(":", 1)[1] if ":" in line_text else line_text

        def _parse_signed_tokens(s: str) -> list[float]:
            toks = re.findall(r"\(?-?\d+(?:\.\d+)?\)?", s)
            out: list[float] = []
            for t in toks:
                if t.startswith("(") and t.endswith(")"):
                    try:
                        out.append(-float(t[1:-1]))
                    except ValueError:
                        continue
                else:
                    try:
                        out.append(float(t))
                    except ValueError:
                        continue
            return out

        nums = _parse_signed_tokens(after_colon)

        # If not found on the same line, check the immediate next line only if it contains just two numbers
        if len(nums) < 2 and change_line_index + 1 < len(lines):
            next_line = lines[change_line_index + 1].strip()
            m = re.match(r"^\s*\(?-?\d+(?:\.\d+)?\)?\s+\(?-?\d+(?:\.\d+)?\)?\s*$", next_line)
            if m:
                nums = _parse_signed_tokens(next_line)

        if len(nums) >= 2:
            data['choice_change'] = nums[0]
            data['select_change'] = nums[1]


    # Primals
    primals = []
    lines = re.split(r'\r?\n', raw_text_content)
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        primal_match = re.match(r'Primal\s+(Rib|Chuck|Round|Loin|Brisket|Short Plate|Flank)', line)
        if primal_match:
            primal_name = primal_match.group(1)
            # Expect choice and select values on the next two lines
            if i + 2 < len(lines):
                try:
                    choice_value = float(lines[i+1].strip())
                    select_value = float(lines[i+2].strip())
                    primals.append({
                        "primal": primal_name,
                        "choice": choice_value,
                        "select": select_value
                    })
                    i += 2 # Skip the next two lines as they've been processed
                except ValueError:
                    # Handle cases where the next lines are not valid numbers
                    pass
        i += 1
    data['primals'] = primals

    # Loads
    loads = {}
    loads_total_match = re.search(r'Total\s+(\d+)', raw_text_content)
    if loads_total_match:
        loads['total'] = int(loads_total_match.group(1))
    loads_choice_match = re.search(r'Choice\s+(\d+)', raw_text_content)
    if loads_choice_match:
        loads['choice'] = int(loads_choice_match.group(1))
    loads_select_match = re.search(r'Select\s+(\d+)', raw_text_content)
    if loads_select_match:
        loads['select'] = int(loads_select_match.group(1))
    loads_trimmings_match = re.search(r'Trimmings\s+(\d+)', raw_text_content)
    if loads_trimmings_match:
        loads['trimmings'] = int(loads_trimmings_match.group(1))
    loads_grinds_match = re.search(r'Grinds\s+(\d+)', raw_text_content)
    if loads_grinds_match:
        loads['grinds'] = int(loads_grinds_match.group(1))
    data['loads'] = loads

    # Fresh 50% Trimmings
    fresh_trimmings = {}
    fresh_trimmings_match = re.search(r'Fresh 50% Trimmings\s*[\n\s]*(\d+)\s+Loads\s+@\s*[\n\s]*([-\d\.]+)', raw_text_content)
    if fresh_trimmings_match:
        fresh_trimmings['loads'] = int(fresh_trimmings_match.group(1))
        fresh_trimmings['price'] = float(fresh_trimmings_match.group(2))
    data['fresh_50pct_trimmings'] = fresh_trimmings

    return data

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

        parsed_data = parse_daily_cutout(raw_text_content)

        final_json_output = {"daily_estimated_cutout_values": parsed_data}

        try:
            with open(output_json_file, 'w') as f:
                json.dump(final_json_output, f, indent=2)
            print(f"Successfully processed {filename} and saved to {output_json_file}")
        except Exception as e:
            print(f"Error writing JSON to {output_json_file}: {e}")

if __name__ == "__main__":
    main()
