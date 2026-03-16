# Beef Stats Project

Beef Stats is a full-stack data product that collects, enriches, and visualizes statistics about the
United States beef industry.  It automates the end-to-end workflow: gathering raw datasets, loading
them into a PostgreSQL warehouse, exposing curated views through a FastAPI backend, and rendering the
insights in a modern React dashboard.  The repository also packages a GraphHopper routing service so
logistics calculations are available alongside the market data.

---

## Table of Contents
- [Core Capabilities](#core-capabilities)
- [How the System Works](#how-the-system-works)
- [Repository Layout](#repository-layout)
- [Running the Stack Locally](#running-the-stack-locally)
  - [1. Install Prerequisites](#1-install-prerequisites)
  - [2. Configure Environment Variables](#2-configure-environment-variables)
  - [3. Prepare the GraphHopper Map](#3-prepare-the-graphhopper-map)
  - [4. Start the Development Environment](#4-start-the-development-environment)
  - [5. Verify the Services](#5-verify-the-services)
  - [6. Populate and Refresh Data](#6-populate-and-refresh-data)
- [Troubleshooting Tips](#troubleshooting-tips)
- [Additional Scripts](#additional-scripts)

---

## Core Capabilities
- **Automated data pipeline** – Python loaders under `beef_stats/scripts/` fetch USDA and weather
  datasets listed in `beef_stats/links/`, clean them, and shape them for analytics.
- **Centralized warehouse** – PostgreSQL tables and views defined in `beef_stats/sql/` organize the
  data for reporting and for the API layer.
- **FastAPI backend** – The application in `beef_stats/back-end/API/` exposes REST endpoints and
  typed schemas so the frontend and external consumers can query the curated datasets.
- **React + Vite dashboard** – The SPA under `beef_stats/front_end/` renders charts, tables, and
  routing widgets that help stakeholders explore the beef supply chain.
- **GraphHopper routing** – A co-located routing engine computes drive times and routes used by the
  backend to augment logistics analytics.

## How the System Works
1. **Data acquisition** – Loader scripts download CSV, JSON, and geospatial sources from URLs listed
   in `beef_stats/links/`.  New sources can be added by dropping additional URLs into that folder.
2. **Transformation** – The scripts standardize columns, reconcile time periods, and enrich
   geographies before writing intermediate artifacts to the `csv/` staging directory.
3. **Warehouse loading** – SQL in `beef_stats/sql/` creates schemas (`beef_data`, `beef_staging`,
   etc.) and moves curated facts and dimensions into PostgreSQL.
4. **API exposure** – The FastAPI service reads from PostgreSQL and GraphHopper, providing JSON
   endpoints for dashboards and external consumers.
5. **Visualization** – The React frontend consumes the API to render interactive charts, tables, and
   maps.

The `start_dev.py` bootstrapper coordinates these pieces by ensuring the database and routing
containers are running, installing frontend dependencies, and launching the API and web UI with live
reload enabled.  During development this script is the single command you run to bring the entire
stack online.

## Repository Layout
```
.
├── beef_stats/
│   ├── back-end/            # FastAPI application and shared settings
│   ├── front_end/           # React + Vite frontend
│   ├── links/               # Canonical list of external data sources
│   ├── scripts/             # ETL/ELT pipeline modules
│   └── sql/                 # DDL, stored procedures, and views for PostgreSQL
├── docker-compose.yml       # Postgres + GraphHopper services for development
├── graphhopper/config.yml   # GraphHopper container configuration
├── requirements-api.txt     # Python dependencies for the backend
└── start_dev.py             # Orchestrates all services for local development
```

## Running the Stack Locally

### 1. Install Prerequisites
Make sure the following tooling is available on your machine:

- Python 3.10+
- Node.js 18+ with your preferred package manager (`npm`, `yarn`, or `pnpm`)
- Docker and Docker Compose (either `docker compose` or the legacy `docker-compose` CLI)

### 2. Configure Environment Variables
Create a `.env` file **inside `beef_stats/`** with the variables required by the backend and the
bootstrap script:

```
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_DB=beef_data
PG_HOST_PORT=5432

# GraphHopper configuration (absolute path is required for Docker volume mounting)
GRAPHHOPPER_MAP_FILE=/absolute/path/to/map.osm.pbf
# Optional overrides
# GRAPHHOPPER_HOST_PORT=8989
# GRAPHHOPPER_TIMEOUT=10
```

You can also place the `.env` file at the repository root; `start_dev.py` searches both locations.

### 3. Prepare the GraphHopper Map
1. Download an OpenStreetMap extract (`*.osm.pbf`) that covers the region you need.  The default
   configuration is tuned for Arkansas via Geofabrik:
   <https://download.geofabrik.de/north-america/us/arkansas-latest.osm.pbf>
2. Update `GRAPHHOPPER_MAP_FILE` in your `.env` to reference the downloaded file with an absolute
   path.  Docker binds this file into the GraphHopper container at `/data/map.osm.pbf`.

### 4. Start the Development Environment
From the repository root, run:

```bash
python start_dev.py
```

The script performs the following steps:
- Loads environment variables.
- Uses Docker Compose to start (or reuse) the PostgreSQL and GraphHopper containers.
- Installs frontend dependencies if `node_modules/` is missing.
- Launches the Vite dev server on port `5173`.
- Starts the FastAPI application with Uvicorn on port `8000` once GraphHopper is reachable.
- Streams logs to `frontend_dev.err` and `api_dev.err` for easy debugging.

### 5. Verify the Services
After `start_dev.py` reports that everything is running:

- Open the dashboard at <http://127.0.0.1:5173>.
- Explore the OpenAPI documentation for the backend at <http://127.0.0.1:8000/docs>.
- If you need direct database access, connect to PostgreSQL on `localhost:<PG_HOST_PORT>` using the
  credentials from your `.env` file.

### 6. Populate and Refresh Data
- The full ETL run can be executed from the project root:
  ```bash
  python beef_stats/main.py
  ```
  This orchestrates the loaders in `beef_stats/scripts/loader/`, updates staging tables, and promotes
  curated data into the reporting schema.
- Individual loaders (for example, weather ingestion) can also be invoked ad-hoc:
  ```bash
  python beef_stats/scripts/loader/national_temperature_loader.py
  ```
- SQL migration files inside `beef_stats/sql/` can be applied manually through your preferred
  database tool when you need to evolve the schema.

## Troubleshooting Tips
- **Docker compose not found** – `start_dev.py` checks both `docker compose` and `docker-compose`. If
  neither is installed, start PostgreSQL manually or install Docker Desktop/Engine.
- **GraphHopper fails to start** – Ensure the map file exists at the path configured in `.env`, and
  that your user has read permissions.
- **Ports already in use** – Change `PG_HOST_PORT`, `GRAPHHOPPER_HOST_PORT`, or the frontend/backend
  ports (5173/8000) in your environment to avoid collisions.
- **API cannot reach GraphHopper** – Confirm the routing service responds on
  `http://127.0.0.1:${GRAPHHOPPER_HOST_PORT}` and that the backend environment variables align with
  your configuration.

## Additional Scripts
- `scripts/` contains ad-hoc utilities such as data quality checks and CSV cleaning helpers used by
  the pipeline.
- `start_dev.py --help` is not required; open the file to review optional behavior such as LAN IP
  detection and log paths.
- `docker/` hosts additional Dockerfiles and configuration used for deployment or experimentation.

With these steps you should be able to clone the repository, spin up the full development stack, and
understand how data flows from external sources into the Beef Stats dashboard.
