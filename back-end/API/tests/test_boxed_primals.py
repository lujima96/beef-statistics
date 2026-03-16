import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
import psycopg

# Add the parent directory to the path so we can import the FastAPI app
sys.path.append(str(Path(__file__).resolve().parents[1]))
from routes import app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)


def test_get_boxed_primals_timeseries_success(client):
    mocked_series = [
        {"date": "2024-01-01", "value": 1.23},
    ]

    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_conn

    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", return_value=mock_cm),
        patch("routes.fetch_series", side_effect=[mocked_series, mocked_series]),
    ):
        resp = client.get(
            "/api/boxed-primals/timeseries",
            params={"primal": "primal_rib", "grade": "choice"},
        )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["primal"] == "primal_rib"
    assert payload["grade"] == "choice"
    assert payload["series"] == {"am": mocked_series, "pm": mocked_series}


def test_get_boxed_primals_timeseries_db_error(client):
    with (
        patch("routes.pg_dsn_from_env", return_value="dsn"),
        patch("routes.psycopg.connect", side_effect=psycopg.OperationalError("db down"))
    ):
        resp = client.get(
            "/api/boxed-primals/timeseries",
            params={"primal": "primal_rib", "grade": "choice"},
        )

    assert resp.status_code == 503
    assert "Database connection failed" in resp.json()["detail"]
