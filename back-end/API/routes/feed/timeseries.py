"""Feed timeseries API endpoints."""

from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from config import config
from db import FeedDataPoint, fetch_feed_attribute_series, fetch_feed_timeseries

from .constants import (
    CORN_ACREAGE_PRODUCTION_TABLE,
    CORN_PRODUCTION_DEFAULT_ATTRIBUTE,
    CORN_PRODUCTION_DEFAULT_COMMODITIES,
    CORN_PRODUCTION_DEFAULT_FREQUENCY,
    CORN_PRODUCTION_DEFAULT_GEOGRAPHY,
    CORN_SORGHUM_PRICES_DEFAULT_ATTRIBUTE,
    CORN_SORGHUM_PRICES_DEFAULT_COMMODITIES,
    CORN_SORGHUM_PRICES_DEFAULT_FREQUENCY,
    CORN_SORGHUM_PRICES_DEFAULT_GEOGRAPHY,
    CORN_SORGHUM_PRICES_TABLE,
    HAY_ALL_COMMODITY,
    HAY_DEFAULT_GEOGRAPHY,
    HAY_DISAPPEARANCE_ATTRIBUTE,
    HAY_PRODUCTION_COMMODITIES,
    HAY_STOCKS_TIMEPERIODS,
    HAY_SUPPLY_ATTRIBUTE,
    HAY_TABLE_NAME,
    HAY_PRICES_TABLE,
    HAY_PRICES_DEFAULT_ATTRIBUTE,
    HAY_PRICES_DEFAULT_GEOGRAPHY,
    HAY_PRICES_DEFAULT_FREQUENCY,
    FEED_PRICE_RATIOS_TABLE,
    FEED_PRICE_RATIOS_ATTRIBUTE,
    FEED_PRICE_RATIOS_DEFAULT_GEOGRAPHY,
    FEED_PRICE_RATIOS_DEFAULT_FREQUENCY,
)

router = APIRouter()


def _normalize_multi(values: Optional[List[str]]) -> Optional[List[str]]:
    if not values:
        return None
    normalized = [v.strip() for v in values if v and v.strip()]
    return normalized or None


def _first_non_empty_unit(series: Dict[str, List[FeedDataPoint]]) -> Optional[str]:
    for points in series.values():
        for point in points:
            unit = point.get("unit")
            if unit:
                return unit
    return None


def _clone_series(series: Dict[str, List[FeedDataPoint]]):
    return {
        key: [dict(point) for point in points]
        for key, points in series.items()
    }


@router.get("/api/feed/timeseries")
def get_feed_timeseries(
    *,
    table_name: str = Query(..., description="Title of the USDA feed table."),
    attribute: Optional[str] = Query(None, description="Attribute to filter (e.g., Production)."),
    geography: Optional[str] = Query(None, description="Geography filter (e.g., United States)."),
    frequency: Optional[str] = Query(None, description="Data frequency filter."),
    timeperiod: Optional[str] = Query(
        None, description="Time period filter (e.g., First of May)."
    ),
    commodities: Optional[List[str]] = Query(
        None,
        description="Repeatable commodity filter (e.g., Corn, Sorghum).",
    ),
    start_date: Optional[date] = Query(None, description="Inclusive start of report_date range."),
    end_date: Optional[date] = Query(None, description="Inclusive end of report_date range."),
    limit: int = Query(5000, ge=1, le=50000, description="Maximum rows to scan."),
) -> JSONResponse:
    commodity_filter = _normalize_multi(commodities)

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=table_name,
                attribute=attribute,
                geography=geography,
                frequency=frequency,
                timeperiod=timeperiod,
                commodities=commodity_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feed data: {e}")

    return JSONResponse(
        {
            "table_name": table_name,
            "attribute": attribute,
            "geography": geography,
            "frequency": frequency,
            "timeperiod": timeperiod,
            "commodities": commodity_filter,
            "series": series,
        }
    )


@router.get("/api/feed/costs/timeseries")
def get_feed_costs_timeseries(
    *,
    table_name: str = Query(..., description="Title of the USDA feed table."),
    geography: str = Query(..., description="Geography filter (e.g., Chicago, IL)."),
    commodity: str = Query(..., description="Commodity to filter (e.g., Corn, No. 2 yellow)."),
    attribute: Optional[str] = Query(None, description="Optional attribute filter (e.g., Cash price)."),
    frequency: str = Query(
        "Monthly",
        description="Data frequency filter (defaults to Monthly).",
    ),
    start_date: date = Query(
        date(2018, 1, 1),
        description="Inclusive start of report_date range (defaults to 2018-01-01).",
    ),
    end_date: Optional[date] = Query(
        None,
        description="Inclusive end of report_date range.",
    ),
    limit: int = Query(5000, ge=1, le=50000, description="Maximum rows to scan."),
) -> JSONResponse:
    """Fetch feed cost time series data filtered by geography and commodity."""

    normalized_table = table_name.strip()
    if not normalized_table:
        raise HTTPException(status_code=400, detail="table_name must be provided")

    normalized_geography = geography.strip()
    if not normalized_geography:
        raise HTTPException(status_code=400, detail="geography must be provided")

    commodity_filter = _normalize_multi([commodity])
    if not commodity_filter:
        raise HTTPException(status_code=400, detail="commodity must be provided")

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=normalized_table,
                attribute=attribute,
                geography=normalized_geography,
                frequency=frequency,
                timeperiod=None,
                commodities=commodity_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feed cost data: {e}")

    return JSONResponse(
        {
            "table_name": normalized_table,
            "geography": normalized_geography,
            "commodity": commodity_filter[0],
            "attribute": attribute,
            "frequency": frequency,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "series": series,
        }
    )


@router.get("/api/feed/feed-price-ratios")
def get_feed_price_ratios_timeseries(
    *,
    ratios: List[str] = Query(
        ...,
        description="Repeatable ratio filter (e.g., Broiler-feed (grower feed to live weight)).",
    ),
    geography: str = Query(
        FEED_PRICE_RATIOS_DEFAULT_GEOGRAPHY,
        description="Geography filter (defaults to United States).",
    ),
    frequency: str = Query(
        FEED_PRICE_RATIOS_DEFAULT_FREQUENCY,
        description="Data frequency filter (defaults to Monthly).",
    ),
    start_date: date = Query(
        date(2018, 1, 1),
        description="Inclusive start of report_date range (defaults to 2018-01-01).",
    ),
    end_date: Optional[date] = Query(
        None,
        description="Inclusive end of report_date range.",
    ),
    limit: int = Query(10000, ge=1, le=50000, description="Maximum rows to scan."),
) -> JSONResponse:
    ratio_filter = _normalize_multi(ratios)
    if not ratio_filter:
        raise HTTPException(status_code=400, detail="At least one ratio must be provided")

    normalized_geography = geography.strip() or FEED_PRICE_RATIOS_DEFAULT_GEOGRAPHY
    normalized_frequency = frequency.strip() or FEED_PRICE_RATIOS_DEFAULT_FREQUENCY

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=FEED_PRICE_RATIOS_TABLE,
                attribute=FEED_PRICE_RATIOS_ATTRIBUTE,
                geography=normalized_geography,
                frequency=normalized_frequency,
                timeperiod=None,
                commodities=ratio_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feed price ratio data: {e}")

    resolved_ratios = sorted(series.keys())

    return JSONResponse(
        {
            "table_name": FEED_PRICE_RATIOS_TABLE,
            "attribute": FEED_PRICE_RATIOS_ATTRIBUTE,
            "geography": normalized_geography,
            "frequency": normalized_frequency,
            "ratios": ratio_filter,
            "resolved_ratios": resolved_ratios,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "series": series,
        }
    )


@router.get("/api/feed/hay/prices")
def get_hay_prices_timeseries(
    *,
    geography: str = Query(
        HAY_PRICES_DEFAULT_GEOGRAPHY,
        description="Geography filter (defaults to United States).",
    ),
    commodities: Optional[List[str]] = Query(
        None,
        description="Repeatable commodity filter (e.g., Hay, alfalfa).",
    ),
    frequency: str = Query(
        HAY_PRICES_DEFAULT_FREQUENCY,
        description="Data frequency filter (defaults to Monthly).",
    ),
    start_date: Optional[date] = Query(
        None,
        description="Inclusive start of report_date range.",
    ),
    end_date: Optional[date] = Query(
        None,
        description="Inclusive end of report_date range.",
    ),
    limit: int = Query(5000, ge=1, le=50000, description="Maximum rows to scan."),
) -> JSONResponse:
    """Preset endpoint for hay price time series data."""

    commodity_filter = _normalize_multi(commodities)

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_PRICES_TABLE,
                attribute=HAY_PRICES_DEFAULT_ATTRIBUTE,
                geography=geography,
                frequency=frequency,
                timeperiod=None,
                commodities=commodity_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch hay price data: {e}")

    resolved_commodities = sorted(series.keys())

    return JSONResponse(
        {
            "table_name": HAY_PRICES_TABLE,
            "attribute": HAY_PRICES_DEFAULT_ATTRIBUTE,
            "geography": geography,
            "frequency": frequency,
            "requested_commodities": commodity_filter,
            "resolved_commodities": resolved_commodities,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "series": series,
        }
    )


@router.get("/api/feed/corn/production")
def get_corn_production_timeseries(
    *,
    attribute: Optional[str] = Query(
        None,
        description="Attribute filter; defaults to Production.",
    ),
    geography: Optional[str] = Query(
        CORN_PRODUCTION_DEFAULT_GEOGRAPHY,
        description="Geography filter (defaults to United States).",
    ),
    frequency: Optional[str] = Query(
        CORN_PRODUCTION_DEFAULT_FREQUENCY,
        description="Data frequency filter (defaults to Annual).",
    ),
    commodities: Optional[List[str]] = Query(
        None,
        description="Repeatable commodity filter (defaults to Corn, Sorghum, Barley, Oats).",
    ),
    start_date: Optional[date] = Query(
        None,
        description="Inclusive start of report_date range.",
    ),
    end_date: Optional[date] = Query(
        None,
        description="Inclusive end of report_date range.",
    ),
    limit: int = Query(
        10000,
        ge=1,
        le=50000,
        description="Maximum rows to scan (defaults to 10,000).",
    ),
) -> JSONResponse:
    """Preset feed endpoint focused on corn & feed grain production."""

    attribute_value = attribute.strip() if attribute else CORN_PRODUCTION_DEFAULT_ATTRIBUTE
    commodity_filter = _normalize_multi(commodities) or list(
        CORN_PRODUCTION_DEFAULT_COMMODITIES
    )

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=CORN_ACREAGE_PRODUCTION_TABLE,
                attribute=attribute_value,
                geography=geography,
                frequency=frequency,
                timeperiod=None,
                commodities=commodity_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feed data: {e}")

    return JSONResponse(
        {
            "table_name": CORN_ACREAGE_PRODUCTION_TABLE,
            "attribute": attribute_value,
            "geography": geography,
            "frequency": frequency,
            "commodities": commodity_filter,
            "series": series,
        }
    )


@router.get("/api/feed/corn-sorghum/prices")
def get_corn_sorghum_prices_timeseries(
    *,
    attribute: Optional[str] = Query(
        None,
        description="Attribute filter; defaults to Price received by farmers.",
    ),
    geography: Optional[str] = Query(
        CORN_SORGHUM_PRICES_DEFAULT_GEOGRAPHY,
        description="Geography filter (defaults to United States).",
    ),
    frequency: Optional[str] = Query(
        CORN_SORGHUM_PRICES_DEFAULT_FREQUENCY,
        description="Data frequency filter (defaults to Monthly).",
    ),
    commodities: Optional[List[str]] = Query(
        None,
        description="Repeatable commodity filter (defaults to Corn and Sorghum).",
    ),
    start_date: Optional[date] = Query(
        None,
        description="Inclusive start of report_date range.",
    ),
    end_date: Optional[date] = Query(
        None,
        description="Inclusive end of report_date range.",
    ),
    limit: int = Query(
        10000,
        ge=1,
        le=50000,
        description="Maximum rows to scan (defaults to 10,000).",
    ),
) -> JSONResponse:
    """Preset feed endpoint for corn & sorghum price series."""

    attribute_value = (
        attribute.strip() if attribute else CORN_SORGHUM_PRICES_DEFAULT_ATTRIBUTE
    )
    frequency_value = (
        frequency.strip() if frequency else CORN_SORGHUM_PRICES_DEFAULT_FREQUENCY
    )
    commodity_filter = _normalize_multi(commodities) or list(
        CORN_SORGHUM_PRICES_DEFAULT_COMMODITIES
    )

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=CORN_SORGHUM_PRICES_TABLE,
                attribute=attribute_value,
                geography=geography,
                frequency=frequency_value,
                timeperiod=None,
                commodities=commodity_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feed data: {e}")

    return JSONResponse(
        {
            "table_name": CORN_SORGHUM_PRICES_TABLE,
            "attribute": attribute_value,
            "geography": geography,
            "frequency": frequency_value,
            "commodities": commodity_filter,
            "series": series,
        }
    )


@router.get("/api/feed/hay/overview")
def get_hay_overview(
    *,
    start_year: Optional[int] = Query(
        None,
        ge=1900,
        le=2100,
        description="Inclusive start year for the hay overview.",
    ),
    end_year: Optional[int] = Query(
        None,
        ge=1900,
        le=2100,
        description="Inclusive end year for the hay overview.",
    ),
    limit: int = Query(
        10000,
        ge=1000,
        le=50000,
        description="Maximum rows to scan for each hay series query.",
    ),
) -> JSONResponse:
    if start_year and end_year and start_year > end_year:
        raise HTTPException(status_code=400, detail="start_year must be <= end_year")

    start_date = date(start_year, 1, 1) if start_year else None
    end_date = date(end_year, 12, 31) if end_year else None

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            production_series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_TABLE_NAME,
                attribute="Production",
                geography=HAY_DEFAULT_GEOGRAPHY,
                frequency="Annual",
                timeperiod=None,
                commodities=HAY_PRODUCTION_COMMODITIES,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
            area_series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_TABLE_NAME,
                attribute="Area harvested",
                geography=HAY_DEFAULT_GEOGRAPHY,
                frequency="Annual",
                timeperiod=None,
                commodities=[HAY_ALL_COMMODITY],
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
            yield_series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_TABLE_NAME,
                attribute="Yield per harvested acre",
                geography=HAY_DEFAULT_GEOGRAPHY,
                frequency="Annual",
                timeperiod=None,
                commodities=[HAY_ALL_COMMODITY],
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
            stocks_may_series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_TABLE_NAME,
                attribute="Stocks on farms",
                geography=HAY_DEFAULT_GEOGRAPHY,
                frequency="Monthly",
                timeperiod=HAY_STOCKS_TIMEPERIODS["may"],
                commodities=[HAY_ALL_COMMODITY],
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
            stocks_dec_series = fetch_feed_timeseries(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_TABLE_NAME,
                attribute="Stocks on farms",
                geography=HAY_DEFAULT_GEOGRAPHY,
                frequency="Monthly",
                timeperiod=HAY_STOCKS_TIMEPERIODS["dec"],
                commodities=[HAY_ALL_COMMODITY],
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
            rcau_series = fetch_feed_attribute_series(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=HAY_TABLE_NAME,
                attributes=[HAY_SUPPLY_ATTRIBUTE, HAY_DISAPPEARANCE_ATTRIBUTE],
                geography=HAY_DEFAULT_GEOGRAPHY,
                frequency="Annual",
                commodities=[HAY_ALL_COMMODITY],
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch hay data: {e}")

    payload = {
        "table_name": HAY_TABLE_NAME,
        "geography": HAY_DEFAULT_GEOGRAPHY,
        "production": {
            "unit": _first_non_empty_unit(production_series),
            "series": _clone_series(production_series),
        },
        "area_harvested": {
            "unit": _first_non_empty_unit(area_series),
            "series": _clone_series(area_series),
        },
        "yield_per_acre": {
            "unit": _first_non_empty_unit(yield_series),
            "series": _clone_series(yield_series),
        },
        "stocks": {
            "may": {
                "unit": _first_non_empty_unit(stocks_may_series),
                "series": _clone_series(stocks_may_series),
            },
            "dec": {
                "unit": _first_non_empty_unit(stocks_dec_series),
                "series": _clone_series(stocks_dec_series),
            },
        },
        "rcau": {
            "unit": _first_non_empty_unit(rcau_series),
            "series": _clone_series(rcau_series),
        },
    }

    return JSONResponse(payload)


@router.get("/api/feed/attributes/timeseries")
def get_feed_attribute_timeseries(
    *,
    table_name: str = Query(..., description="Title of the USDA feed table."),
    attributes: List[str] = Query(
        ..., description="Repeatable attribute filter (e.g., Production)."
    ),
    geography: Optional[str] = Query(
        None, description="Geography filter (e.g., Foreign, United States)."
    ),
    frequency: Optional[str] = Query(
        None, description="Data frequency filter (e.g., Annual)."
    ),
    commodities: Optional[List[str]] = Query(
        None,
        description="Repeatable commodity filter (e.g., Coarse grains, Corn).",
    ),
    start_date: Optional[date] = Query(
        None, description="Inclusive start of report_date range."
    ),
    end_date: Optional[date] = Query(
        None, description="Inclusive end of report_date range."
    ),
    limit: int = Query(5000, ge=1, le=50000, description="Maximum rows to scan."),
) -> JSONResponse:
    attribute_filter = _normalize_multi(attributes)
    if not attribute_filter:
        raise HTTPException(
            status_code=400, detail="At least one attribute must be provided"
        )
    commodity_filter = _normalize_multi(commodities)

    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            series = fetch_feed_attribute_series(
                conn,
                schema=config.feed_data_schema,
                source_table=config.feed_data_table,
                table_name=table_name,
                attributes=attribute_filter,
                geography=geography,
                frequency=frequency,
                commodities=commodity_filter,
                start_date=start_date,
                end_date=end_date,
                limit=limit,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    except routes.psycopg.errors.UndefinedTable:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Feed data table '{config.feed_data_schema}.{config.feed_data_table}' "
                "was not found. Configure FEED_DATA_TABLE/FEED_DATA_SCHEMA to match your database."
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feed data: {e}")

    resolved_attributes = list(series.keys())

    return JSONResponse(
        {
            "table_name": table_name,
            "attributes": attribute_filter,
            "resolved_attributes": resolved_attributes,
            "geography": geography,
            "frequency": frequency,
            "commodities": commodity_filter,
            "series": series,
        }
    )


__all__ = [
    "router",
    "get_feed_timeseries",
    "get_feed_costs_timeseries",
    "get_corn_production_timeseries",
    "get_corn_sorghum_prices_timeseries",
    "get_hay_overview",
    "get_feed_price_ratios_timeseries",
    "get_feed_attribute_timeseries",
]
