Beef Stats API
==============

Overview
--------
Simple FastAPI service exposing time-series endpoints for charting.

Run (dev)
---------
1) Install deps:
   pip install -r requirements-api.txt

2) Set Postgres env vars (or use defaults):
   - `PGHOST` (default `localhost`)
   - `PGPORT` / `PG_HOST_PORT` (default `5432`)
   - `POSTGRES_DB` / `PGDATABASE` (default `beef_data`)
   - `POSTGRES_USER` / `PGUSER` (default `postgres`)
   - `POSTGRES_PASSWORD` / `PGPASSWORD`

3) Start server:
   uvicorn beef_stats.api.server:app --reload

Endpoint: Boxed Primals Time Series
-----------------------------------
GET `/api/boxed-primals/timeseries`

Query params
- `primal` (required): one of
  `primal_rib | primal_chuck | primal_round | primal_loin | primal_brisket | primal_short_plate | primal_flank`
- `grade` (required): `choice | select`
- `start_date` (optional): `YYYY-MM-DD`
- `end_date`   (optional): `YYYY-MM-DD`

Response
{
  "primal": "primal_rib",
  "grade": "choice",
  "series": {
    "am": [{"date": "2024-01-02", "value": 406.5}, ...],
    "pm": [{"date": "2024-01-02", "value": 405.2}, ...]
  }
}

Notes
- Reads from `beef_data.boxed_am_reports_json` and `beef_data.boxed_pm_reports_json`.
- Values come from `payload.composite_primal_values[primal][grade]`.
- Inputs are validated against allow-lists to prevent SQL injection.

Endpoint: Metadata
------------------
GET `/api/boxed-primals/meta`
Lists allowed primals and grades for UI controls.

