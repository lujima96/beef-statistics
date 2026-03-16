#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run all text retriever scripts in this directory sequentially."""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")


def run() -> None:
    this_file = Path(__file__).resolve()
    this_dir = this_file.parent
    scripts = sorted(
        p for p in this_dir.glob("*.py") if p.name != this_file.name
    )

    for script in scripts:
        logging.info("Running %s...", script.name)
        result = subprocess.run([sys.executable, str(script)], check=False)
        if result.returncode != 0:
            raise RuntimeError(f"{script.name} exited with code {result.returncode}")


def main() -> int:
    try:
        run()
    except RuntimeError as exc:
        logging.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
