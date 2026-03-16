from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import List, Literal, Optional, TypedDict

try:
    # Python 3.11+ ships ``NotRequired`` in ``typing``.
    from typing import NotRequired  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - fallback for Python 3.10
    from typing_extensions import NotRequired
    
import psycopg
from psycopg import sql as psql
from sql_helpers import build_date_range_clause
from config import Config

logger = logging.getLogger(__name__)

Primal = Literal[
    "primal_rib",
    "primal_chuck",
    "primal_round",
    "primal_loin",
    "primal_brisket",
    "primal_short_plate",
    "primal_flank",
]
Grade = Literal["choice", "select"]
MarketParam = Literal["national", "central", "any"]


class Point(TypedDict):
    date: str
    value: float


class IndexSeries(TypedDict):
    date: str
    value: float


class PricePoint(TypedDict):
    date: str
    value: float


class SupplyDemandEqRow(TypedDict):
    date: str
    supply: float
    demand: float


class SupplyDemandHeadRow(TypedDict):
    date: str
    supply: int
    demand: int


class TemperatureRow(TypedDict):
    date: str
    average_temperature_f: float
    states_reporting: NotRequired[Optional[int]]
    station_observations: NotRequired[Optional[int]]


class DieselRow(TypedDict):
    date: str
    diesel_dollars_per_gallon: float


class WeatherOccurrenceRow(TypedDict):
    month_start: str
    event_type: str
    event_count: int


class FeedDataPoint(TypedDict, total=False):
    date: str
    amount: float
    unit: str | None
    attribute: str | None
    geography: str | None
    frequency: str | None
    timeperiod: str | None
    table_group: str | None
    table_name: str
    commodity_group: str | None
    year: int | None


def pg_dsn_from_env(cfg: Config) -> str:
    """Construct a PostgreSQL DSN string from a Config instance."""

    host = cfg.pg_host
    port = cfg.pg_port
    db = cfg.postgres_db
    user = cfg.postgres_user
    password = cfg.postgres_password
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


def _repo_root_from_here() -> Path:
    """Return the repository root relative to the current file."""

    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "start_dev.py").is_file() or (parent / "docker-compose.yml").exists():
            return parent
    return next(reversed(here.parents), here.parent)


def _parse_date_str(s: str) -> Optional[date]:
    """Parse an ISO-8601 date string to a :class:`datetime.date`."""

    try:
        y, m, d = map(int, s.split("-")[0:3])
        return date(y, m, d)
    except (ValueError, TypeError):
        return None
    except Exception:  # pragma: no cover - logging unexpected errors
        logger.exception("Unexpected error parsing date %r", s)
        return None


def fetch_temperature_series(
    conn: psycopg.Connection,
    *,
    start_date: date,
    end_date: date,
) -> List[TemperatureRow]:
    """Fetch daily national average temperatures between two dates (inclusive)."""

    query = psql.SQL(
        """
        SELECT observation_date::text AS d,
               average_temperature_f,
               states_reporting,
               station_observations
        FROM {}.{}
        WHERE observation_date BETWEEN %s AND %s
        ORDER BY observation_date ASC
        """
    ).format(
        psql.Identifier("beef_data"),
        psql.Identifier("national_daily_average_temperature"),
    )

    with conn.cursor() as cur:
        cur.execute(query, (start_date, end_date))
        rows = cur.fetchall()

    series: List[TemperatureRow] = []
    for d, avg, states, stations in rows:
        if avg is None:
            continue
        try:
            avg_f = float(avg)
        except (TypeError, ValueError):
            continue
        series.append(
            {
                "date": d,
                "average_temperature_f": avg_f,
                "states_reporting": states,
                "station_observations": stations,
            }
        )
    return series


def fetch_diesel_series(
    conn: psycopg.Connection,
    *,
    start_date: Optional[date],
    end_date: date,
) -> List[DieselRow]:
    """Fetch weekly diesel retail prices between two dates (inclusive)."""

    if end_date is None:
        raise ValueError("end_date is required for fetch_diesel_series")

    where_sql_parts: List[psql.SQL] = [psql.SQL("price_date <= %s")]
    params: List[object] = [end_date]

    if start_date is not None:
        where_sql_parts.append(psql.SQL("price_date >= %s"))
        params.append(start_date)

    where_sql = psql.SQL(" AND ").join(where_sql_parts)

    query = psql.SQL(
        """
        SELECT price_date::text AS d,
               diesel_dollars_per_gallon
        FROM {}.{}
        WHERE {}
        ORDER BY price_date ASC
        """
    ).format(
        psql.Identifier("beef_data"),
        psql.Identifier("diesel_weekly_prices"),
        where_sql,
    )

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    out: List[DieselRow] = []
    for d, price in rows:
        if price is None:
            continue
        try:
            out.append(
                {
                    "date": str(d),
                    "diesel_dollars_per_gallon": float(price),
                }
            )
        except (TypeError, ValueError):
            continue
        except Exception:
            logger.exception("Unexpected error parsing diesel row for %s", d)
            continue
    return out


def fetch_weather_occurrences(
    conn: psycopg.Connection,
    event_types: Optional[List[str]] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[WeatherOccurrenceRow]:
    """Fetch monthly NOAA weather event counts with optional filters."""

    where_sql_parts: List[psql.SQL] = []
    params: List[object] = []

    date_clause, date_params = build_date_range_clause(
        start_date, end_date, column="month_start"
    )
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)

    if event_types:
        filtered = [et for et in (et.strip() for et in event_types) if et]
        if filtered:
            where_sql_parts.append(psql.SQL("event_type = ANY(%s)"))
            params.append(filtered)

    where_sql = psql.SQL("")
    if where_sql_parts:
        where_sql = psql.SQL(" WHERE ") + psql.SQL(" AND ").join(where_sql_parts)

    query = psql.SQL(
        """
        SELECT month_start::text AS month_start,
               event_type,
               event_count
        FROM {}.{}
        {}
        ORDER BY month_start ASC, event_type ASC
        """
    ).format(
        psql.Identifier("beef_data"),
        psql.Identifier("number_of_occurrences_monthly"),
        where_sql,
    )

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    out: List[WeatherOccurrenceRow] = []
    for month_start, event_type, count in rows:
        if month_start is None or event_type is None or count is None:
            continue
        try:
            out.append(
                {
                    "month_start": str(month_start),
                    "event_type": str(event_type),
                    "event_count": int(count),
                }
            )
        except (TypeError, ValueError):
            continue
        except Exception:
            logger.exception(
                "Unexpected error parsing weather occurrence row for %s", month_start
            )
            continue
    return out


def latest_temperature_observation_date(conn: psycopg.Connection) -> Optional[date]:
    """Return the most recent date present in the temperature table."""

    query = psql.SQL(
        "SELECT MAX(observation_date) FROM {}.{}"
    ).format(
        psql.Identifier("beef_data"),
        psql.Identifier("national_daily_average_temperature"),
    )

    with conn.cursor() as cur:
        cur.execute(query)
        row = cur.fetchone()

    if not row:
        return None
    return row[0]


def latest_diesel_price_date(conn: psycopg.Connection) -> Optional[date]:
    """Return the latest diesel price date available."""

    query = psql.SQL(
        "SELECT MAX(price_date) FROM {}.{}"
    ).format(
        psql.Identifier("beef_data"),
        psql.Identifier("diesel_weekly_prices"),
    )

    with conn.cursor() as cur:
        cur.execute(query)
        row = cur.fetchone()

    if not row:
        return None
    return row[0]


__all__ = [
    "Primal",
    "Grade",
    "MarketParam",
    "Point",
    "IndexSeries",
    "PricePoint",
    "SupplyDemandEqRow",
    "SupplyDemandHeadRow",
    "TemperatureRow",
    "DieselRow",
    "WeatherOccurrenceRow",
    "pg_dsn_from_env",
    "_repo_root_from_here",
    "_parse_date_str",
    "fetch_temperature_series",
    "fetch_diesel_series",
    "fetch_weather_occurrences",
    "latest_temperature_observation_date",
    "latest_diesel_price_date",
]
