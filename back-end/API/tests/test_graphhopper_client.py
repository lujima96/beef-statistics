import json
from pathlib import Path
from typing import Any, List, Tuple

import pytest

import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from services import graphhopper as graphhopper_module  # noqa: E402


GraphhopperClient = graphhopper_module.GraphhopperClient
GraphhopperHTTPError = graphhopper_module.GraphhopperHTTPError


class _DummyResponse:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload)

    def json(self) -> Any:
        return self._payload


class _DummyAsyncClient:
    calls: List[Tuple[str, List[Tuple[str, Any]]]] = []

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> "_DummyAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def get(self, endpoint: str, params=None):
        query: List[Tuple[str, Any]] = list(params or [])
        self.__class__.calls.append((endpoint, query))
        points = [value for key, value in query if key == "point"]
        origin = points[0]
        destination = points[1]
        lat1, lng1 = map(float, origin.split(","))
        lat2, lng2 = map(float, destination.split(","))
        manhattan = abs(lat1 - lat2) + abs(lng1 - lng2)
        distance = manhattan * 1000.0
        travel_time = distance * 2.0
        payload = {"paths": [{"distance": distance, "time": travel_time}]}
        return _DummyResponse(200, payload)


@pytest.mark.anyio
async def test_matrix_fallback_uses_route_emulation(monkeypatch):
    _DummyAsyncClient.calls.clear()
    monkeypatch.setattr(
        graphhopper_module.httpx, "AsyncClient", _DummyAsyncClient
    )

    client = GraphhopperClient("http://example.com")

    async def _fake_request_json(method: str, endpoint: str, **_kwargs: Any) -> Any:
        raise GraphhopperHTTPError(endpoint, 404, "HTTP 404 Not Found")

    client._request_json = _fake_request_json  # type: ignore[assignment]

    payload = {
        "profile": "car",
        "points": [
            {"lat": 35.0, "lng": -92.0},
            {"lat": 35.5, "lng": -92.5},
        ],
        "out_arrays": ["distances", "times"],
    }

    result = await client.matrix(payload)

    assert "distances" in result
    assert "times" in result
    assert result["distances"][0][0] == pytest.approx(0.0)
    assert result["times"][1][1] == pytest.approx(0.0)
    assert result["distances"][0][1] > 0.0
    assert result["times"][1][0] > 0.0

    # Two off-diagonal pairs should be evaluated.
    assert len(_DummyAsyncClient.calls) == 2
