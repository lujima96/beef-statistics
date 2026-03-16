from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
import psycopg

import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))
from routes import app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)


def test_get_corn_sorghum_prices_timeseries_success(client):
    mocked_series = {"Corn": [{"date": "2024-01-01", "amount": 4.5}]}

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch("routes.feed.fetch_feed_timeseries", return_value=mocked_series) as fetch_mock,
    ):
        resp = client.get("/api/feed/corn-sorghum/prices")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["table_name"] == (
        "Table 9--Corn and sorghum: Prices received by farmers, United States"
    )
    assert payload["attribute"] == "Price received by farmers"
    assert payload["frequency"] == "Monthly"
    assert payload["commodities"] == ["Corn", "Sorghum"]
    assert payload["series"] == mocked_series

    fetch_kwargs = fetch_mock.call_args.kwargs
    assert fetch_kwargs["table_name"] == (
        "Table 9--Corn and sorghum: Prices received by farmers, United States"
    )
    assert fetch_kwargs["attribute"] == "Price received by farmers"
    assert fetch_kwargs["frequency"] == "Monthly"
    assert fetch_kwargs["commodities"] == ["Corn", "Sorghum"]
    assert fetch_kwargs["timeperiod"] is None


def test_get_feed_costs_timeseries_success(client):
    mocked_series = {
        "Corn, No. 2 yellow": [
            {
                "date": "2024-03-01",
                "amount": 4.25,
                "unit": "Dollars per bushel",
                "attribute": "Cash price",
            }
        ]
    }

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    table_name = (
        "Table 12--Corn: Cash prices at principal markets, dollars per bushel"
    )
    geography = "Central Illinois, IL"
    commodity = "Corn, No. 2 yellow"

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch("routes.feed.fetch_feed_timeseries", return_value=mocked_series) as fetch_mock,
    ):
        resp = client.get(
            "/api/feed/costs/timeseries",
            params={
                "table_name": table_name,
                "geography": geography,
                "commodity": commodity,
            },
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["table_name"] == table_name
    assert payload["geography"] == geography
    assert payload["commodity"] == commodity
    assert payload["frequency"] == "Monthly"
    assert payload["start_date"] == "2018-01-01"
    assert payload["series"] == mocked_series

    fetch_kwargs = fetch_mock.call_args.kwargs
    assert fetch_kwargs["table_name"] == table_name
    assert fetch_kwargs["geography"] == geography
    assert fetch_kwargs["commodities"] == [commodity]
    assert fetch_kwargs["timeperiod"] is None


def test_get_feed_price_ratios_timeseries_success(client):
    mocked_series = {
        "Broiler-feed (grower feed to live weight)": [
            {"date": "2023-01-01", "amount": 3.2, "unit": "Pounds/pounds"}
        ]
    }

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    ratios = [
        "Broiler-feed (grower feed to live weight)",
        "Hog-feed (corn to live weight)",
    ]

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch("routes.feed.fetch_feed_timeseries", return_value=mocked_series) as fetch_mock,
    ):
        resp = client.get(
            "/api/feed/feed-price-ratios",
            params={"ratios": ratios, "frequency": "Monthly", "start_date": "2018-01-01"},
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["table_name"] == (
        "Table 15--Feed-price ratios for livestock, poultry, and milk"
    )
    assert payload["attribute"] == "Ratio"
    assert payload["geography"] == "United States"
    assert payload["frequency"] == "Monthly"
    assert payload["ratios"] == ratios
    assert payload["resolved_ratios"] == sorted(mocked_series.keys())
    assert payload["series"] == mocked_series

    fetch_kwargs = fetch_mock.call_args.kwargs
    assert fetch_kwargs["table_name"] == (
        "Table 15--Feed-price ratios for livestock, poultry, and milk"
    )
    assert fetch_kwargs["attribute"] == "Ratio"
    assert fetch_kwargs["geography"] == "United States"
    assert fetch_kwargs["frequency"] == "Monthly"
    assert fetch_kwargs["commodities"] == ratios
    assert fetch_kwargs["start_date"].isoformat() == "2018-01-01"


def test_get_feed_price_ratios_timeseries_missing_ratios(client):
    resp = client.get(
        "/api/feed/feed-price-ratios",
        params={"ratios": []},
    )

    assert resp.status_code == 400
    assert "ratio" in resp.json()["detail"].lower()


def test_get_corn_sorghum_prices_timeseries_db_error(client):
    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", side_effect=psycopg.OperationalError("db down")),
    ):
        resp = client.get("/api/feed/corn-sorghum/prices")

    assert resp.status_code == 503
    assert "Database connection failed" in resp.json()["detail"]


def test_get_hay_overview_success(client):
    production_series = {
        "Hay, alfalfa": [
            {
                "date": "2020-01-01",
                "amount": 123.0,
                "unit": "1,000 tons",
                "attribute": "Production",
            }
        ],
        "Hay, other": [],
    }
    area_series = {"Hay, all": [{"date": "2020-01-01", "amount": 456.0, "unit": "1,000 acres"}]}
    yield_series = {"Hay, all": [{"date": "2020-01-01", "amount": 2.5, "unit": "Tons per acre"}]}
    stocks_may_series = {
        "Hay, all": [{"date": "2020-05-01", "amount": 50.0, "unit": "1,000 tons", "timeperiod": "First of May"}]
    }
    stocks_dec_series = {
        "Hay, all": [{"date": "2020-12-01", "amount": 120.0, "unit": "1,000 tons", "timeperiod": "First of Dec"}]
    }
    rcau_series = {
        "Supply per roughage-consuming animal unit (RCAU)": [
            {
                "date": "2020-01-01",
                "amount": 2.1,
                "unit": "Tons per roughage-consuming animal unit (RCAU)",
            }
        ],
        "Disappearance per roughage-consuming animal unit (RCAU)": [
            {
                "date": "2020-01-01",
                "amount": 1.8,
                "unit": "Tons per roughage-consuming animal unit (RCAU)",
            }
        ],
    }

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch(
            "routes.feed.fetch_feed_timeseries",
            side_effect=[
                production_series,
                area_series,
                yield_series,
                stocks_may_series,
                stocks_dec_series,
            ],
        ) as timeseries_mock,
        patch(
            "routes.feed.fetch_feed_attribute_series",
            return_value=rcau_series,
        ) as attribute_mock,
    ):
        resp = client.get("/api/feed/hay/overview")

    assert resp.status_code == 200
    body = resp.json()
    assert body["table_name"].startswith("Table 8--Hay")
    assert body["geography"] == "United States"
    assert body["production"]["series"] == production_series
    assert body["area_harvested"]["series"] == area_series
    assert body["yield_per_acre"]["series"] == yield_series
    assert body["stocks"]["may"]["series"] == stocks_may_series
    assert body["rcau"]["series"] == rcau_series

    assert timeseries_mock.call_count == 5
    first_call = timeseries_mock.call_args_list[0]
    assert first_call.kwargs["table_name"].startswith("Table 8--Hay")
    assert first_call.kwargs["attribute"] == "Production"
    assert attribute_mock.called


def test_get_hay_overview_invalid_year_range(client):
    resp = client.get(
        "/api/feed/hay/overview",
        params={"start_year": 2025, "end_year": 2020},
    )
    assert resp.status_code == 400
    assert "start_year" in resp.json()["detail"]
