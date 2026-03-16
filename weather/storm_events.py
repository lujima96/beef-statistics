"""Synchronize NOAA Storm Events yearly CSVs into ``weather/raw``.

The local ``weather_api_docs`` folder documents NOAA Climate Data Online (CDO),
which covers observations such as temperature. Storm Events are published
separately as annual bulk CSV files by NCEI, so this sync uses that official
feed instead of the CDO API.
"""

from __future__ import annotations

import gzip
import json
import re
import shutil
from pathlib import Path
from typing import Dict
from urllib.parse import urljoin

import requests

from .config import STATE_DIR

INDEX_URL = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
ROOT_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = Path(__file__).resolve().parent / "raw"
MANIFEST_PATH = STATE_DIR / "weather_events_sources.json"
MIN_YEAR = 2018
DETAILS_FILE_RE = re.compile(
    r"StormEvents_details-ftp_v1\.0_d(?P<year>\d{4})_c(?P<cycle>\d{8})\.csv(?:\.gz)?"
)


def _load_manifest() -> Dict[str, str]:
    if not MANIFEST_PATH.exists():
        return {}
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_manifest(data: Dict[str, str]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _latest_remote_files() -> Dict[int, str]:
    response = requests.get(INDEX_URL, timeout=60)
    response.raise_for_status()

    latest: Dict[int, tuple[str, str]] = {}
    for match in DETAILS_FILE_RE.finditer(response.text):
        year = int(match.group("year"))
        if year < MIN_YEAR:
            continue
        filename = match.group(0)
        cycle = match.group("cycle")
        current = latest.get(year)
        if current is None or cycle > current[1]:
            latest[year] = (filename, cycle)
    return {year: filename for year, (filename, _) in latest.items()}


def _latest_local_drop_files() -> Dict[int, Path]:
    latest: Dict[int, tuple[Path, str]] = {}
    for path in ROOT_DIR.glob("StormEvents_details-ftp_v1.0_d*_c*.csv*"):
        match = DETAILS_FILE_RE.fullmatch(path.name)
        if match is None:
            continue
        year = int(match.group("year"))
        if year < MIN_YEAR:
            continue
        cycle = match.group("cycle")
        current = latest.get(year)
        if current is None or cycle > current[1]:
            latest[year] = (path, cycle)
    return {year: path for year, (path, _) in latest.items()}


def _download_year_csv(filename: str, destination: Path) -> None:
    response = requests.get(urljoin(INDEX_URL, filename), timeout=120)
    response.raise_for_status()
    csv_bytes = gzip.decompress(response.content)
    destination.write_bytes(csv_bytes)


def _install_local_drop(source: Path, destination: Path) -> None:
    if source.suffix == ".gz":
        with gzip.open(source, "rb") as gz_handle:
            destination.write_bytes(gz_handle.read())
        return
    shutil.copyfile(source, destination)


def run() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    latest_files = _latest_remote_files()
    latest_local_files = _latest_local_drop_files()
    if not latest_files and not latest_local_files:
        print("No remote storm event files discovered.")
        return

    all_years = sorted(set(latest_files) | set(latest_local_files))
    latest_year = max(all_years)
    print(f"NOAA Storm Events feed currently exposes annual files through {latest_year}.")

    manifest = _load_manifest()
    downloaded = 0
    skipped = 0

    for year in all_years:
        filename = latest_files.get(year)
        local_source = latest_local_files.get(year)
        source_name = local_source.name if local_source is not None else filename
        destination = RAW_DIR / f"weather_events_{year}.csv"
        if destination.exists() and source_name is not None and manifest.get(str(year)) == source_name:
            skipped += 1
            continue

        if local_source is not None:
            print(f"Installing storm events for {year} from local file {local_source.name}...")
            _install_local_drop(local_source, destination)
            manifest[str(year)] = local_source.name
        elif filename is not None:
            print(f"Syncing storm events for {year} from {filename}...")
            _download_year_csv(filename, destination)
            manifest[str(year)] = filename
        else:
            continue
        downloaded += 1

    _save_manifest(manifest)
    print(
        f"Storm events sync complete. Downloaded {downloaded} year file(s), "
        f"skipped {skipped} unchanged year file(s)."
    )


__all__ = ["run"]
