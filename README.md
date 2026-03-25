# USDA Beef Data Scraper

Scrapes USDA MyMarketNews for daily beef market reports and the EIA API for weekly diesel prices.
Each report is parsed into structured JSON and stored locally on disk.
Designed to be embedded directly into another Python project — no HTTP layer, no database required.

---

## How it works

1. **Link updater** — checks USDA MyMarketNews for any report URLs not yet in the local link lists
2. **Fetcher** — downloads raw report text/PDFs for any dates not already on disk
3. **Parser** — converts raw files to structured JSON for any dates not already parsed
4. **Diesel** — appends new weekly EIA diesel prices to a local CSV from the last known date forward

Every run is incremental. Already-downloaded files are never re-fetched. Already-parsed files are never re-processed.

---

## Reports collected

| Key | Description | Source |
|---|---|---|
| `boxed_am` | Boxed beef morning report | USDA AMS |
| `boxed_pm` | Boxed beef afternoon report | USDA AMS |
| `catalog` | National daily cattle & beef summary | USDA AMS |
| `index` | Beef carcass equivalent index | USDA AMS |
| `trimmings_am` | Boneless trimmings morning report | USDA AMS |
| `trimmings_pm` | Boneless trimmings afternoon report | USDA AMS |
| `diesel` | U.S. weekly ULSD retail prices (from 2018) | EIA API |

---

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

Chrome must be installed — the USDA scrapers use Selenium with headless Chrome.

### 2. Configure environment

```bash
cp .env.example .env
```

Set your EIA API token in `.env`:

```
EIA_TOKEN=your_eia_api_token_here
```

Free key available at https://www.eia.gov/opendata/register.php

---

## Usage

Add the project root to your Python path, then import and call directly:

```python
import sys
sys.path.insert(0, "/path/to/beef-statistics-main")

from pipeline.runner import run_pipeline
from scripts.energy.fetch_ulds_prices import main as fetch_diesel
```

### Run the full pipeline

```python
# Update links, fetch all new USDA reports, parse to JSON, fetch diesel
run_pipeline()
```

### Run specific stages only

```python
# Links + fetch only (no parsing)
run_pipeline(groups=["links", "fetch"])

# Parse only (raw files must already exist)
run_pipeline(groups=["transform"])

# Diesel only
fetch_diesel()
```

### Read the output

```python
import json
from pathlib import Path

ROOT = Path("/path/to/beef-statistics-main")

PROCESSED = {
    "boxed_am":     ROOT / "beef_stats/processed/processed_boxed_am",
    "boxed_pm":     ROOT / "beef_stats/processed/processed_boxed_pm",
    "catalog":      ROOT / "beef_stats/processed/processed_catalog",
    "index":        ROOT / "beef_stats/processed/processed_index",
    "trimmings_am": ROOT / "beef_stats/processed/processed_trimmings_am",
    "trimmings_pm": ROOT / "beef_stats/processed/processed_trimmings_pm",
}

# Latest report for a type
def get_latest(report_type: str) -> dict:
    files = sorted(PROCESSED[report_type].glob("*.json"))
    return json.loads(files[-1].read_text())

# Report for a specific date
def get_by_date(report_type: str, date: str) -> dict:
    path = PROCESSED[report_type] / f"{date}.json"
    return json.loads(path.read_text())

# All available dates for a type
def get_dates(report_type: str) -> list[str]:
    return sorted(p.stem for p in PROCESSED[report_type].glob("*.json"))

# Diesel prices
import csv
def get_diesel() -> list[dict]:
    path = ROOT / "csv/energy/ulds_weekly_retail_prices.csv"
    with path.open() as f:
        return list(csv.DictReader(f))
```

---

## Local file layout

```
beef_stats/
  raw/                        # downloaded USDA text files (one per report per date)
  processed/                  # parsed JSON output (YYYY-MM-DD.json per report type)
  json schema/                # reference schemas describing the JSON structure

csv/
  energy/
    ulds_weekly_retail_prices.csv   # diesel prices, appended incrementally

links/                        # USDA report URL lists, updated automatically
```

`raw/`, `processed/`, and `csv/` are gitignored — populated at runtime.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `EIA_TOKEN` | Yes | — | EIA API key for diesel price fetching |
| `EIA_SERIES_ID` | No | `PET.EMD_EPD2DXL0_PTE_NUS_DPG.W` | EIA series ID to fetch |
