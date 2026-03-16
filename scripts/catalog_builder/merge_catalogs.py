import json
import logging
from pathlib import Path

try:
    from ..config import PROCESSED_DIR as PROCESSED_ROOT
except ImportError:  # pragma: no cover
    from scripts.config import PROCESSED_DIR as PROCESSED_ROOT

logging.basicConfig(level=logging.INFO, format="%(message)s")

# Subdirectories inside processed_catalog containing component JSON files
COMPONENT_DIRS = [
    "report",
    "daily_cutout",
    "by_product_value",
    "five_area_avg",
    "slaughter",
    "beef_production",
    "carcass_price_index",
    "cutter",
    "cme_live_cattle",
    "cme_feeder_cattle",
]


def main():
    """Merge component JSON files into a single catalog JSON per date."""
    processed_base = PROCESSED_ROOT / "processed_catalog"
    finished_dir = processed_base / "finished_catalog"
    finished_dir.mkdir(parents=True, exist_ok=True)

    # Collect all dates available across component directories
    dates = set()
    for comp in COMPONENT_DIRS:
        comp_dir = processed_base / comp
        if not comp_dir.exists():
            continue
        for path in comp_dir.glob("*.json"):
            dates.add(path.stem)

    # Merge each date's components into a single JSON file
    for date in sorted(dates):
        merged = {}
        for comp in COMPONENT_DIRS:
            comp_file = processed_base / comp / f"{date}.json"
            if comp_file.exists():
                with open(comp_file, "r") as f:
                    merged.update(json.load(f))
        if merged:
            output_file = finished_dir / f"{date}.json"
            if output_file.exists():
                logging.info("Skipping merge for %s, %s already exists", date, output_file)
                continue
            with open(output_file, "w") as f:
                json.dump(merged, f, indent=2)
            logging.info("Merged catalog written to %s", output_file)


if __name__ == "__main__":
    main()
