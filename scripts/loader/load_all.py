#!/usr/bin/env python3
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    here = Path(__file__).resolve().parent
    loaders = [
        here / 'boxed_am_loader.py',
        here / 'boxed_pm_loader.py',
        here / 'catalog_loader.py',
        here / 'index_loader.py',
        here / 'trimmings_am_loader.py',
        here / 'trimmings_pm_loader.py',
        here / 'national_temperature_loader.py',
        here / 'diesel_price_loader.py',
        here / 'weather_occurrences_loader.py',
        here / 'feed_costs_loader.py',
    ]

    for script in loaders:
        logging.info("\n==== Running loader: %s ====", script.name)
        try:
            subprocess.run([sys.executable, str(script)], check=True)
        except subprocess.CalledProcessError as e:
            logging.error("⚠️  %s failed with exit code %s", script.name, e.returncode)


if __name__ == "__main__":
    main()
