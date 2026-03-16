#!/usr/bin/env python3
"""
Dev bootstrap: starts Postgres (Docker), Frontend (Vite), and API (Uvicorn).

Behavior
- Loads DB env from beef_stats/.env (POSTGRES_* and PG_HOST_PORT)
- Ensures Docker Compose 'db' service is up (container: beef-postgres)
- Starts frontend on 5173 if not already listening
- Starts API on 8000 if not already listening

Usage
  python start_dev.py

Logs
- frontend stderr -> ./frontend_dev.err
- api stderr       -> ./api_dev.err
"""

from __future__ import annotations

import ipaddress
import os
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional, Sequence, Tuple


ROOT = Path(__file__).resolve().parent
ENV_FILE_CANDIDATES = [ROOT / "beef_stats" / ".env", ROOT / ".env"]
FRONTEND_DIR_CANDIDATES = [ROOT / "beef_stats" / "front_end", ROOT / "front_end"]
API_DIR_CANDIDATES = [ROOT / "beef_stats" / "back-end" / "API", ROOT / "back-end" / "API"]
DEFAULT_GH_MAP_NAME = "arkansas-latest.osm.pbf"
DEFAULT_GH_MAP_URL = "https://download.geofabrik.de/north-america/us/arkansas-latest.osm.pbf"


def log(msg: str) -> None:
    print(f"[start_dev] {msg}")


def err(msg: str) -> None:
    print(f"[start_dev][ERROR] {msg}", file=sys.stderr)


def load_env_file(path: Path) -> None:
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            # Strip optional quotes
            if (val.startswith("\"") and val.endswith("\"")) or (
                val.startswith("'") and val.endswith("'")
            ):
                val = val[1:-1]
            os.environ[key] = val
    log(f"Loaded env from {path}")


def find_existing_path(candidates: Sequence[Path]) -> Optional[Path]:
    for path in candidates:
        if path.exists():
            return path
    return None


def which(cmd: str) -> Optional[str]:
    from shutil import which as _which

    return _which(cmd)


def is_port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def guess_lan_ip() -> str:
    """Return the first private IPv4 address we can detect."""

    candidates: List[str] = []

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            candidates.append(s.getsockname()[0])
    except OSError:
        pass

    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, family=socket.AF_INET)
        for _family, _type, _proto, _canon, sockaddr in infos:
            candidates.append(sockaddr[0])
    except OSError:
        pass

    # Deduplicate while preserving order
    seen: List[str] = []
    for addr in candidates:
        if addr and addr not in seen:
            seen.append(addr)

    for addr in seen:
        try:
            if ipaddress.ip_address(addr).is_private and addr not in {"127.0.0.1", "0.0.0.0"}:
                return addr
        except ValueError:
            continue

    for addr in seen:
        if addr not in {"127.0.0.1", "0.0.0.0"}:
            return addr

    return "localhost"


def get_compose_cmd() -> Optional[Tuple[str, ...]]:
    if which("docker") and subprocess.run(
        ["docker", "compose", "version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ).returncode == 0:
        return ("docker", "compose")
    if which("docker-compose"):
        return ("docker-compose",)
    return None


def start_db() -> None:
    compose = get_compose_cmd()
    if not compose:
        err("Docker Compose not found; skipping DB startup.")
        return
    pg_port = int(os.environ.get("PG_HOST_PORT", "5432") or 5432)
    log(f"Ensuring Postgres is up (port {pg_port}) ...")
    # Run compose up -d db
    try:
        subprocess.run([*compose, "up", "-d", "db"], cwd=ROOT, check=True)
    except subprocess.CalledProcessError as e:
        err(f"Failed to start docker compose db: {e}")
        return

    # Wait for health if healthcheck exists
    container = "beef-postgres"
    if which("docker"):
        timeout = 60
        waited = 0
        while waited < timeout:
            try:
                out = subprocess.check_output(
                    ["docker", "inspect", "-f", "{{.State.Health.Status}}", container],
                    stderr=subprocess.DEVNULL,
                )
                status = out.decode().strip()
            except subprocess.CalledProcessError:
                status = ""
            if status == "healthy":
                log("Database is healthy.")
                break
            time.sleep(2)
            waited += 2
        else:
            err("Database not healthy after 60s; continuing anyway.")


def start_graphhopper() -> None:
    compose = get_compose_cmd()
    if not compose:
        err("Docker Compose not found; skipping GraphHopper startup.")
        return

    map_file = os.environ.get("GRAPHHOPPER_MAP_FILE")
    if not map_file:
        err("GRAPHHOPPER_MAP_FILE not set; skipping GraphHopper startup.")
        return
    map_path = Path(map_file).expanduser()
    if not map_path.exists():
        err(f"GraphHopper map file not found at {map_path}; skipping GraphHopper startup.")
        return
    if not map_path.is_file():
        err(f"GraphHopper map path must be a .osm.pbf file, but got {map_path}; skipping GraphHopper startup.")
        return

    port_raw = os.environ.get("GRAPHHOPPER_HOST_PORT") or os.environ.get("GRAPHHOPPER_PORT")
    try:
        port = int(port_raw) if port_raw else 8989
    except ValueError:
        port = 8989

    log(f"Ensuring GraphHopper is up (port {port}) ...")
    try:
        subprocess.run([*compose, "up", "-d", "graphhopper"], cwd=ROOT, check=True)
    except subprocess.CalledProcessError as e:
        err(f"Failed to start docker compose graphhopper: {e}")
        return

    timeout = 120
    waited = 0
    while waited < timeout:
        if is_port_open(port):
            log("GraphHopper is reachable.")
            break
        time.sleep(2)
        waited += 2
    else:
        err("GraphHopper did not open its port within 120s; continuing anyway.")


def start_graphhopper_ui(lan_ip: str) -> None:
    compose = get_compose_cmd()
    if not compose:
        err("Docker Compose not found; skipping GraphHopper UI startup.")
        return

    port_raw = os.environ.get("GRAPHHOPPER_UI_HOST_PORT", "3000")
    try:
        port = int(port_raw)
    except ValueError:
        port = 3000

    log(f"Ensuring GraphHopper UI is up (port {port}) ...")
    try:
        subprocess.run([*compose, "up", "-d", "graphhopper_ui"], cwd=ROOT, check=True)
    except subprocess.CalledProcessError as e:
        err(f"Failed to start docker compose graphhopper_ui: {e}")
        return

    timeout = 60
    waited = 0
    while waited < timeout:
        if is_port_open(port):
            log(f"GraphHopper UI is reachable (http://{lan_ip}:{port}).")
            break
        time.sleep(2)
        waited += 2
    else:
        err("GraphHopper UI did not open its port within 60s; continuing anyway.")


def ensure_graphhopper_map() -> Optional[Path]:
    """Ensure a GraphHopper map file exists and return its path.

    Preference order:
      1. Respect an explicit GRAPHHOPPER_MAP_FILE if it points to an existing file.
      2. Otherwise, download the vendored Arkansas extract into graphhopper/map-data.
    """

    map_file_env = os.environ.get("GRAPHHOPPER_MAP_FILE")
    if map_file_env:
        path = Path(map_file_env).expanduser()
        if path.exists() and path.is_file():
            return path
        if path.exists() and not path.is_file():
            err(f"GRAPHHOPPER_MAP_FILE={path} is not a file; falling back to repo-managed map data.")
        else:
            err(f"GRAPHHOPPER_MAP_FILE={path} does not exist; falling back to repo-managed map data.")

    map_dir = ROOT / "graphhopper" / "map-data"
    map_dir.mkdir(parents=True, exist_ok=True)
    map_path = map_dir / DEFAULT_GH_MAP_NAME

    if map_path.exists():
        os.environ["GRAPHHOPPER_MAP_FILE"] = str(map_path)
        return map_path

    url = os.environ.get("GRAPHHOPPER_MAP_URL", DEFAULT_GH_MAP_URL)
    log(f"Downloading GraphHopper map data (Arkansas) from {url} ...")

    try:
        with urllib.request.urlopen(url) as response, tempfile.NamedTemporaryFile(delete=False, dir=str(map_dir)) as tmp:
            shutil.copyfileobj(response, tmp)
            temp_path = Path(tmp.name)
    except (OSError, urllib.error.URLError) as exc:
        err(f"Failed to download GraphHopper map data: {exc}")
        return None

    try:
        temp_path.replace(map_path)
    except OSError as exc:
        err(f"Failed to store GraphHopper map data at {map_path}: {exc}")
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        return None

    os.environ["GRAPHHOPPER_MAP_FILE"] = str(map_path)
    log(f"GraphHopper map saved to {map_path}")
    return map_path


def _pick_js_pm(frontend_dir: Path) -> Optional[Tuple[List[str], List[str]]]:
    """Pick a JS package manager and return (install_cmd, dev_cmd).

    - Prefers pnpm if lockfile present and binary exists
    - Then yarn if lockfile present and binary exists
    - Falls back to npm if available
    """
    pnpm = which("pnpm")
    yarn = which("yarn")
    npm = which("npm")

    dev_args = ["--host", "0.0.0.0", "--port", os.environ.get("VITE_DEV_SERVER_PORT", "5173")]

    if (frontend_dir / "pnpm-lock.yaml").exists() and pnpm:
        return (["pnpm", "install"], ["pnpm", "dev", "--", *dev_args])
    if (frontend_dir / "yarn.lock").exists() and yarn:
        return (["yarn", "install"], ["yarn", "dev", "--", *dev_args])
    if npm:
        # Use npm ci if lockfile present; else install
        install_cmd = ["npm", "ci"] if (frontend_dir / "package-lock.json").exists() else ["npm", "install"]
        # Pass extra args after -- to the script
        dev_cmd = ["npm", "run", "dev", "--", *dev_args]
        return (install_cmd, dev_cmd)
    return None


def start_frontend(lan_ip: str) -> None:
    port = 5173
    if is_port_open(port):
        log(f"Frontend already running on port {port} (http://{lan_ip}:{port}).")
        return

    frontend_dir = find_existing_path(FRONTEND_DIR_CANDIDATES)
    if not frontend_dir:
        tried = ", ".join(str(p) for p in FRONTEND_DIR_CANDIDATES)
        err(f"Frontend directory not found; looked in: {tried}")
        return

    pm_cmds = _pick_js_pm(frontend_dir)
    if not pm_cmds:
        err("No JS package manager found (pnpm/yarn/npm); cannot start frontend.")
        return
    install_cmd, dev_cmd = pm_cmds

    # Ensure dependencies are installed if node_modules absent
    node_modules = frontend_dir / "node_modules"
    if not node_modules.exists() or not any(node_modules.iterdir()):
        log("Installing frontend dependencies ...")
        try:
            subprocess.run(install_cmd, cwd=frontend_dir, check=True)
        except subprocess.CalledProcessError as e:
            err(f"Dependency install failed: {e}")
            # Continue and attempt to start; user can install manually

    log(f"Starting frontend ({' '.join(dev_cmd)}) ...")
    err_file = ROOT / "frontend_dev.err"
    with err_file.open("ab", buffering=0) as ef:
        # Detach process
        subprocess.Popen(
            dev_cmd,
            cwd=frontend_dir,
            stdout=subprocess.DEVNULL,
            stderr=ef,
        )
    time.sleep(1)
    if is_port_open(port):
        log(f"Frontend started (http://{lan_ip}:{port}).")
    else:
        log("Frontend launch initiated; it may still be booting.")


def start_api(lan_ip: str) -> None:
    port = 8000
    if is_port_open(port):
        log(f"API already running on port {port}.")
        return
    py = which("python") or which("python3")
    if not py:
        err("Python not found; cannot start API.")
        return
    api_dir = find_existing_path(API_DIR_CANDIDATES)
    if not api_dir:
        tried = ", ".join(str(p) for p in API_DIR_CANDIDATES)
        err(f"API directory not found; looked in: {tried}")
        return
    log("Starting API (uvicorn routes:app) ...")
    # Ensure DB env exported for app
    os.environ.setdefault("PGHOST", os.environ.get("PGHOST", "localhost"))
    os.environ.setdefault("PGPORT", os.environ.get("PGPORT", os.environ.get("PG_HOST_PORT", "5432")))
    os.environ.setdefault("API_HOST", "0.0.0.0")
    os.environ.setdefault("API_PORT", str(port))

    err_file = ROOT / "api_dev.err"
    with err_file.open("ab", buffering=0) as ef:
        subprocess.Popen(
            # Import path here should be relative to API_DIR. Since cwd=API_DIR,
            # the app module is just "routes:app" (not "API.routes:app").
            [py, "-m", "uvicorn", "routes:app", "--host", "0.0.0.0", "--port", str(port), "--reload"],
            cwd=api_dir,
            stdout=subprocess.DEVNULL,
            stderr=ef,
        )
    time.sleep(1)
    if is_port_open(port):
        log(f"API started (http://{lan_ip}:{port}).")
    else:
        log("API launch initiated; it may still be booting.")


def main() -> int:
    # Load env/config
    env_file = find_existing_path(ENV_FILE_CANDIDATES)
    if env_file:
        load_env_file(env_file)
    else:
        tried = ", ".join(str(p) for p in ENV_FILE_CANDIDATES)
        err(f"No .env file found; proceeding with current environment (looked in: {tried})")

    # Default DB envs if not present
    os.environ.setdefault("POSTGRES_USER", "postgres")
    os.environ.setdefault("POSTGRES_DB", "beef_data")
    os.environ.setdefault("PG_HOST_PORT", "5432")
    os.environ.setdefault("GRAPHHOPPER_HOST_PORT", "8989")
    os.environ.setdefault("GRAPHHOPPER_TIMEOUT", "10")
    os.environ.setdefault("GRAPHHOPPER_UI_HOST_PORT", "3000")
    # Note: POSTGRES_PASSWORD may be empty

    # Map for psycopg in app
    os.environ.setdefault("PGHOST", "localhost")
    os.environ.setdefault("PGPORT", os.environ.get("PG_HOST_PORT", "5432"))

    lan_ip = guess_lan_ip()
    os.environ.setdefault("VITE_API_BASE", f"http://{lan_ip}:8000")
    os.environ.setdefault("DEV_FRONTEND_ORIGIN", f"http://{lan_ip}:5173")
    os.environ.setdefault("VITE_DEV_SERVER_HOST", "0.0.0.0")
    os.environ.setdefault("VITE_DEV_SERVER_PORT", "5173")
    os.environ.setdefault("VITE_DEV_SERVER_PUBLIC_URL", f"http://{lan_ip}:5173")
    gh_port_raw = os.environ.get("GRAPHHOPPER_HOST_PORT", "8989")
    try:
        gh_port = int(gh_port_raw)
    except ValueError:
        gh_port = 8989
    os.environ.setdefault("GRAPHHOPPER_BASE_URL", f"http://{lan_ip}:{gh_port}")
    os.environ.setdefault("GRAPHHOPPER_UI_ROUTING_API", f"http://{lan_ip}:{gh_port}/")
    os.environ.setdefault("GRAPHHOPPER_UI_GEOCODING_API", "https://graphhopper.com/api/1/")
    os.environ.setdefault("BEEF_STATS_API_BASE", f"http://{lan_ip}:8000")
    os.environ.setdefault("VITE_GRAPHOPPER_UI_URL", f"http://{lan_ip}:3000")

    # Start services
    start_db()
    map_path = ensure_graphhopper_map()
    if map_path:
        os.environ.setdefault("GRAPHHOPPER_MAP_FILE", str(map_path))
        start_graphhopper()
    else:
        err("GraphHopper map unavailable; GraphHopper will not be started.")
    start_graphhopper_ui(lan_ip)
    start_frontend(lan_ip)
    start_api(lan_ip)

    log("All done. Open:")
    log(f"  Frontend: http://{lan_ip}:5173")
    log(f"  API docs: http://{lan_ip}:8000/docs")
    log(f"  GraphHopper UI: http://{lan_ip}:{os.environ.get('GRAPHHOPPER_UI_HOST_PORT', '3000')}")
    log("  (Replace with your machine's LAN IP when sharing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
