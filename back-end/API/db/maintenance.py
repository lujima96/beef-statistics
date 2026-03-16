from __future__ import annotations

from decimal import Decimal, InvalidOperation
from datetime import date
from typing import Any, List, Mapping, Optional

import psycopg
from psycopg import sql as psql


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_decimal(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    try:
        text = str(value).strip()
        if not text:
            return None
        return Decimal(text)
    except (InvalidOperation, ValueError, TypeError):
        return None


def create_maintenance_entry(conn: psycopg.Connection, entry: Mapping[str, Any]) -> int:
    insert_query = psql.SQL(
        """
        INSERT INTO {}.{} (
            report_date,
            mileage,
            make,
            service_location,
            address,
            labor,
            parts,
            misc,
            shop_fee,
            tax,
            total,
            comments
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING maintenance_id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("maintenance_entries"))

    with conn.cursor() as cur:
        cur.execute(
            insert_query,
            (
                entry.get("report_date"),
                _as_decimal(entry.get("mileage")),
                entry.get("make"),
                entry.get("service_location"),
                entry.get("address"),
                _as_decimal(entry.get("labor")),
                _as_decimal(entry.get("parts")),
                _as_decimal(entry.get("misc")),
                _as_decimal(entry.get("shop_fee")),
                _as_decimal(entry.get("tax")),
                _as_decimal(entry.get("total")),
                entry.get("comments"),
            ),
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Failed to insert maintenance entry")
        return int(row[0])


def update_maintenance_entry(conn: psycopg.Connection, maintenance_id: int, entry: Mapping[str, Any]) -> int:
    update_query = psql.SQL(
        """
        UPDATE {}.{}
        SET
            report_date = %s,
            mileage = %s,
            make = %s,
            service_location = %s,
            address = %s,
            labor = %s,
            parts = %s,
            misc = %s,
            shop_fee = %s,
            tax = %s,
            total = %s,
            comments = %s
        WHERE maintenance_id = %s
        RETURNING maintenance_id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("maintenance_entries"))

    with conn.cursor() as cur:
        cur.execute(
            update_query,
            (
                entry.get("report_date"),
                _as_decimal(entry.get("mileage")),
                entry.get("make"),
                entry.get("service_location"),
                entry.get("address"),
                _as_decimal(entry.get("labor")),
                _as_decimal(entry.get("parts")),
                _as_decimal(entry.get("misc")),
                _as_decimal(entry.get("shop_fee")),
                _as_decimal(entry.get("tax")),
                _as_decimal(entry.get("total")),
                entry.get("comments"),
                maintenance_id,
            ),
        )
        row = cur.fetchone()
        if row is None:
            raise LookupError(f"Maintenance entry {maintenance_id} not found")
        return int(row[0])


def get_maintenance_entries_by_date(conn: psycopg.Connection, report_date: date) -> list[dict[str, Any]]:
    query = psql.SQL(
        """
        SELECT
            maintenance_id,
            report_date,
            mileage,
            make,
            service_location,
            address,
            labor,
            parts,
            misc,
            shop_fee,
            tax,
            total,
            comments,
            created_at
        FROM {}.{}
        WHERE report_date = %s
        ORDER BY created_at ASC, maintenance_id ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("maintenance_entries"))

    with conn.cursor() as cur:
        cur.execute(query, (report_date,))
        rows = cur.fetchall()

    results: list[dict[str, Any]] = []
    for (
        maintenance_id,
        row_report_date,
        mileage,
        make,
        service_location,
        address,
        labor,
        parts,
        misc,
        shop_fee,
        tax,
        total,
        comments,
        created_at,
    ) in rows:
        results.append(
            {
                "maintenance_id": int(maintenance_id),
                "report_date": row_report_date.isoformat() if hasattr(row_report_date, "isoformat") else row_report_date,
                "mileage": _to_float(mileage),
                "make": make,
                "service_location": service_location,
                "address": address,
                "labor": _to_float(labor),
                "parts": _to_float(parts),
                "misc": _to_float(misc),
                "shop_fee": _to_float(shop_fee),
                "tax": _to_float(tax),
                "total": _to_float(total),
                "comments": comments,
                "created_at": created_at.isoformat() if created_at is not None else None,
            }
        )

    return results


def get_maintenance_dates(conn: psycopg.Connection) -> List[str]:
    query = psql.SQL(
        """
        SELECT DISTINCT report_date
        FROM {}.{}
        WHERE report_date IS NOT NULL
        ORDER BY report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("maintenance_entries"))

    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return [
        value.isoformat() if hasattr(value, "isoformat") else str(value)
        for (value,) in rows
        if value is not None
    ]
