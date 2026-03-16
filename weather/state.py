"""Helpers for maintaining incremental loader state."""

from __future__ import annotations

from datetime import date, datetime
from typing import Dict, Optional

from .config import STATE_DIR, STATE_FILE, TemperatureStats


def read_state_last_date() -> Optional[date]:
    """Return the last observation date persisted in the state file."""

    if not STATE_FILE.exists():
        return None

    try:
        line = STATE_FILE.read_text().strip()
    except OSError:
        return None

    if not line:
        return None

    first = line.split(",", 1)[0].strip()
    try:
        return datetime.strptime(first, "%Y-%m-%d").date()
    except ValueError:
        return None


def write_state_entry(day: str, stats: TemperatureStats) -> None:
    """Write the most recent aggregation values to the state file."""

    STATE_DIR.mkdir(parents=True, exist_ok=True)

    avg_val = stats.get("average_temperature")
    states_val = stats.get("states_reporting")
    stations_val = stats.get("station_observations")

    avg_text = "" if avg_val is None else repr(avg_val)
    states_text = "" if states_val is None else str(int(states_val))
    stations_text = "" if stations_val is None else str(int(stations_val))

    STATE_FILE.write_text(f"{day},{avg_text},{states_text},{stations_text}\n")


def update_state_from_existing(existing: Dict[str, TemperatureStats]) -> None:
    """Persist the most recent day from an existing aggregation mapping."""

    if not existing:
        return

    latest_day = max(existing.keys())
    write_state_entry(latest_day, existing[latest_day])
