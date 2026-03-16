#!/usr/bin/env python3
"""Run all link updaters sequentially."""

import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")

BASE_DIR = Path(__file__).resolve().parent

SCRIPTS = [
    "update_boneless_trimmings_am.py",
    "update_boneless_trimmings_pm.py",
    "update_equiv_index.py",
    "update_national_daily_cattle_beef_summary_links.py",
    "updated_boxed_beef_am.py",
    "updated_boxed_beef_pm.py",
]


def run() -> None:
    """Execute each individual link updater script sequentially."""
    for script in SCRIPTS:
        path = BASE_DIR / script
        logging.info("\n==== Running %s ====", path.name)
        result = subprocess.run([sys.executable, str(path)], check=False)
        if result.returncode != 0:
            raise RuntimeError(f"{path.name} failed with exit code {result.returncode}")


def main() -> int:
    try:
        run()
    except RuntimeError as exc:
        logging.error("⚠️  %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
