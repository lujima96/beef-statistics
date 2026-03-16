#!/usr/bin/env python3
from __future__ import annotations

import csv
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests

DEFAULT_SERIES_ID = "PET.EMD_EPD2DXL0_PTE_NUS_DPG.W"
API_URL = "https://api.eia.gov/v2/seriesid/"
MIN_DATE = date(2018, 1, 1)

BEEF_STATS_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BEEF_STATS_DIR / ".env"
OUTPUT_DIR = BEEF_STATS_DIR / "csv" / "energy"
OUTPUT_PATH = OUTPUT_DIR / "ulds_weekly_retail_prices.csv"


def load_env(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def parse_period(raw: str) -> Optional[date]:
    text = str(raw).strip()
    try:
        if len(text) == 10 and text[4] == "-" and text[7] == "-":
            return datetime.strptime(text, "%Y-%m-%d").date()
        if len(text) == 8 and text.isdigit():
            return datetime.strptime(text, "%Y%m%d").date()
        if len(text) == 6 and text.isdigit():
            return datetime.strptime(text + "01", "%Y%m%d").date()
    except ValueError:
        return None
    return None


def load_existing(path: Path) -> Tuple[Dict[date, float], Optional[date]]:
    data: Dict[date, float] = {}
    if not path.exists():
        return data, None
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        header_skipped = False
        for row in reader:
            if not header_skipped:
                header_skipped = True
                if row and row[0].lower() == "date":
                    continue
            if len(row) < 2:
                continue
            try:
                parsed_date = datetime.strptime(row[0], "%Y-%m-%d").date()
                price = float(row[1])
            except (ValueError, TypeError):
                continue
            data[parsed_date] = price
    last_date = max(data.keys()) if data else None
    return data, last_date


def fetch_series(api_key: str, series_id: str) -> List[Tuple[date, float]]:
    offset = 0
    length = 5000
    results: List[Tuple[date, float]] = []

    while True:
        params = {
            "api_key": api_key,
            "start": MIN_DATE.isoformat(),
            "offset": offset,
            "length": length,
        }

        url = f"{API_URL}{series_id}"

        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
        except requests.RequestException as exc:
            print(f"Failed to retrieve EIA data: {exc}", file=sys.stderr)
            raise SystemExit(1)

        try:
            payload = response.json()
        except ValueError as exc:
            print(f"Invalid JSON response for series '{series_id}': {exc}", file=sys.stderr)
            raise SystemExit(1)

        response_meta = payload.get("response")
        if not isinstance(response_meta, dict):
            print(f"Unexpected EIA payload for {series_id}: missing 'response'", file=sys.stderr)
            raise SystemExit(1)

        raw_data = None

        series_list = response_meta.get("series")
        if isinstance(series_list, list) and series_list:
            series = series_list[0]
            if isinstance(series, dict):
                raw_data = series.get("data")

        if raw_data is None:
            raw_data = response_meta.get("data")

        if not isinstance(raw_data, list):
            print(f"EIA response missing 'data' entries for {series_id}", file=sys.stderr)
            raise SystemExit(1)

        if not raw_data:
            break

        for entry in raw_data:
            if isinstance(entry, dict):
                period_raw = entry.get("period")
                value_raw = entry.get("value")
            elif isinstance(entry, (list, tuple)) and len(entry) >= 2:
                period_raw, value_raw = entry[0], entry[1]
            else:
                continue

            parsed_date = parse_period(str(period_raw))
            if parsed_date is None or parsed_date < MIN_DATE:
                continue
            if value_raw is None:
                continue
            try:
                value = float(value_raw)
            except (TypeError, ValueError):
                continue
            results.append((parsed_date, value))

        total = response_meta.get("total")
        if isinstance(total, int) and (offset + length) >= total:
            break

        if len(raw_data) < length:
            break

        offset += length

    results.sort(key=lambda x: x[0])
    return results


def filter_new_rows(rows: List[Tuple[date, float]], last_date: Optional[date]) -> List[Tuple[date, float]]:
    if last_date is None:
        return rows
    return [item for item in rows if item[0] > last_date]


def append_rows(path: Path, rows: List[Tuple[date, float]]) -> None:
    ensure_output_dir()
    file_exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        if not file_exists:
            writer.writerow(["date", "diesel_dollars_per_gallon"])
        for day, price in rows:
            writer.writerow([day.isoformat(), f"{price:.4f}"])


def main() -> None:
    env = load_env(ENV_PATH)
    for key, value in env.items():
        os.environ.setdefault(key, value)

    api_key = os.getenv("EIA_TOKEN")
    if not api_key:
        print("EIA_TOKEN is missing. Add it to .env or environment variables.", file=sys.stderr)
        raise SystemExit(1)

    series_id = os.getenv("EIA_SERIES_ID", DEFAULT_SERIES_ID)

    existing, last_date = load_existing(OUTPUT_PATH)
    series_data = fetch_series(api_key, series_id)
    new_rows = filter_new_rows(series_data, last_date)

    if not new_rows:
        print("No new diesel price data to append.")
        return

    append_rows(OUTPUT_PATH, new_rows)

    if existing:
        total_count = len(existing) + len(new_rows)
    else:
        total_count = len(series_data)

    print(f"Appended {len(new_rows)} rows using series {series_id!r}. Total rows from 2018: {total_count}.")
    print(f"Data file: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
