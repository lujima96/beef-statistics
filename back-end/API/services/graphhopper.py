"""HTTP client helpers for interacting with GraphHopper."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Mapping, Sequence

import httpx

from config import config


logger = logging.getLogger(__name__)


class GraphhopperError(RuntimeError):
    """Base exception for GraphHopper client errors."""


class GraphhopperConnectionError(GraphhopperError):
    """Raised when the client cannot reach the GraphHopper service."""

    def __init__(self, endpoint: str, message: str, *, original: Exception | None = None) -> None:
        super().__init__(message)
        self.endpoint = endpoint
        self.original = original


class GraphhopperHTTPError(GraphhopperError):
    """Raised when GraphHopper returns a non-successful HTTP status."""

    def __init__(self, endpoint: str, status_code: int, body: str | bytes) -> None:
        detail = body.decode() if isinstance(body, bytes) else str(body)
        super().__init__(
            f"GraphHopper request to {endpoint} failed with status {status_code}: {detail}"
        )
        self.endpoint = endpoint
        self.status_code = status_code
        self.body = detail


class GraphhopperResponseError(GraphhopperError):
    """Raised when the GraphHopper response body cannot be parsed."""

    def __init__(self, endpoint: str, message: str) -> None:
        super().__init__(message)
        self.endpoint = endpoint


class GraphhopperClient:
    """Thin async HTTP client for the self-hosted GraphHopper instance."""

    def __init__(self, base_url: str | httpx.URL, *, timeout: float | httpx.Timeout | None = None) -> None:
        self._base_url = str(base_url)
        self._timeout = timeout

    @classmethod
    def from_settings(cls) -> "GraphhopperClient":
        """Build a client using the shared FastAPI settings."""

        return cls(str(config.graphhopper_base_url), timeout=config.graphhopper_timeout)

    async def _request_json(
        self,
        method: str,
        endpoint: str,
        *,
        params: Mapping[str, Any] | Sequence[tuple[str, Any]] | None = None,
        json: Mapping[str, Any] | None = None,
    ) -> Any:
        url = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            try:
                response = await client.request(method, url, params=params, json=json)
            except httpx.RequestError as exc:  # pragma: no cover - network failure paths
                raise GraphhopperConnectionError(url, str(exc), original=exc) from exc

        if response.status_code >= 400:
            raise GraphhopperHTTPError(url, response.status_code, response.text)

        try:
            return response.json()
        except ValueError as exc:  # pragma: no cover - unexpected server replies
            raise GraphhopperResponseError(url, "Response was not valid JSON") from exc

    async def route(self, params: Mapping[str, Any]) -> Any:
        """Call the `/route` endpoint."""

        return await self._request_json("GET", "/route", params=params)

    async def isochrone(self, params: Mapping[str, Any]) -> Any:
        """Call the `/isochrone` endpoint."""

        return await self._request_json("GET", "/isochrone", params=params)

    async def matrix(self, payload: Mapping[str, Any]) -> Any:
        """Call the `/matrix` endpoint."""

        return await self._request_json("POST", "/matrix", json=payload)

    async def _matrix_via_routes(self, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        profile = payload.get("profile")
        if not isinstance(profile, str) or not profile:
            raise GraphhopperResponseError("/matrix", "Matrix payload missing profile")

        raw_points = payload.get("points")
        if not isinstance(raw_points, list) or not raw_points:
            raise GraphhopperResponseError("/matrix", "Matrix payload must include points")

        points: list[tuple[float, float]] = []
        for idx, entry in enumerate(raw_points):
            if not isinstance(entry, Mapping):
                raise GraphhopperResponseError("/matrix", f"Point {idx} was not an object")
            latitude = entry.get("lat")
            longitude = entry.get("lng")
            try:
                points.append((float(latitude), float(longitude)))
            except (TypeError, ValueError):
                raise GraphhopperResponseError(
                    "/matrix", f"Point {idx} had invalid coordinates"
                ) from None

        requested_arrays = payload.get("out_arrays")
        if requested_arrays is None:
            requested_arrays = ["distances", "times"]
        if not isinstance(requested_arrays, list) or not requested_arrays:
            raise GraphhopperResponseError("/matrix", "Matrix payload requested no output arrays")
        unsupported = {
            name for name in requested_arrays if name not in {"distances", "times"}
        }
        if unsupported:
            raise GraphhopperResponseError(
                "/matrix", f"Matrix fallback does not support: {', '.join(sorted(unsupported))}"
            )

        include_distances = "distances" in requested_arrays
        include_times = "times" in requested_arrays

        point_count = len(points)
        distances: list[list[float]] = [
            [0.0] * point_count for _ in range(point_count)
        ] if include_distances else []
        times: list[list[float]] = (
            [[0.0] * point_count for _ in range(point_count)] if include_times else []
        )

        semaphore = asyncio.Semaphore(6)
        endpoint = "/route"

        async with httpx.AsyncClient(
            base_url=self._base_url, timeout=self._timeout
        ) as client:

            async def compute_pair(origin_index: int, dest_index: int) -> None:
                origin = points[origin_index]
                destination = points[dest_index]
                params: list[tuple[str, Any]] = [
                    ("profile", profile),
                    ("point", f"{origin[0]},{origin[1]}"),
                    ("point", f"{destination[0]},{destination[1]}"),
                    ("calc_points", "false"),
                    ("points_encoded", "false"),
                    ("instructions", "false"),
                ]
                async with semaphore:
                    try:
                        response = await client.get(endpoint, params=params)
                    except httpx.RequestError as exc:  # pragma: no cover - network failure paths
                        raise GraphhopperConnectionError(endpoint, str(exc), original=exc) from exc

                if response.status_code >= 400:
                    raise GraphhopperHTTPError(endpoint, response.status_code, response.text)

                try:
                    payload_json = response.json()
                except ValueError as exc:  # pragma: no cover - unexpected server replies
                    raise GraphhopperResponseError(
                        endpoint, "Route response was not valid JSON"
                    ) from exc

                paths = payload_json.get("paths")
                if not isinstance(paths, list) or not paths:
                    raise GraphhopperResponseError(endpoint, "Route response did not include paths")
                path = paths[0]
                if not isinstance(path, Mapping):
                    raise GraphhopperResponseError(endpoint, "Route path payload was malformed")
                if include_distances:
                    distance_value = path.get("distance", 0.0)
                    try:
                        distances[origin_index][dest_index] = float(distance_value)
                    except (TypeError, ValueError):
                        distances[origin_index][dest_index] = 0.0
                if include_times:
                    time_value = path.get("time", 0.0)
                    try:
                        times[origin_index][dest_index] = float(time_value)
                    except (TypeError, ValueError):
                        times[origin_index][dest_index] = 0.0

            tasks = [
                compute_pair(i, j)
                for i in range(point_count)
                for j in range(point_count)
                if i != j
            ]
            await asyncio.gather(*tasks)

        result: dict[str, Any] = {}
        if include_distances:
            result["distances"] = distances
        if include_times:
            result["times"] = times
        return result

    async def health(self) -> Any:
        """Retrieve Dropwizard health information."""

        return await self._request_json("GET", "/health")

    async def spt(self, params: Mapping[str, Any]) -> Any:
        """Call the `/spt` endpoint (shortest path tree)."""

        return await self._request_json("GET", "/spt", params=params)
