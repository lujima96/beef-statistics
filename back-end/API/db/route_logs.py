from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Optional, Sequence

import psycopg
from psycopg import sql as psql

_ROUTE_LOG_SCHEMA_ENSURED = False


def _ensure_route_log_schema(conn: psycopg.Connection) -> None:
    """
    Ensure newer columns exist even if SQL migrations have not been applied.

    Older databases may lack the truck_description column; running the ALTER
    keeps the API compatible without forcing a manual migration step.
    """

    global _ROUTE_LOG_SCHEMA_ENSURED
    if _ROUTE_LOG_SCHEMA_ENSURED:
        return

    with conn.cursor() as cur:
        cur.execute(
            """
            ALTER TABLE IF EXISTS beef_data.route_logs
            ADD COLUMN IF NOT EXISTS truck_description TEXT
            """
        )
    _ROUTE_LOG_SCHEMA_ENSURED = True


def _normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_decimal(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        if value != value or value in (float("inf"), float("-inf")):
            return None
        return Decimal(str(value))
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return Decimal(text)
        except (InvalidOperation, ValueError):
            return None
    return None


def _as_time(value: Any) -> Optional[time]:
    if value is None:
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        for fmt in ("%H:%M", "%H:%M:%S"):
            try:
                return datetime.strptime(text, fmt).time()
            except ValueError:
                continue
    return None


def _time_to_text(value: Optional[time]) -> Optional[str]:
    if value is None:
        return None
    return value.strftime("%H:%M")


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        if value != value or value in (float("inf"), float("-inf")):
            return None
        return float(value)
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        return None
    return numeric


def save_route_log_entry(
    conn: psycopg.Connection,
    *,
    report_date: date,
    driver_name: Optional[str],
    truck_description: Optional[str],
    route_stops: Sequence[Mapping[str, Any]],
    fuel_stop: Optional[Mapping[str, Any]],
) -> int:
    _ensure_route_log_schema(conn)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM beef_data.route_logs
            WHERE report_date = %s
            FOR UPDATE
            """,
            (report_date,),
        )
        row = cur.fetchone()
        if row:
            route_log_id = int(row[0])
            cur.execute(
                """
                UPDATE beef_data.route_logs
                SET driver_name = %s,
                    truck_description = %s
                WHERE id = %s
                """,
                (driver_name, truck_description, route_log_id),
            )
            cur.execute("DELETE FROM beef_data.stops_in_route WHERE route_id = %s", (route_log_id,))
            cur.execute("DELETE FROM beef_data.fuel_stops WHERE route_log_id = %s", (route_log_id,))
        else:
            cur.execute(
                """
                INSERT INTO beef_data.route_logs (report_date, driver_name, truck_description)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (report_date, driver_name, truck_description),
            )
            inserted = cur.fetchone()
            if inserted is None:
                raise RuntimeError("Failed to insert route log entry")
            route_log_id = int(inserted[0])

        if route_stops:
            insert_stop = """
                INSERT INTO beef_data.stops_in_route (
                    route_id,
                    from_location,
                    to_location,
                    start_miles,
                    end_miles,
                    start_time,
                    end_time,
                    odometer,
                    cost,
                    is_fuel_stop
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """

            stop_rows = []
            for record in route_stops:
                from_location = _normalize_text(record.get("from_location") or record.get("from"))
                to_location = _normalize_text(record.get("to_location") or record.get("to"))
                start_miles = _as_decimal(record.get("start_miles"))
                end_miles = _as_decimal(record.get("end_miles"))
                start_time = _as_time(record.get("start_time"))
                end_time = _as_time(record.get("end_time"))
                odometer = _as_decimal(record.get("odometer"))
                cost = _as_decimal(record.get("cost"))

                if not any((from_location, to_location, start_miles, end_miles, start_time, end_time, odometer, cost)):
                    continue

                stop_rows.append(
                    (
                        route_log_id,
                        from_location,
                        to_location,
                        start_miles,
                        end_miles,
                        start_time,
                        end_time,
                        odometer,
                        cost,
                        False,
                    )
                )

            if stop_rows:
                cur.executemany(insert_stop, stop_rows)

        if fuel_stop:
            start_time = _as_time(fuel_stop.get("start_time"))
            end_time = _as_time(fuel_stop.get("end_time"))
            odometer = _as_decimal(fuel_stop.get("odometer"))
            cost = _as_decimal(fuel_stop.get("cost"))

            if any((start_time, end_time, odometer, cost)):
                insert_fuel_stop = """
                    INSERT INTO beef_data.fuel_stops (
                        report_date,
                        route_log_id,
                        start_time,
                        end_time,
                        odometer,
                        cost
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                """

                cur.execute(
                    insert_fuel_stop,
                    (report_date, route_log_id, start_time, end_time, odometer, cost),
                )

        return route_log_id


def fetch_route_log_dates(conn: psycopg.Connection) -> list[str]:
    query = psql.SQL(
        """
        SELECT DISTINCT report_date
        FROM {}.{}
        WHERE report_date IS NOT NULL
        ORDER BY report_date DESC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("route_logs"))

    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return [
        value.isoformat() if hasattr(value, "isoformat") else str(value)
        for (value,) in rows
        if value is not None
    ]


def fetch_route_log_by_date(conn: psycopg.Connection, report_date: date) -> dict[str, Any]:
    _ensure_route_log_schema(conn)

    route_log_query = psql.SQL(
        """
        SELECT id, driver_name, truck_description
        FROM {}.{}
        WHERE report_date = %s
        LIMIT 1
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("route_logs"))

    with conn.cursor() as cur:
        cur.execute(route_log_query, (report_date,))
        route_log_row = cur.fetchone()
        if route_log_row is None:
            raise LookupError(f"No route log found for {report_date}")

        route_log_id = int(route_log_row[0])
        driver_name = route_log_row[1]
        truck_description = route_log_row[2]

        stops_query = psql.SQL(
            """
            SELECT
                id,
                from_location,
                to_location,
                start_miles,
                end_miles,
                start_time,
                end_time,
                odometer,
                cost,
                is_fuel_stop
            FROM {}.{}
            WHERE route_id = %s
            ORDER BY id ASC
            """
        ).format(psql.Identifier("beef_data"), psql.Identifier("stops_in_route"))
        cur.execute(stops_query, (route_log_id,))
        stop_rows = cur.fetchall()

        stops: list[dict[str, Any]] = []
        for (
            stop_id,
            from_location,
            to_location,
            start_miles,
            end_miles,
            start_time,
            end_time,
            odometer,
            cost,
            is_fuel_stop,
        ) in stop_rows:
            stops.append(
                {
                    "id": int(stop_id),
                    "from_location": from_location,
                    "to_location": to_location,
                    "start_miles": _to_float(start_miles),
                    "end_miles": _to_float(end_miles),
                    "start_time": _time_to_text(start_time),
                    "end_time": _time_to_text(end_time),
                    "odometer": _to_float(odometer),
                    "cost": _to_float(cost),
                    "is_fuel_stop": bool(is_fuel_stop),
                }
            )

        fuel_stop_query = psql.SQL(
            """
            SELECT fuel_stop_id, start_time, end_time, odometer, cost
            FROM {}.{}
            WHERE route_log_id = %s
            ORDER BY fuel_stop_id ASC
            LIMIT 1
            """
        ).format(psql.Identifier("beef_data"), psql.Identifier("fuel_stops"))
        cur.execute(fuel_stop_query, (route_log_id,))
        fuel_row = cur.fetchone()

    fuel_stop = None
    if fuel_row:
        fuel_stop = {
            "fuel_stop_id": int(fuel_row[0]),
            "start_time": _time_to_text(fuel_row[1]),
            "end_time": _time_to_text(fuel_row[2]),
            "odometer": _to_float(fuel_row[3]),
            "cost": _to_float(fuel_row[4]),
        }

    return {
        "route_log_id": route_log_id,
        "report_date": report_date.isoformat(),
        "driver_name": driver_name,
        "truck": truck_description,
        "route_stops": stops,
        "fuel_stop": fuel_stop,
    }


def delete_route_log_entry(conn: psycopg.Connection, report_date: date) -> int:
    """
    Delete a route log for the given report date.

    Returns the deleted route_log_id or raises LookupError if none exist.
    """

    _ensure_route_log_schema(conn)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM beef_data.route_logs
            WHERE report_date = %s
            LIMIT 1
            """,
            (report_date,),
        )
        row = cur.fetchone()
        if row is None:
            raise LookupError(f"No route log found for {report_date}")
        route_log_id = int(row[0])
        cur.execute("DELETE FROM beef_data.route_logs WHERE id = %s", (route_log_id,))
    return route_log_id
