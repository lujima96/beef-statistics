"""High-level orchestration for fetching and persisting NOAA temperatures."""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta
from typing import Dict, Optional

import psycopg
import requests

from .config import CSV_PATH, TemperatureStats, build_dsn, connection_config
from .database import ensure_temperature_table, get_last_observation_date
from .noaa_client import fetch_temperature_data, get_state_location_ids
from .state import read_state_last_date, update_state_from_existing
from .storage import load_existing_csv, save_to_csv, sync_state_from_csv


def aggregate_data(all_data: Dict[str, Dict[str, list[float]]]) -> Dict[str, TemperatureStats]:
    """Aggregate temperature readings to national daily averages."""

    print("Aggregating data...")
    daily_averages: Dict[str, TemperatureStats] = {}

    for day, state_values in all_data.items():
        state_averages: list[float] = []
        station_counts = 0

        for temperatures in state_values.values():
            if not temperatures:
                continue
            station_counts += len(temperatures)
            state_averages.append(sum(temperatures) / len(temperatures))

        if state_averages:
            national_average = sum(state_averages) / len(state_averages)
            daily_averages[day] = {
                "average_temperature": national_average,
                "states_reporting": len(state_averages),
                "station_observations": station_counts,
            }

    return daily_averages


def determine_fetch_window(cur) -> tuple[date, Optional[date]]:
    """Work out the date range to request based on prior ingestions."""

    existing = load_existing_csv(CSV_PATH)
    csv_last_date: Optional[date] = None
    if existing:
        latest_day = max(existing.keys())
        try:
            csv_last_date = datetime.strptime(latest_day, "%Y-%m-%d").date()
        except ValueError:
            csv_last_date = None
        update_state_from_existing(existing)

    state_last = read_state_last_date()
    db_last = get_last_observation_date(cur)

    candidates = [d for d in (csv_last_date, state_last, db_last) if d is not None]
    last_known = max(candidates) if candidates else None
    start = date(2018, 1, 1) if last_known is None else last_known + timedelta(days=1)
    return start, last_known


def run() -> None:
    """Execute the full fetch, aggregation, and persistence workflow."""

    cfg = connection_config()
    dsn = build_dsn(cfg)

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                ensure_temperature_table(cur)
                fetch_start, last_observation = determine_fetch_window(cur)
    except psycopg.Error as exc:
        print(f"Database error while determining fetch window: {exc}", file=sys.stderr)
        return

    fetch_end = datetime.utcnow().date()

    if last_observation is not None and fetch_start > fetch_end:
        save_to_csv({})
        print(f"Temperature data already ingested through {last_observation}.")
        return

    try:
        state_location_ids = get_state_location_ids()
        if not state_location_ids:
            print("No state IDs fetched; aborting temperature pull.")
            sync_state_from_csv()
            return

        temperature_data = fetch_temperature_data(state_location_ids, fetch_start, fetch_end)
        if not temperature_data:
            print("No temperature data returned for the requested window.")
            sync_state_from_csv()
            return

        national_daily_averages = aggregate_data(temperature_data)
        if not national_daily_averages:
            print("No aggregated temperature data produced.")
            sync_state_from_csv()
            return

        new_rows = save_to_csv(national_daily_averages)
        new_min = min(national_daily_averages.keys())
        new_max = max(national_daily_averages.keys())
        print(
            f"Prepared {new_rows} new daily temperature rows spanning {new_min} through {new_max}."
        )
    except requests.exceptions.RequestException as exc:
        print(f"An error occurred with the API request: {exc}")
        sync_state_from_csv()
    except Exception as exc:  # noqa: BLE001 - last resort logging and state sync
        print(f"An unexpected error occurred: {exc}")
        sync_state_from_csv()


def main() -> int:
    run()
    return 0
