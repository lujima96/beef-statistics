from __future__ import annotations

import json
import logging
from datetime import date
from typing import List, Optional, Tuple

from .core import (
    IndexSeries,
    PricePoint,
    SupplyDemandEqRow,
    SupplyDemandHeadRow,
    _parse_date_str,
    _repo_root_from_here,
)

logger = logging.getLogger(__name__)


def load_five_day_avg_from_processed(
    *, start_date: Optional[date], end_date: Optional[date]
) -> Tuple[List[PricePoint], List[PricePoint]]:
    """Scan processed catalog component files for five_area_avg data."""

    base = (
        _repo_root_from_here()
        / "beef_stats"
        / "processed"
        / "processed_catalog"
        / "five_area_avg"
    )
    if not base.exists():
        return [], []

    def _parse_date(s: str) -> Optional[date]:
        try:
            y, m, d = map(int, s.split("-"))
            return date(y, m, d)
        except (ValueError, TypeError):
            return None
        except Exception:
            logger.exception("Unexpected error parsing date %r", s)
            return None

    steer: List[PricePoint] = []
    heifer: List[PricePoint] = []
    for path in sorted(base.glob("*.json")):
        dt = _parse_date(path.stem)
        if dt is None:
            continue
        if start_date and dt < start_date:
            continue
        if end_date and dt > end_date:
            continue
        try:
            obj = json.loads(path.read_text())
            cats = obj.get("five_area_weekly_avg_cattle_price", {}).get("categories", [])
            for it in cats:
                typ = str(it.get("type", ""))
                price = it.get("avg_price")
                if price is None:
                    continue
                p = {"date": dt.isoformat(), "value": float(price)}
                if typ == "Live Steer":
                    steer.append(p)
                elif typ == "Live Heifer":
                    heifer.append(p)
        except (ValueError, TypeError, json.JSONDecodeError):
            continue
        except Exception:
            logger.exception("Unexpected error reading file %s", path)
            continue
    return steer, heifer


def load_supply_demand_from_processed(
    *,
    start_date: Optional[date],
    end_date: Optional[date],
) -> Tuple[
    List[SupplyDemandEqRow],
    List[SupplyDemandEqRow],
    List[SupplyDemandHeadRow],
]:
    """Fallback loader that scans processed index JSON files on disk."""

    base = _repo_root_from_here() / "beef_stats" / "processed" / "processed_index"
    if not base.exists():
        return [], [], []

    choice: List[SupplyDemandEqRow] = []
    select_: List[SupplyDemandEqRow] = []
    heads: List[SupplyDemandHeadRow] = []
    for p in base.glob("*.json"):
        try:
            obj = json.loads(p.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        except Exception:
            logger.exception("Unexpected error reading %s", p)
            continue
        ds = str(obj.get("date") or obj.get("report_date") or "")
        dt = _parse_date_str(ds)
        if dt is None:
            continue
        if start_date and dt < start_date:
            continue
        if end_date and dt > end_date:
            continue
        try:
            sect = obj.get("sections", {}).get("supply_demand", {})
            sc_eq = sect.get("supply", {}).get("equivalent", {}).get("choice")
            dc_eq = sect.get("demand", {}).get("equivalent", {}).get("choice")
            ss_eq = sect.get("supply", {}).get("equivalent", {}).get("select")
            ds_eq = sect.get("demand", {}).get("equivalent", {}).get("select")
            s_head = sect.get("supply", {}).get("head")
            d_head = sect.get("demand", {}).get("head")
            if sc_eq is not None or dc_eq is not None:
                choice.append(
                    {
                        "date": dt.isoformat(),
                        "supply": float(sc_eq) if sc_eq is not None else None,  # type: ignore[arg-type]
                        "demand": float(dc_eq) if dc_eq is not None else None,  # type: ignore[arg-type]
                    }
                )
            if ss_eq is not None or ds_eq is not None:
                select_.append(
                    {
                        "date": dt.isoformat(),
                        "supply": float(ss_eq) if ss_eq is not None else None,  # type: ignore[arg-type]
                        "demand": float(ds_eq) if ds_eq is not None else None,  # type: ignore[arg-type]
                    }
                )
            heads.append(
                {
                    "date": dt.isoformat(),
                    "supply": int(s_head) if s_head is not None else 0,
                    "demand": int(d_head) if d_head is not None else 0,
                }
            )
        except (ValueError, TypeError, AttributeError):
            continue
        except Exception:
            logger.exception(
                "Unexpected error processing supply/demand record from %s", p
            )
            continue
    choice.sort(key=lambda x: x["date"])  # type: ignore[index]
    select_.sort(key=lambda x: x["date"])  # type: ignore[index]
    heads.sort(key=lambda x: x["date"])  # type: ignore[index]
    return choice, select_, heads


def load_index_timeseries_from_processed(
    *, start_date: Optional[date], end_date: Optional[date]
) -> Tuple[List[IndexSeries], List[IndexSeries]]:
    """Fallback loader for beef carcass index choice/select values."""

    base = _repo_root_from_here() / "beef_stats" / "processed" / "processed_index"
    if not base.exists():
        return [], []

    choice: List[IndexSeries] = []
    select_: List[IndexSeries] = []
    for path in base.glob("*.json"):
        try:
            obj = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        except Exception:
            logger.exception("Unexpected error reading %s", path)
            continue
        ds = str(obj.get("date") or obj.get("report_date") or "")
        dt = _parse_date_str(ds)
        if dt is None:
            continue
        if start_date and dt < start_date:
            continue
        if end_date and dt > end_date:
            continue
        try:
            sect = obj.get("sections", {}).get("beef_carcass_index", {})
            choice_val = sect.get("choice", {}).get("value")
            select_val = sect.get("select", {}).get("value")
            if choice_val is not None:
                choice.append({"date": dt.isoformat(), "value": float(choice_val)})
            if select_val is not None:
                select_.append({"date": dt.isoformat(), "value": float(select_val)})
        except (ValueError, TypeError, AttributeError):
            continue
        except Exception:
            logger.exception(
                "Unexpected error processing carcass index record from %s", path
            )
            continue
    choice.sort(key=lambda x: x["date"])  # type: ignore[index]
    select_.sort(key=lambda x: x["date"])  # type: ignore[index]
    return choice, select_


def load_cattle_price_from_processed(
    *, start_date: Optional[date], end_date: Optional[date]
) -> Tuple[List[PricePoint], List[PricePoint]]:
    """Fallback loader for cattle price from processed index JSON files."""

    base = _repo_root_from_here() / "beef_stats" / "processed" / "processed_index"
    if not base.exists():
        return [], []

    steer: List[PricePoint] = []
    heifer: List[PricePoint] = []
    for p in base.glob("*.json"):
        try:
            obj = json.loads(p.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        except Exception:
            logger.exception("Unexpected error reading %s", p)
            continue
        ds = str(obj.get("date") or obj.get("report_date") or "")
        dt = _parse_date_str(ds)
        if dt is None:
            continue
        if start_date and dt < start_date:
            continue
        if end_date and dt > end_date:
            continue
        try:
            sect = obj.get("sections", {}).get("national_daily_direct_cattle", {})
            sv = sect.get("live_steer", {}).get("price")
            hv = sect.get("live_heifer", {}).get("price")
            if sv is not None:
                steer.append({"date": dt.isoformat(), "value": float(sv)})
            if hv is not None:
                heifer.append({"date": dt.isoformat(), "value": float(hv)})
        except (ValueError, TypeError, AttributeError):
            continue
        except Exception:
            logger.exception(
                "Unexpected error processing cattle price record from %s", p
            )
            continue
    steer.sort(key=lambda x: x["date"])  # type: ignore[index]
    heifer.sort(key=lambda x: x["date"])  # type: ignore[index]
    return steer, heifer


__all__ = [
    "load_five_day_avg_from_processed",
    "load_supply_demand_from_processed",
    "load_index_timeseries_from_processed",
    "load_cattle_price_from_processed",
]
