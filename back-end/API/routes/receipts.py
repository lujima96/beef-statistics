from __future__ import annotations

from datetime import date, time
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

import routes
from config import config
from db import create_receipt, get_receipt_dates, get_receipts_by_date, update_receipt

router = APIRouter()


class FuelReceipt(BaseModel):
    report_date: date
    receipt_time: Optional[time] = None
    fuel_type: str
    gallons: float
    price_per_gallon: float
    address: Optional[str] = None
    gas_station_name: str
    comments: Optional[str] = None

    @field_validator("address")
    @classmethod
    def _empty_str_as_none(cls, value: Optional[str]) -> Optional[str]:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("comments")
    @classmethod
    def _normalize_comments(cls, value: Optional[str]) -> Optional[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            return stripped
        return value


@router.post("/api/receipts")
async def submit_receipt(receipt: FuelReceipt) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            create_receipt(conn, receipt)
        return JSONResponse({"message": "Receipt submitted successfully"})
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")


@router.get("/api/receipt-dates")
async def list_receipt_dates() -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            dates = get_receipt_dates(conn)
        return JSONResponse({"dates": dates})
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")


@router.put("/api/receipts/{receipt_id}")
async def update_receipt_entry(receipt_id: int, receipt: FuelReceipt) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            update_receipt(conn, receipt_id, receipt)
        return JSONResponse({"message": "Receipt updated successfully"})
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Receipt with id {receipt_id} not found")
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")


@router.get("/api/receipts/{receipt_date}")
async def get_receipts(receipt_date: date) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            receipts = get_receipts_by_date(conn, receipt_date)
        return JSONResponse({"receipts": receipts})
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
