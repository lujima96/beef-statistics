"""Filesystem paths used by the supply/demand loader."""
from __future__ import annotations

from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
OUTER_DIR = PACKAGE_ROOT.parents[2]
DEFAULT_ENV = OUTER_DIR / ".env"
STATE_DIR = OUTER_DIR / ".loader_state"
STATE_FILE = STATE_DIR / "supply_demand_indices.date"
WEIGHTS_FILE = OUTER_DIR / "config" / "supply_demand_weights.json"
