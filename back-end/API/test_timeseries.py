#!/usr/bin/env python3
"""
Simple tester for /api/boxed-primals/timeseries.

Queries the API for each primal over the last N days ending at a given
end date (inclusive) and prints the AM/PM series to the console.

Defaults:
- end_date: 2025-09-02
- days: 5
- grade: choice
- base url: http://{API_HOST or 127.0.0.1}:{API_PORT or 8000}

Usage examples:
    python test_timeseries.py
    python test_timeseries.py --end-date 2025-09-02 --days 5 --grade select
    API_HOST=127.0.0.1 API_PORT=8000 python test_timeseries.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from typing import Any, Dict, List

from urllib.parse import urlencode
from urllib.request import Request, urlopen
from config import config


PRIMALS: Dict[str, str] = {
    "rib": "primal_rib",
    "chuck": "primal_chuck",
    "round": "primal_round",
    "loin": "primal_loin",
    "brisket": "primal_brisket",
    "short_plate": "primal_short_plate",
    "flank": "primal_flank",
}


def build_base_url() -> str:
    return f"http://{config.api_host}:{config.api_port}"


def get_json(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    qs = urlencode(params)
    req = Request(f"{url}?{qs}")
    with urlopen(req, timeout=30) as resp:
        data = resp.read()
        return json.loads(data)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Test boxed primals timeseries endpoint")
    parser.add_argument("--base-url", default=None, help="Base URL, e.g. http://127.0.0.1:8000")
    parser.add_argument("--end-date", default="2025-09-02", help="End date YYYY-MM-DD (inclusive)")
    parser.add_argument("--days", type=int, default=5, help="Number of days ending at end-date")
    parser.add_argument("--grade", choices=["choice", "select"], default="choice", help="USDA grade")
    args = parser.parse_args(argv)

    base_url = args.base_url or build_base_url()
    endpoint = f"{base_url}/api/boxed-primals/timeseries"

    try:
        end_date = dt.date.fromisoformat(args.end_date)
    except ValueError:
        print(f"Invalid --end-date: {args.end_date}", file=sys.stderr)
        return 2

    if args.days <= 0:
        print("--days must be >= 1", file=sys.stderr)
        return 2

    start_date = end_date - dt.timedelta(days=args.days - 1)

    print(f"Querying {endpoint}")
    print(f"Date window: {start_date} .. {end_date} (grade={args.grade})\n")

    for label, primal_key in PRIMALS.items():
        params = {
            "primal": primal_key,
            "grade": args.grade,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }
        try:
            payload = get_json(endpoint, params)
        except Exception as e:
            print(f"[ERROR] {label}: request failed: {e}")
            continue

        series = payload.get("series", {})
        am = series.get("am", [])
        pm = series.get("pm", [])

        print(f"== {label.upper()} ({primal_key}) ==")
        print(f"AM ({len(am)} pts):")
        for pt in am:
            d = pt.get("date")
            v = pt.get("value")
            print(f"  {d}: {v}")
        print(f"PM ({len(pm)} pts):")
        for pt in pm:
            d = pt.get("date")
            v = pt.get("value")
            print(f"  {d}: {v}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

