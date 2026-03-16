#!/usr/bin/env python3
"""Run all catalog component builders sequentially."""
import logging
import os
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    repo_root = base_dir.parent.parent
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo_root)

    scripts = [
        "beef_production.py",
        "by-product_value.py",
        "carcass_price_index.py",
        "cme_feeder_cattle.py",
        "cme_live_cattle.py",
        "cutter.py",
        "daily_cutout.py",
        "five_area_avg.py",
        "report.py",
        "slaughter.py",
    ]

    for script in scripts:
        script_path = base_dir / script
        if script_path.exists():
            logging.info("Running %s...", script)
            subprocess.run([sys.executable, str(script_path)], check=True, env=env)
        else:
            logging.info("Skipping %s, file not found", script)


if __name__ == "__main__":
    main()
