"""USDA Beef Data Scraper — microservice entry point.

Exposes a DB-free REST API over the local pipeline:
  - trigger scrape/parse runs
  - serve processed JSON files directly from disk
  - serve diesel price CSV as JSON

Consumers call this service and handle their own storage.
"""

from __future__ import annotations

import csv
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="USDA Beef Data Scraper",
    description="Scrapes USDA MyMarketNews and EIA for beef market reports and diesel prices.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).parent

REPORT_TYPES = ["boxed_am", "boxed_pm", "catalog", "index", "trimmings_am", "trimmings_pm"]

PROCESSED_DIRS: Dict[str, Path] = {
    "boxed_am": ROOT / "beef_stats" / "processed" / "processed_boxed_am",
    "boxed_pm": ROOT / "beef_stats" / "processed" / "processed_boxed_pm",
    "catalog": ROOT / "beef_stats" / "processed" / "processed_catalog",
    "index": ROOT / "beef_stats" / "processed" / "processed_index",
    "trimmings_am": ROOT / "beef_stats" / "processed" / "processed_trimmings_am",
    "trimmings_pm": ROOT / "beef_stats" / "processed" / "processed_trimmings_pm",
}

DIESEL_CSV = ROOT / "csv" / "energy" / "ulds_weekly_retail_prices.csv"

# ---------------------------------------------------------------------------
# Pipeline state
# ---------------------------------------------------------------------------

_pipeline_lock = threading.Lock()
_pipeline_state: Dict[str, Any] = {
    "running": False,
    "last_run": None,
    "last_status": None,
    "last_groups": None,
}


def _run_pipeline_bg(groups: Optional[List[str]]) -> None:
    from pipeline.runner import run_pipeline

    with _pipeline_lock:
        _pipeline_state["running"] = True
        _pipeline_state["last_groups"] = groups
    try:
        rc = run_pipeline(groups)
        _pipeline_state["last_status"] = "success" if rc == 0 else "failed"
    except Exception as exc:  # noqa: BLE001
        _pipeline_state["last_status"] = f"error: {exc}"
    finally:
        _pipeline_state["running"] = False
        _pipeline_state["last_run"] = datetime.now(timezone.utc).isoformat()


def _run_diesel_bg() -> None:
    from scripts.energy.fetch_ulds_prices import main

    main()


# ---------------------------------------------------------------------------
# Run endpoints
# ---------------------------------------------------------------------------


@app.post("/run/all", summary="Run full pipeline: links → fetch → transform + diesel")
async def run_all(background_tasks: BackgroundTasks) -> Dict[str, Any]:
    if _pipeline_state["running"]:
        raise HTTPException(409, "Pipeline is already running")
    background_tasks.add_task(_run_pipeline_bg, None)
    return {"status": "started", "groups": ["links", "fetch", "transform"]}


@app.post("/run/fetch", summary="Fetch only: update links then download raw text files")
async def run_fetch(background_tasks: BackgroundTasks) -> Dict[str, Any]:
    if _pipeline_state["running"]:
        raise HTTPException(409, "Pipeline is already running")
    background_tasks.add_task(_run_pipeline_bg, ["links", "fetch"])
    return {"status": "started", "groups": ["links", "fetch"]}


@app.post("/run/transform", summary="Transform only: parse existing raw files to JSON")
async def run_transform(background_tasks: BackgroundTasks) -> Dict[str, Any]:
    if _pipeline_state["running"]:
        raise HTTPException(409, "Pipeline is already running")
    background_tasks.add_task(_run_pipeline_bg, ["transform"])
    return {"status": "started", "groups": ["transform"]}


@app.post("/run/diesel", summary="Fetch latest diesel prices from EIA API")
async def run_diesel(background_tasks: BackgroundTasks) -> Dict[str, Any]:
    background_tasks.add_task(_run_diesel_bg)
    return {"status": "started"}


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------


@app.get("/status", summary="Pipeline status and file counts per report type")
async def get_status() -> Dict[str, Any]:
    file_counts: Dict[str, int] = {}
    latest_dates: Dict[str, Optional[str]] = {}

    for report_type, path in PROCESSED_DIRS.items():
        if path.exists():
            files = sorted(path.glob("*.json"))
            file_counts[report_type] = len(files)
            latest_dates[report_type] = files[-1].stem if files else None
        else:
            file_counts[report_type] = 0
            latest_dates[report_type] = None

    diesel_rows = 0
    diesel_latest: Optional[str] = None
    if DIESEL_CSV.exists():
        rows: List[str] = DIESEL_CSV.read_text().splitlines()
        diesel_rows = max(len(rows) - 1, 0)
        if diesel_rows > 0:
            diesel_latest = rows[-1].split(",")[0]

    return {
        "pipeline": _pipeline_state.copy(),
        "file_counts": file_counts,
        "latest_dates": latest_dates,
        "diesel": {"rows": diesel_rows, "latest_date": diesel_latest},
    }


# ---------------------------------------------------------------------------
# Data endpoints — diesel
# ---------------------------------------------------------------------------


@app.get("/data/diesel", summary="Diesel weekly retail prices (EIA ULSD) as JSON")
async def get_diesel() -> List[Dict[str, str]]:
    if not DIESEL_CSV.exists():
        raise HTTPException(404, "Diesel data not yet fetched. POST /run/diesel first.")
    rows: List[Dict[str, str]] = []
    with DIESEL_CSV.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            rows.append(dict(row))
    return rows


# ---------------------------------------------------------------------------
# Data endpoints — USDA reports
# NOTE: /data/diesel is registered above; remaining parameterised routes follow.
# ---------------------------------------------------------------------------


@app.get("/data/{report_type}/dates", summary="List available dates for a report type")
async def get_dates(report_type: str) -> List[str]:
    if report_type not in PROCESSED_DIRS:
        raise HTTPException(404, f"Unknown report type '{report_type}'. Valid: {REPORT_TYPES}")
    path = PROCESSED_DIRS[report_type]
    if not path.exists():
        return []
    return sorted(p.stem for p in path.glob("*.json"))


@app.get("/data/{report_type}/latest", summary="Latest processed JSON for a report type")
async def get_latest(report_type: str) -> Any:
    if report_type not in PROCESSED_DIRS:
        raise HTTPException(404, f"Unknown report type '{report_type}'. Valid: {REPORT_TYPES}")
    path = PROCESSED_DIRS[report_type]
    if not path.exists():
        raise HTTPException(404, "No processed data available. POST /run/all first.")
    files = sorted(path.glob("*.json"))
    if not files:
        raise HTTPException(404, "No processed data available. POST /run/all first.")
    return json.loads(files[-1].read_text(encoding="utf-8"))


@app.get("/data/{report_type}/{date}", summary="Processed JSON for a specific date (YYYY-MM-DD)")
async def get_by_date(report_type: str, date: str) -> Any:
    if report_type not in PROCESSED_DIRS:
        raise HTTPException(404, f"Unknown report type '{report_type}'. Valid: {REPORT_TYPES}")
    file_path = PROCESSED_DIRS[report_type] / f"{date}.json"
    if not file_path.exists():
        raise HTTPException(404, f"No data for {report_type} on {date}.")
    return json.loads(file_path.read_text(encoding="utf-8"))
