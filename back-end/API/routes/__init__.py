from __future__ import annotations

import ipaddress
import logging
import os
import socket
from typing import Iterable

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import fetch_series, pg_dsn_from_env

app = FastAPI(title="Beef Stats API", version="0.1.0")

logger = logging.getLogger(__name__)


def _normalize_origin(candidate: str) -> str:
    """Return a normalized origin string without trailing slashes."""

    return candidate.rstrip("/")


def _add_origin(origins: set[str], candidate: str) -> None:
    """Add an origin to the allow-list, including its HTTPS variant."""

    candidate = candidate.strip()
    if not candidate:
        return
    normalized = _normalize_origin(candidate)
    origins.add(normalized)
    if normalized.startswith("http://"):
        origins.add("https://" + normalized[len("http://") :])


def _iter_env_origins() -> Iterable[str]:
    """Yield potential origins configured via environment variables."""

    origin_env_vars = (
        "DEV_FRONTEND_ORIGIN",
        "VITE_DEV_SERVER_PUBLIC_URL",
        "FRONTEND_ORIGIN",
        "VITE_PUBLIC_URL",
    )
    for var in origin_env_vars:
        value = os.environ.get(var)
        if not value:
            continue
        for part in value.split(","):
            if part.strip():
                yield part.strip()


def _private_ip_hosts() -> set[str]:
    """Best-effort discovery of private IPs for the current machine."""

    hosts: set[str] = set()
    env_host_vars = ("LAN_IP", "HOST_IP", "VITE_DEV_SERVER_HOST")
    for var in env_host_vars:
        candidate = os.environ.get(var)
        if candidate:
            hosts.add(candidate.strip())

    try:
        hostname, _, ip_list = socket.gethostbyname_ex(socket.gethostname())
        hosts.update(ip_list)
        if hostname:
            try:
                host_ip = socket.gethostbyname(hostname)
                hosts.add(host_ip)
            except socket.gaierror:
                pass
    except socket.gaierror:
        pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            hosts.add(sock.getsockname()[0])
    except OSError:
        pass

    private_hosts = set()
    for host in hosts:
        try:
            if ipaddress.ip_address(host).is_private:
                private_hosts.add(host)
        except ValueError:
            continue
    return private_hosts


def _collect_private_origins(ports: Iterable[int]) -> set[str]:
    """Create origins for discovered private IPs and common dev ports."""

    origins: set[str] = set()
    for host in _private_ip_hosts():
        for port in ports:
            origins.add(f"http://{host}:{port}")
    return origins


DEV_SERVER_PORTS = {3000, 5173, 8989}

DEFAULT_ORIGINS: set[str] = set()

for base_origin in (
    "http://192.168.99.71:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:5173",
    "http://localhost:8989",
    "http://127.0.0.1:8989",
):
    _add_origin(DEFAULT_ORIGINS, base_origin)

for env_origin in _iter_env_origins():
    _add_origin(DEFAULT_ORIGINS, env_origin)

for private_origin in _collect_private_origins(DEV_SERVER_PORTS):
    _add_origin(DEFAULT_ORIGINS, private_origin)

private_host_pattern = (
    r"(localhost|127\.0\.0\.1|0\.0\.0\.0|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})"
)

allow_all_origins = os.environ.get("DEV_ALLOW_ALL_ORIGINS", "1").lower() in {"1", "true", "yes"}
cors_kwargs: dict[str, object]

if allow_all_origins:
    cors_kwargs = {
        "allow_origins": sorted(DEFAULT_ORIGINS),
        "allow_origin_regex": r"^https?://[^/]+$",
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
else:
    origin_regex = rf"^https?://{private_host_pattern}(?::\d+)?$"
    cors_kwargs = {
        "allow_origins": sorted(DEFAULT_ORIGINS),
        "allow_origin_regex": origin_regex,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }

app.add_middleware(CORSMiddleware, **cors_kwargs)

# Import route modules to register routers with the application.
from . import (  # noqa: E402
    averages,
    boxed,
    delivery_estimator,
    diesel,
    feed,
    indexes,
    maintenance,
    receipts,
    route_logs,
    reports,
    tables,
    temperature,
    trimmings,
    weather,
)

app.include_router(boxed.router)
app.include_router(indexes.router)
app.include_router(averages.router)
app.include_router(trimmings.router)
app.include_router(reports.router)
app.include_router(tables.router)
app.include_router(temperature.router)
app.include_router(diesel.router)
app.include_router(weather.router)
app.include_router(feed.router)
app.include_router(delivery_estimator.router)
app.include_router(maintenance.router)
app.include_router(receipts.router)
app.include_router(route_logs.router)

__all__ = [
    "app",
    "logger",
    "pg_dsn_from_env",
    "psycopg",
    "fetch_series",
]
