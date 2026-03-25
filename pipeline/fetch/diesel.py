"""Wrapper for diesel price fetch task."""

from __future__ import annotations


def run() -> None:
    from scripts.energy.fetch_ulds_prices import main

    main()
