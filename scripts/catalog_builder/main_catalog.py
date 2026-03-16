#!/usr/bin/env python3
"""Process all catalog components and assemble the final catalog."""
import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")


def run() -> None:
    module_prefix = "scripts.catalog_builder"
    project_root = Path(__file__).resolve().parents[2]

    logging.info("Running process_all.py...")
    subprocess.run(
        [sys.executable, "-m", f"{module_prefix}.process_all"],
        check=True,
        cwd=project_root,
    )

    logging.info("Running merge_catalogs.py...")
    subprocess.run(
        [sys.executable, "-m", f"{module_prefix}.merge_catalogs"],
        check=True,
        cwd=project_root,
    )


def main() -> int:
    run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
