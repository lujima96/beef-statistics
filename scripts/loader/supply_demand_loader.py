#!/usr/bin/env python3
"""Compute derived supply/demand indices and load them into Postgres."""
from __future__ import annotations

from scripts.loader.supply_demand import main


def run() -> None:
    """Run the supply/demand loader."""
    main()


if __name__ == "__main__":
    run()
