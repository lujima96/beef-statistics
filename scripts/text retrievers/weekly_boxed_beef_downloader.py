#!/usr/bin/env python3
"""Download Weekly Boxed Beef PDFs (Cornell USDA library br86b359j)."""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.weekly_boxed_beef_downloader import main


if __name__ == "__main__":
    main()
