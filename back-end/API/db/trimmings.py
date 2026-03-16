from __future__ import annotations

import json
import logging
import re
from datetime import date
from pathlib import Path
from typing import List, Literal, Optional, Tuple

import psycopg
from psycopg import sql as psql

from sql_helpers import build_date_range_clause

from .core import MarketParam, PricePoint, _parse_date_str, _repo_root_from_here

logger = logging.getLogger(__name__)


def _label_to_regex(label: str) -> str:
    """Normalize a lean label to a case-insensitive regex."""

    m = re.match(r"\s*(Fresh|Frozen)\s*(\d{2})\s*%\s*$", label, re.IGNORECASE)
    if m:
        kind = m.group(1)
        pct = m.group(2)
        return rf"^\s*{kind}\s*{pct}\s*%\s*$"
    return rf"^{re.escape(label)}$"


def fetch_trimmings_series(
    conn: psycopg.Connection,
    *,
    table: Literal["trimmings_am_reports_json", "trimmings_pm_reports_json"],
    market: Literal["national", "central"],
    label: str,
    start_date: Optional[date],
    end_date: Optional[date],
) -> List[PricePoint]:
    """Fetch trimmings weighted averages for a given market and label."""

    where_sql_parts: List[psql.SQL] = []
    params: List[object] = []
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)
    where_sql = (
        psql.SQL(" AND ").join(where_sql_parts) if where_sql_parts else psql.SQL("TRUE")
    )

    query = psql.SQL(
        """
        SELECT t.report_date::text AS d,
               (ln->>'weighted_average')::numeric AS v
        FROM {}.{} AS t
        CROSS JOIN LATERAL jsonb_array_elements(t.payload->'sections'->'markets') mk
        CROSS JOIN LATERAL jsonb_array_elements(mk->'lines') ln
        WHERE {}
          AND (mk->>'market_key') = %s
          AND (ln->>'lean_label') ~* %s
          AND (ln->>'weighted_average') IS NOT NULL
        ORDER BY t.report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier(table), where_sql)

    out: List[PricePoint] = []
    with conn.cursor() as cur:
        cur.execute(query, params + [market, _label_to_regex(label)])
        for d, v in cur.fetchall():
            if v is None:
                continue
            try:
                out.append({"date": d, "value": float(v)})
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing trimmings row for %s with value %r",
                    d,
                    v,
                )
    return out


def fetch_trimmings_options(conn: psycopg.Connection) -> List[str]:
    """Return distinct lean_label options present in trimmings reports."""

    pattern = r'^(Fresh|Frozen) (5[0-9]|7[0-9])%$'
    q = psql.SQL(
        """
        WITH labels AS (
          SELECT DISTINCT ln->>'lean_label' AS label
          FROM {}.{} t
          CROSS JOIN LATERAL jsonb_array_elements(t.payload->'sections'->'markets') mk
          CROSS JOIN LATERAL jsonb_array_elements(mk->'lines') ln
          WHERE (ln->>'weighted_average') IS NOT NULL AND (ln->>'weighted_average')::numeric > 0
          UNION
          SELECT DISTINCT ln->>'lean_label' AS label
          FROM {}.{} t
          CROSS JOIN LATERAL jsonb_array_elements(t.payload->'sections'->'markets') mk
          CROSS JOIN LATERAL jsonb_array_elements(mk->'lines') ln
          WHERE (ln->>'weighted_average') IS NOT NULL AND (ln->>'weighted_average')::numeric > 0
        )
        SELECT label
        FROM labels
        WHERE label ~ %s
        ORDER BY
          (regexp_replace(label, '^(Fresh|Frozen) ', ''))::text,
          label
        """
    ).format(
        psql.Identifier("beef_data"), psql.Identifier("trimmings_am_reports_json"),
        psql.Identifier("beef_data"), psql.Identifier("trimmings_pm_reports_json"),
    )
    opts: List[str] = []
    with conn.cursor() as cur:
        cur.execute(q, [pattern])
        for (label,) in cur.fetchall():
            if label:
                opts.append(label)
    return opts


def load_trimmings_options_from_processed() -> List[str]:
    """Scan processed trimmings JSON files and return distinct lean_label options.

    Filters to labels matching the same pattern used in DB fetch (Fresh/Frozen 50–79%).
    """

    base = _repo_root_from_here() / "beef_stats" / "processed"
    dirs = [base / "processed_trimmings_am", base / "processed_trimmings_pm"]
    if not all(d.exists() for d in dirs):
        return []
    pattern = re.compile(r"^(Fresh|Frozen) (5[0-9]|7[0-9])%$", re.IGNORECASE)
    seen: set[str] = set()
    out: List[str] = []
    for d in dirs:
        for p in d.glob("*.json"):
            try:
                obj = json.loads(p.read_text())
            except Exception:
                continue
            try:
                mkts = obj.get("sections", {}).get("markets", [])
                for mk in mkts:
                    for ln in mk.get("lines", []) or []:
                        lab = str(ln.get("lean_label") or "")
                        wav = ln.get("weighted_average")
                        if not lab or wav is None:
                            continue
                        if not pattern.match(lab):
                            continue
                        if lab not in seen:
                            seen.add(lab)
                            out.append(lab)
            except Exception:
                continue
    out.sort(key=lambda s: (re.sub(r"^(Fresh|Frozen) ", "", s, flags=re.IGNORECASE), s))
    return out


def _load_trimmings_series_from_dir(
    dir_path: Path,
    *,
    market: Literal["national", "central"],
    label_regex: re.Pattern[str],
    start_date: Optional[date],
    end_date: Optional[date],
) -> List[PricePoint]:
    """Internal helper to load trimmings series data from disk."""

    series: List[PricePoint] = []
    if not dir_path.exists():
        return series
    for p in dir_path.glob("*.json"):
        dt = _parse_date_str(p.stem)
        if dt is None:
            continue
        if start_date and dt < start_date:
            continue
        if end_date and dt > end_date:
            continue
        try:
            obj = json.loads(p.read_text())
        except Exception:
            continue
        try:
            mkts = obj.get("sections", {}).get("markets", [])
            for mk in mkts:
                if str(mk.get("market_key")) != market:
                    continue
                for ln in mk.get("lines", []) or []:
                    lab = str(ln.get("lean_label") or "")
                    wav = ln.get("weighted_average")
                    if wav is None:
                        continue
                    if not label_regex.match(lab):
                        continue
                    try:
                        series.append({"date": dt.isoformat(), "value": float(wav)})
                    except (ValueError, TypeError):
                        pass
        except Exception:
            continue
    series.sort(key=lambda x: x["date"])  # type: ignore[index]
    return series


def load_trimmings_series_from_processed(
    *,
    market: MarketParam,
    label: str,
    start_date: Optional[date],
    end_date: Optional[date],
) -> Tuple[List[PricePoint], List[PricePoint]]:
    """Fallback loader for trimmings AM/PM series from processed files.

    Returns (am_series, pm_series). If market is "any", callers should
    perform any preference/merge logic separately (e.g., prefer national,
    fill missing with central).
    """

    base = _repo_root_from_here() / "beef_stats" / "processed"
    dir_am = base / "processed_trimmings_am"
    dir_pm = base / "processed_trimmings_pm"
    if not dir_am.exists() or not dir_pm.exists():
        return [], []

    lab_re = re.compile(_label_to_regex(label), re.IGNORECASE)

    if market == "any":
        # By convention callers prefer the national market and optionally fetch
        # central values via a separate invocation if they need them for fills.
        am_nat = _load_trimmings_series_from_dir(
            dir_am,
            market="national",
            label_regex=lab_re,
            start_date=start_date,
            end_date=end_date,
        )
        pm_nat = _load_trimmings_series_from_dir(
            dir_pm,
            market="national",
            label_regex=lab_re,
            start_date=start_date,
            end_date=end_date,
        )
        return am_nat, pm_nat

    am = _load_trimmings_series_from_dir(
        dir_am,
        market=market,
        label_regex=lab_re,
        start_date=start_date,
        end_date=end_date,
    )
    pm = _load_trimmings_series_from_dir(
        dir_pm,
        market=market,
        label_regex=lab_re,
        start_date=start_date,
        end_date=end_date,
    )
    return am, pm


__all__ = [
    "fetch_trimmings_series",
    "fetch_trimmings_options",
    "load_trimmings_options_from_processed",
    "load_trimmings_series_from_processed",
]
