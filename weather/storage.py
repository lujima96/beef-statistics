"""CSV persistence helpers for national average temperatures."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict

from .config import CSV_PATH, TemperatureStats
from .state import update_state_from_existing


def load_existing_csv(path: Path = CSV_PATH) -> Dict[str, TemperatureStats]:
    """Load previously aggregated temperatures from disk."""

    if not path.exists():
        return {}

    existing: Dict[str, TemperatureStats] = {}
    with path.open(newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            day = row.get("date")
            if not day:
                continue
            try:
                avg = float(row.get("average_temperature_f", "nan"))
            except ValueError:
                continue

            states_val = row.get("states_reporting")
            stations_val = row.get("station_observations")
            existing[day] = {
                "average_temperature": avg,
                "states_reporting": int(states_val) if states_val else None,
                "station_observations": int(stations_val) if stations_val else None,
            }
    return existing


def save_to_csv(daily_averages: Dict[str, TemperatureStats], path: Path = CSV_PATH) -> int:
    """Write aggregated data to disk, merging with existing entries."""

    existing = load_existing_csv(path)

    if not daily_averages:
        if existing:
            update_state_from_existing(existing)
            print("No new temperature data; CSV already up to date.")
        else:
            if not path.exists():
                with path.open("w", newline="", encoding="utf-8") as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(["date", "average_temperature_f", "states_reporting", "station_observations"])
                print("No temperature data available yet; created placeholder CSV.")
            else:
                print("No temperature data available yet; CSV not written.")
        return 0

    existing.update(daily_averages)
    sorted_dates = sorted(existing.keys())

    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["date", "average_temperature_f", "states_reporting", "station_observations"])
        for day in sorted_dates:
            stats = existing[day]
            writer.writerow([
                day,
                stats["average_temperature"],
                stats["states_reporting"] if stats["states_reporting"] is not None else "",
                stats["station_observations"] if stats["station_observations"] is not None else "",
            ])

    update_state_from_existing(existing)
    print(f"Saved temperature CSV with {len(sorted_dates)} total days.")
    return len(daily_averages)


def sync_state_from_csv(path: Path = CSV_PATH) -> None:
    """Ensure the loader state file mirrors the latest data on disk."""

    existing = load_existing_csv(path)
    update_state_from_existing(existing)
