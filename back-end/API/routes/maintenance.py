from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

import routes
from config import config
from db import (
    create_maintenance_entry,
    get_maintenance_entries_by_date,
    get_maintenance_dates,
    update_maintenance_entry,
)

router = APIRouter()


class MaintenanceEntry(BaseModel):
    report_date: date
    mileage: Optional[float] = None
    make: Optional[str] = None
    service_location: Optional[str] = None
    address: Optional[str] = None
    labor: Optional[float] = None
    parts: Optional[float] = None
    misc: Optional[float] = None
    shop_fee: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    comments: Optional[str] = None

    @field_validator("make", "service_location", "address", "comments")
    @classmethod
    def _strip_strings(cls, value: Optional[str]) -> Optional[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            return stripped
        return value


@router.post("/api/maintenance")
async def submit_maintenance(entry: MaintenanceEntry) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            create_maintenance_entry(conn, entry.model_dump())
        return JSONResponse({"message": "Maintenance entry submitted successfully"})
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")


@router.put("/api/maintenance/{maintenance_id}")
async def update_maintenance(maintenance_id: int, entry: MaintenanceEntry) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            try:
                update_maintenance_entry(conn, maintenance_id, entry.model_dump())
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc))
        return JSONResponse({"message": "Maintenance entry updated successfully"})
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")


@router.get("/api/maintenance/{report_date}")
async def get_maintenance(report_date: date) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            entries = get_maintenance_entries_by_date(conn, report_date)
        return JSONResponse({"entries": entries})
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")
    except routes.psycopg.errors.UndefinedTable:
        return JSONResponse({"entries": []})


@router.get("/api/maintenance-dates")
async def list_maintenance_dates() -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            dates = get_maintenance_dates(conn)
        return JSONResponse({"dates": dates})
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")
    except routes.psycopg.errors.UndefinedTable:
        return JSONResponse({"dates": []})
