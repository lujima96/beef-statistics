# USDA Beef Data Scraper — Microservice

Scrapes USDA MyMarketNews for daily beef market reports and the EIA API for weekly diesel prices.
Each report is parsed into structured JSON and stored locally on disk.
A lightweight REST API lets any downstream application trigger runs and pull data.
No database required — the consumer decides how to store it.

---

## How it works

1. **Link updater** — checks USDA MyMarketNews for any report URLs not yet in the local link lists
2. **Fetcher** — downloads raw report text/PDFs for any dates not already on disk
3. **Parser** — converts raw files to structured JSON for any dates not already parsed
4. **Diesel** — appends new weekly EIA diesel prices to a local CSV from the last known date forward

Every run is incremental. Already-downloaded files are never re-fetched. Already-parsed files are never re-processed.

---

## Reports collected

| Key | Source | Description |
|---|---|---|
| `boxed_am` | USDA AMS | Boxed beef morning report |
| `boxed_pm` | USDA AMS | Boxed beef afternoon report |
| `catalog` | USDA AMS | National daily cattle & beef summary |
| `index` | USDA AMS | Beef carcass equivalent index |
| `trimmings_am` | USDA AMS | Boneless trimmings morning report |
| `trimmings_pm` | USDA AMS | Boneless trimmings afternoon report |
| `diesel` | EIA API | U.S. weekly ULSD retail prices (from 2018) |

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

### 3. Start the service

```bash
# From the project directory
python start.py

# Or from anywhere — paths resolve relative to the script's location
python /path/to/beef-statistics-main/start.py
```

Binds to `http://0.0.0.0:8000` by default.
API docs available at `http://localhost:8000/docs`.

### 4. Run the pipeline

Trigger a full run via the API to start collecting data:

```bash
curl -X POST http://localhost:8000/run/all
```

Then poll `/status` to see when it finishes. Subsequent runs only pull new data.

---

## Running alongside another application

The service runs as its own process and communicates only over HTTP — it has no shared state with the calling application.

**Start it programmatically:**

```python
import os
import subprocess
import sys
from pathlib import Path

proc = subprocess.Popen(
    [sys.executable, str(Path("/path/to/beef-statistics-main/start.py"))],
    env={**os.environ, "SERVICE_PORT": "8000"},
)

# Shut it down when done
proc.terminate()
```

**Call it from your application:**

```python
import requests

# Trigger a pipeline run (non-blocking)
requests.post("http://localhost:8000/run/all")

# Check status
status = requests.get("http://localhost:8000/status").json()

# Pull the latest boxed AM report
data = requests.get("http://localhost:8000/data/boxed_am/latest").json()
```

If port 8000 is already in use, set `SERVICE_PORT` to any free port.

---

## API reference

### Trigger runs

All run endpoints are non-blocking — the pipeline executes in the background.
Returns `409` if a run is already in progress.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/run/all` | Full run: update links → fetch → parse → diesel |
| `POST` | `/run/fetch` | Update links and download raw USDA files only |
| `POST` | `/run/transform` | Parse already-downloaded raw files to JSON only |
| `POST` | `/run/diesel` | Fetch latest diesel prices from EIA only |

### Status

```
GET /status
```

Returns pipeline state, file count and latest date per report type, and diesel row count.

### Data

```
GET /data/diesel                     # all diesel prices as a JSON array
GET /data/{report_type}/dates        # list of available dates
GET /data/{report_type}/latest       # most recent parsed report
GET /data/{report_type}/{date}       # report for a specific date (YYYY-MM-DD)
```

Valid `report_type` values: `boxed_am`, `boxed_pm`, `catalog`, `index`, `trimmings_am`, `trimmings_pm`

**Examples:**

```bash
curl http://localhost:8000/status
curl http://localhost:8000/data/boxed_am/latest
curl http://localhost:8000/data/boxed_am/2025-03-20
curl http://localhost:8000/data/trimmings_pm/dates
curl http://localhost:8000/data/diesel
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

links/                        # USDA report URL lists, updated by the link updater
```

`raw/`, `processed/`, and `csv/` are gitignored — they are populated at runtime.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `EIA_TOKEN` | Yes | — | EIA API key for diesel price fetching |
| `EIA_SERIES_ID` | No | `PET.EMD_EPD2DXL0_PTE_NUS_DPG.W` | EIA series ID to fetch |
| `SERVICE_HOST` | No | `0.0.0.0` | Host to bind the service to |
| `SERVICE_PORT` | No | `8000` | Port to bind the service to |
| `SERVICE_RELOAD` | No | `false` | Enable hot-reload (development only) |
