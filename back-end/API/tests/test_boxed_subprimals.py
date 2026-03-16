import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import psycopg
import pytest
from fastapi.testclient import TestClient

# Make `routes` importable for the FastAPI app
sys.path.append(str(Path(__file__).resolve().parents[1]))
from routes import app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)


def test_get_boxed_subprimals_timeseries_uses_db(client):
    mocked_series = [{"date": "2024-01-01", "value": 1.23}]

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch("routes.fetch_subprimal_series", side_effect=[mocked_series, mocked_series]),
        patch("routes.boxed.load_subprimal_series_from_processed") as fallback,
    ):
        resp = client.get(
            "/api/boxed-subprimals/timeseries",
            params={"imps": "109E", "grade": "choice"},
        )

    assert resp.status_code == 200
    assert resp.json()["series"] == {"am": mocked_series, "pm": mocked_series}
    fallback.assert_not_called()


def test_get_boxed_subprimals_timeseries_falls_back_on_db_error(client):
    fallback_am = [{"date": "2024-02-01", "value": 9.99}]
    fallback_pm = [{"date": "2024-02-02", "value": 8.88}]

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", side_effect=psycopg.OperationalError("db down")),
        patch("routes.boxed.load_subprimal_series_from_processed", return_value=(fallback_am, fallback_pm)),
    ):
        resp = client.get(
            "/api/boxed-subprimals/timeseries",
            params={"imps": "109E", "grade": "choice"},
        )

    assert resp.status_code == 200
    assert resp.json()["series"] == {"am": fallback_am, "pm": fallback_pm}


def test_get_boxed_subprimals_timeseries_falls_back_when_empty(client):
    fallback_am = [{"date": "2024-03-01", "value": 5.55}]
    fallback_pm = [{"date": "2024-03-02", "value": 6.66}]

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch("routes.fetch_subprimal_series", side_effect=[[], []]),
        patch("routes.boxed.load_subprimal_series_from_processed", return_value=(fallback_am, fallback_pm)) as fallback,
    ):
        resp = client.get(
            "/api/boxed-subprimals/timeseries",
            params={"imps": "109E", "grade": "choice"},
        )

    assert resp.status_code == 200
    assert resp.json()["series"] == {"am": fallback_am, "pm": fallback_pm}
    fallback.assert_called_once()
