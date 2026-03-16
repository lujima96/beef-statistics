from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Mapping, Optional, Set, Tuple

import psycopg
from psycopg import errors, sql as psql


def _as_mapping(obj: Any) -> Dict[str, Any]:
    """Return a dictionary representation of a Pydantic model or mapping-like object."""

    if obj is None:
        return {}
    if isinstance(obj, Mapping):
        return dict(obj)
    if hasattr(obj, "model_dump"):
        return dict(obj.model_dump())  # type: ignore[attr-defined]
    if hasattr(obj, "dict"):
        return dict(obj.dict())  # type: ignore[attr-defined]
    if is_dataclass(obj):
        return asdict(obj)
    raise TypeError(f"Unsupported receipt payload type: {type(obj)!r}")


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
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
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _insert_fuel_receipt(conn: psycopg.Connection, receipt_data: Mapping[str, Any]) -> int:
    insert_receipt = psql.SQL(
        """
        INSERT INTO {}.{} (
            report_date,
            receipt_time,
            fuel_type,
            gallons,
            price_per_gallon,
            address,
            gas_station_name,
            comments
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING receipt_id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("fuel_receipts"))

    with conn.cursor() as cur:
        cur.execute(
            insert_receipt,
            (
                receipt_data.get("report_date"),
                receipt_data.get("receipt_time"),
                receipt_data.get("fuel_type"),
                receipt_data.get("gallons"),
                receipt_data.get("price_per_gallon"),
                receipt_data.get("address"),
                receipt_data.get("gas_station_name"),
                receipt_data.get("comments"),
            ),
        )
        receipt_id_row = cur.fetchone()
        if receipt_id_row is None:
            raise RuntimeError("Failed to insert fuel receipt record")
        return int(receipt_id_row[0])


def _insert_legacy_receipt(conn: psycopg.Connection, receipt_data: Mapping[str, Any]) -> int:
    total_amount = _as_decimal(receipt_data.get("total_amount"))
    gallons_value = _as_decimal(receipt_data.get("gallons")) or Decimal("0")
    price_value = _as_decimal(receipt_data.get("price_per_gallon")) or Decimal("0")
    if total_amount is None:
        total_amount = gallons_value * price_value

    insert_receipt = psql.SQL(
        """
        INSERT INTO {}.{} (receipt_date, store_name, total_amount)
        VALUES (%s, %s, %s)
        RETURNING id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipts"))

    insert_item = psql.SQL(
        """
        INSERT INTO {}.{} (receipt_id, item_name, quantity, unit_price)
        VALUES (%s, %s, %s, %s)
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipt_items"))

    fuel_type = receipt_data.get("fuel_type") or "fuel"
    gallons = gallons_value
    price_per_gallon = price_value

    with conn.cursor() as cur:
        cur.execute(
            insert_receipt,
            (
                receipt_data.get("report_date") or receipt_data.get("receipt_date"),
                receipt_data.get("gas_station_name") or receipt_data.get("store_name"),
                total_amount,
            ),
        )
        receipt_id_row = cur.fetchone()
        if receipt_id_row is None:
            raise RuntimeError("Failed to insert receipt record")
        receipt_id = int(receipt_id_row[0])

        cur.execute(
            insert_item,
            (
                receipt_id,
                fuel_type,
                gallons,
                price_per_gallon,
            ),
        )

    return receipt_id


def create_receipt(conn: psycopg.Connection, receipt: Any) -> int:
    """Persist a fuel receipt and return the created receipt id."""

    receipt_data = _as_mapping(receipt)

    try:
        return _insert_fuel_receipt(conn, receipt_data)
    except (errors.UndefinedTable, errors.UndefinedColumn):
        return _insert_legacy_receipt(conn, receipt_data)


def _update_fuel_receipt(conn: psycopg.Connection, receipt_id: int, receipt_data: Mapping[str, Any]) -> int:
    update_receipt = psql.SQL(
        """
        UPDATE {}.{}
        SET
            report_date = %s,
            receipt_time = %s,
            fuel_type = %s,
            gallons = %s,
            price_per_gallon = %s,
            address = %s,
            gas_station_name = %s,
            comments = %s
        WHERE receipt_id = %s
        RETURNING receipt_id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("fuel_receipts"))

    with conn.cursor() as cur:
        cur.execute(
            update_receipt,
            (
                receipt_data.get("report_date"),
                receipt_data.get("receipt_time"),
                receipt_data.get("fuel_type"),
                receipt_data.get("gallons"),
                receipt_data.get("price_per_gallon"),
                receipt_data.get("address"),
                receipt_data.get("gas_station_name"),
                receipt_data.get("comments"),
                receipt_id,
            ),
        )
        updated_row = cur.fetchone()
        if updated_row is None:
            raise KeyError(f"Receipt with id {receipt_id} not found in fuel_receipts")
        return int(updated_row[0])


def _select_primary_receipt_item(cur: psycopg.Cursor[Any], receipt_id: int) -> Optional[Tuple[int, Any, Any, Any]]:
    select_item = psql.SQL(
        """
        SELECT id, item_name, quantity, unit_price
        FROM {}.{}
        WHERE receipt_id = %s
        ORDER BY id ASC
        LIMIT 1
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipt_items"))

    cur.execute(select_item, (receipt_id,))
    return cur.fetchone()


def _update_legacy_receipt(conn: psycopg.Connection, receipt_id: int, receipt_data: Mapping[str, Any]) -> int:
    total_amount = _as_decimal(receipt_data.get("total_amount"))
    gallons_value = _as_decimal(receipt_data.get("gallons")) or Decimal("0")
    price_value = _as_decimal(receipt_data.get("price_per_gallon")) or Decimal("0")

    if total_amount is None:
        total_amount = gallons_value * price_value

    update_receipt = psql.SQL(
        """
        UPDATE {}.{}
        SET receipt_date = %s,
            store_name = %s,
            total_amount = %s
        WHERE id = %s
        RETURNING id
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipts"))

    update_item = psql.SQL(
        """
        UPDATE {}.{}
        SET item_name = %s,
            quantity = %s,
            unit_price = %s
        WHERE id = %s
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipt_items"))

    insert_item = psql.SQL(
        """
        INSERT INTO {}.{} (receipt_id, item_name, quantity, unit_price)
        VALUES (%s, %s, %s, %s)
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipt_items"))

    fuel_type = receipt_data.get("fuel_type") or "fuel"
    with conn.cursor() as cur:
        cur.execute(
            update_receipt,
            (
                receipt_data.get("report_date") or receipt_data.get("receipt_date"),
                receipt_data.get("gas_station_name") or receipt_data.get("store_name"),
                total_amount,
                receipt_id,
            ),
        )
        updated_receipt = cur.fetchone()
        if updated_receipt is None:
            raise KeyError(f"Receipt with id {receipt_id} not found in receipts")

        item_row = _select_primary_receipt_item(cur, receipt_id)
        if item_row is not None:
            item_id = int(item_row[0])
            cur.execute(
                update_item,
                (
                    fuel_type,
                    gallons_value,
                    price_value,
                    item_id,
                ),
            )
        else:
            cur.execute(
                insert_item,
                (
                    receipt_id,
                    fuel_type,
                    gallons_value,
                    price_value,
                ),
            )

    return int(receipt_id)


def update_receipt(conn: psycopg.Connection, receipt_id: int, receipt: Any) -> int:
    """Update an existing receipt and return its identifier."""

    receipt_data = _as_mapping(receipt)
    try:
        return _update_fuel_receipt(conn, receipt_id, receipt_data)
    except (errors.UndefinedTable, errors.UndefinedColumn):
        return _update_legacy_receipt(conn, receipt_id, receipt_data)


def _fetch_fuel_receipts(conn: psycopg.Connection, report_date: date) -> List[Dict[str, Any]]:
    receipts_query = psql.SQL(
        """
        SELECT
            receipt_id,
            report_date,
            receipt_time,
            fuel_type,
            gallons,
            price_per_gallon,
            address,
            gas_station_name,
            comments,
            ingested_at
        FROM {}.{}
        WHERE report_date = %s
        ORDER BY receipt_time NULLS LAST, ingested_at ASC, receipt_id ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("fuel_receipts"))

    with conn.cursor() as cur:
        cur.execute(receipts_query, (report_date,))
        receipt_rows = cur.fetchall()

    results: List[Dict[str, Any]] = []
    for (
        receipt_id,
        row_report_date,
        receipt_time,
        fuel_type,
        gallons,
        price_per_gallon,
        address,
        gas_station_name,
        comments,
        ingested_at,
    ) in receipt_rows:
        results.append(
            {
                "receipt_id": int(receipt_id) if receipt_id is not None else None,
                "report_date": row_report_date.isoformat()
                if hasattr(row_report_date, "isoformat")
                else row_report_date,
                "receipt_time": receipt_time.isoformat() if receipt_time is not None else None,
                "fuel_type": fuel_type,
                "gallons": _to_float(gallons),
                "price_per_gallon": _to_float(price_per_gallon),
                "address": address,
                "gas_station_name": gas_station_name,
                "comments": comments,
                "ingested_at": ingested_at.isoformat() if ingested_at is not None else None,
            }
        )

    return results


def _fetch_legacy_receipts(conn: psycopg.Connection, report_date: date) -> List[Dict[str, Any]]:
    receipts_query = psql.SQL(
        """
        SELECT id, receipt_date, store_name, total_amount, created_at
        FROM {}.{}
        WHERE receipt_date = %s
        ORDER BY created_at ASC, id ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipts"))

    items_query = psql.SQL(
        """
        SELECT receipt_id, item_name, quantity, unit_price
        FROM {}.{}
        WHERE receipt_id = ANY(%s)
        ORDER BY id ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipt_items"))

    with conn.cursor() as cur:
        cur.execute(receipts_query, (report_date,))
        receipt_rows = cur.fetchall()

        receipt_ids = [int(row[0]) for row in receipt_rows]
        items_map: Dict[int, List[Mapping[str, Any]]] = {rid: [] for rid in receipt_ids}

        if receipt_ids:
            cur.execute(items_query, (receipt_ids,))
            for rid, item_name, quantity, unit_price in cur.fetchall():
                items_map.setdefault(int(rid), []).append(
                    {
                        "item_name": item_name,
                        "quantity": quantity,
                        "unit_price": unit_price,
                    }
                )

    results: List[Dict[str, Any]] = []
    for receipt_id, row_date, store_name, _total_amount, created_at in receipt_rows:
        rid = int(receipt_id) if receipt_id is not None else None
        items: Iterable[Mapping[str, Any]] = items_map.get(int(receipt_id), []) if receipt_id is not None else []
        primary_item = next(iter(items), {}) if items else {}
        results.append(
            {
                "receipt_id": rid,
                "report_date": row_date.isoformat() if hasattr(row_date, "isoformat") else row_date,
                "receipt_time": None,
                "fuel_type": primary_item.get("item_name") or "fuel",
                "gallons": _to_float(primary_item.get("quantity")),
                "price_per_gallon": _to_float(primary_item.get("unit_price")),
                "address": None,
                "gas_station_name": store_name,
                "comments": None,
                "ingested_at": created_at.isoformat() if created_at is not None else None,
            }
        )

    return results


def get_receipts_by_date(conn: psycopg.Connection, report_date: date) -> List[Dict[str, Any]]:
    """Return fuel receipts for a specific report date."""

    try:
        return _fetch_fuel_receipts(conn, report_date)
    except (errors.UndefinedTable, errors.UndefinedColumn):
        return _fetch_legacy_receipts(conn, report_date)


def _fetch_fuel_receipt_dates(conn: psycopg.Connection) -> List[str]:
    query = psql.SQL(
        """
        SELECT DISTINCT report_date
        FROM {}.{}
        WHERE report_date IS NOT NULL
        ORDER BY report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("fuel_receipts"))

    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return [
        value.isoformat() if hasattr(value, "isoformat") else str(value)
        for (value,) in rows
        if value is not None
    ]


def _fetch_legacy_receipt_dates(conn: psycopg.Connection) -> List[str]:
    query = psql.SQL(
        """
        SELECT DISTINCT receipt_date
        FROM {}.{}
        WHERE receipt_date IS NOT NULL
        ORDER BY receipt_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("receipts"))

    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return [
        value.isoformat() if hasattr(value, "isoformat") else str(value)
        for (value,) in rows
        if value is not None
    ]


def get_receipt_dates(conn: psycopg.Connection) -> List[str]:
    """Return a sorted list of distinct report dates that have stored receipts."""

    dates: Set[str] = set()

    try:
        for value in _fetch_fuel_receipt_dates(conn):
            dates.add(value)
    except (errors.UndefinedTable, errors.UndefinedColumn):
        # Clear the failed transaction before falling back to legacy schema.
        conn.rollback()
        pass

    try:
        for value in _fetch_legacy_receipt_dates(conn):
            dates.add(value)
    except (errors.UndefinedTable, errors.UndefinedColumn):
        conn.rollback()
        pass

    return sorted(dates)
