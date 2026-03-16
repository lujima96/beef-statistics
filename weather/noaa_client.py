"""HTTP client utilities for interacting with the NOAA API."""

from __future__ import annotations

import time
from datetime import date
from typing import Dict, List

import requests

from .config import BASE_URL, HEADERS


def get_state_location_ids() -> List[str]:
    """Fetch location IDs strictly for the 48 contiguous U.S. states."""

    print("Fetching state location IDs...")
    url = f"{BASE_URL}/locations?locationcategoryid=ST&limit=60"
    print(f"Requesting URL: {url}")

    whitelist_48 = {
        "Alabama", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
        "Delaware", "Florida", "Georgia", "Idaho", "Illinois", "Indiana", "Iowa",
        "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
        "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
        "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
        "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
        "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
        "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
        "West Virginia", "Wisconsin", "Wyoming",
    }

    for attempt in range(1, 4):
        try:
            response = requests.get(url, headers=HEADERS)
            print(f"Attempt {attempt}: Status Code {response.status_code}")
            response.raise_for_status()

            states = response.json().get("results", [])
            contiguous_states = [state for state in states if state["name"] in whitelist_48]

            print(f"Found {len(contiguous_states)} contiguous states.")
            return [state["id"] for state in contiguous_states]

        except requests.exceptions.RequestException as exc:
            print(f"Attempt {attempt} failed: {exc}")
            if attempt < 3:
                time.sleep(attempt * 2)
            else:
                raise

    return []


def fetch_temperature_data(
    state_ids: List[str], start_date: date, end_date: date
) -> Dict[str, Dict[str, List[float]]]:
    """Fetch temperature data for the given states within the requested window."""

    if start_date > end_date:
        return {}

    print(f"Fetching temperature data from {start_date} through {end_date}...")
    all_data: Dict[str, Dict[str, List[float]]] = {}

    for state_id in state_ids:
        for year in range(start_date.year, end_date.year + 1):
            year_start = max(date(year, 1, 1), start_date)
            year_end = min(date(year, 12, 31), end_date)
            if year_start > year_end:
                continue

            start_str = year_start.isoformat()
            end_str = year_end.isoformat()
            print(f"Fetching data for state {state_id} between {start_str} and {end_str}...")

            limit = 1000
            offset = 1
            total_records = None

            while True:
                url = (
                    f"{BASE_URL}/data?datasetid=GHCND&datatypeid=TAVG&locationid={state_id}"
                    f"&startdate={start_str}&enddate={end_str}&limit={limit}&offset={offset}"
                )
                print(f"Requesting URL: {url}")

                page_results = None
                for attempt in range(1, 4):
                    try:
                        response = requests.get(url, headers=HEADERS)
                        print(f"Attempt {attempt}: Status Code {response.status_code}")
                        response.raise_for_status()

                        if total_records is None:
                            total_header = response.headers.get("X-Total-Count")
                            if total_header is not None:
                                try:
                                    total_records = int(total_header)
                                except ValueError:
                                    total_records = None

                        page_results = response.json().get("results", [])
                        break
                    except requests.exceptions.RequestException as exc:
                        print(f"Attempt {attempt} for {state_id}/{year} failed: {exc}")
                        if attempt < 3:
                            time.sleep(attempt * 2)
                        else:
                            print(
                                f"Skipping page for state {state_id} in {year} after repeated failures."
                            )
                if page_results is None:
                    break

                for record in page_results:
                    rec_date = record["date"][0:10]
                    value = record.get("value")
                    if value is None:
                        continue

                    celsius = value / 10.0
                    fahrenheit = (celsius * 9 / 5) + 32

                    state_values = all_data.setdefault(rec_date, {})
                    state_values.setdefault(state_id, []).append(fahrenheit)

                retrieved = offset - 1 + len(page_results)
                if total_records is None:
                    if len(page_results) < limit:
                        break
                else:
                    if retrieved >= total_records:
                        break

                offset += limit
                time.sleep(0.2)

            time.sleep(0.2)

    return all_data
