from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

import routes
from config import config
from db import (
    delete_route_log_entry,
    fetch_route_log_by_date,
    fetch_route_log_dates,
    save_route_log_entry,
)

router = APIRouter()


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class RouteStopPayload(BaseModel):
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    start_miles: Optional[Decimal] = Field(default=None, ge=0)
    end_miles: Optional[Decimal] = Field(default=None, ge=0)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    odometer: Optional[Decimal] = Field(default=None, ge=0)
    cost: Optional[Decimal] = Field(default=None, ge=0)

    @field_validator("from_location", "to_location", mode="before")
    @classmethod
    def _sanitize_text(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)

    @field_validator("start_miles", "end_miles", "odometer", "cost", mode="before")
    @classmethod
    def _blank_numeric_as_none(cls, value: Optional[str]) -> Optional[str]:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _blank_time_as_none(cls, value: Optional[str]) -> Optional[str]:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class FuelStopPayload(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    odometer: Optional[Decimal] = Field(default=None, ge=0)
    cost: Optional[Decimal] = Field(default=None, ge=0)

    @field_validator("start_time", "end_time", "odometer", "cost", mode="before")
    @classmethod
    def _blank_values_as_none(cls, value: Optional[str]) -> Optional[str]:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class RouteLogPayload(BaseModel):
    report_date: date
    driver_name: Optional[str] = None
    truck: Optional[str] = Field(default=None, description="Truck identifier or description")
    route_stops: List[RouteStopPayload] = Field(default_factory=list)
    fuel_stop: Optional[FuelStopPayload] = None

    @field_validator("driver_name", "truck")
    @classmethod
    def _normalize_text(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_text(value)


@router.get("/api/route-logs/dates")
async def list_route_log_dates() -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            dates = fetch_route_log_dates(conn)
        return JSONResponse({"dates": dates})
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}") from exc
    except routes.psycopg.errors.UndefinedTable:
        return JSONResponse({"dates": []})


@router.get("/api/route-logs/{report_date}")
async def get_route_log(report_date: date) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            route_log = fetch_route_log_by_date(conn, report_date)
        return JSONResponse({"route_log": route_log})
    except LookupError:
        raise HTTPException(status_code=404, detail=f"No route log found for {report_date}")
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}") from exc
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(status_code=404, detail=f"No route log found for {report_date}")


@router.post("/api/route-logs")
async def save_route_log(payload: RouteLogPayload) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            save_route_log_entry(
                conn,
                report_date=payload.report_date,
                driver_name=payload.driver_name,
                truck_description=payload.truck,
                route_stops=[stop.model_dump() for stop in payload.route_stops],
                fuel_stop=payload.fuel_stop.model_dump() if payload.fuel_stop else None,
            )
        return JSONResponse({"message": "Route log saved successfully"})
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}") from exc


@router.delete("/api/route-logs/{report_date}")
async def delete_route_log(report_date: date) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            delete_route_log_entry(conn, report_date)
        return JSONResponse({"message": f"Deleted route log for {report_date}."})
    except LookupError:
        raise HTTPException(status_code=404, detail=f"No route log found for {report_date}")
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}") from exc
