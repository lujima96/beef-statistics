#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch USDA 'Boneless Trimmings PM' reports (PDF or TXT) and write normalized text.

This module now delegates the heavy lifting to the ``raw_trimmings_pm`` package,
which contains the implementation split across focused modules.
"""

from __future__ import annotations

from raw_trimmings_pm import main as _main


def main() -> None:
    _main()


if __name__ == "__main__":
    main()
