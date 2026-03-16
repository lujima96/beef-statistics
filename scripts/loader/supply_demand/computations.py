"""Business logic for computing supply and demand indices."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def average_z(values: List[Optional[float]], idx: int, windows: Iterable[int]) -> Optional[float]:
    target = values[idx]
    if target is None:
        return None
    z_vals: List[float] = []
    for window in windows:
        start = max(0, idx - window + 1)
        window_vals = [v for v in values[start : idx + 1] if v is not None]
        if len(window_vals) < 2:
            continue
        mean = sum(window_vals) / len(window_vals)
        variance = sum((v - mean) ** 2 for v in window_vals) / len(window_vals)
        if variance <= 1e-9:
            z_vals.append(0.0)
        else:
            z_vals.append((target - mean) / (variance ** 0.5))
    if not z_vals:
        return None
    return sum(z_vals) / len(z_vals)


def compute_indices(rows: List[Dict[str, Any]], weights: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    windows = [weights.get("windows", {}).get("short_days", 30), weights.get("windows", {}).get("medium_days", 120)]
    windows = [w for w in windows if isinstance(w, int) and w > 1]

    demand_weights = {k: v for k, v in weights.get("demand", {}).items() if isinstance(v, (int, float))}
    supply_weights = {k: v for k, v in weights.get("supply", {}).items() if isinstance(v, (int, float))}
    reweight = bool(weights.get("coverage", {}).get("reweight_missing", True))

    features: Dict[str, List[Optional[float]]] = defaultdict(list)

    for row in rows:
        cc = _to_float(row.get("choice_cutout"))
        sc = _to_float(row.get("select_cutout"))
        spread = _to_float(row.get("spread"))
        if spread is None and cc is not None and sc is not None:
            spread = cc - sc
        fresh50 = _to_float(row.get("fresh50_price"))
        fresh50_pounds = _to_float(row.get("fresh50_pounds"))
        loads = _to_float(row.get("national_loads"))
        head = _to_float(row.get("live_steer_head"))
        live_price = _to_float(row.get("live_steer_price"))
        margin = cc - live_price if (cc is not None and live_price is not None) else None

        if fresh50 is not None:
            if (fresh50_pounds is not None and fresh50_pounds <= 0) or fresh50 <= 0:
                fresh50 = None

        row["choice_cutout"] = cc
        row["select_cutout"] = sc
        row["choice_select_spread"] = spread
        row["fresh50_price"] = fresh50
        row["fresh50_pounds"] = fresh50_pounds
        row["national_loads"] = loads
        row["live_steer_head"] = head
        row["live_steer_price"] = live_price
        row["packer_margin"] = margin

        features["choice_cutout"].append(cc)
        features["choice_select_spread"].append(spread)
        features["fresh50_price"].append(fresh50)
        features["national_loads"].append(loads)
        features["live_steer_head"].append(head)
        features["packer_margin"].append(margin)

    total_features = len(demand_weights) + len(supply_weights)
    output: List[Dict[str, Any]] = []

    for idx, row in enumerate(rows):
        demand_components: Dict[str, Dict[str, Optional[float]]] = {}
        supply_components: Dict[str, Dict[str, Optional[float]]] = {}

        z_choice_cutout = average_z(features["choice_cutout"], idx, windows)
        z_spread = average_z(features["choice_select_spread"], idx, windows)
        z_trim = average_z(features["fresh50_price"], idx, windows)
        z_loads = average_z(features["national_loads"], idx, windows)
        z_heads = average_z(features["live_steer_head"], idx, windows)
        z_margin = average_z(features["packer_margin"], idx, windows)

        if row["choice_cutout"] is not None:
            demand_components["choice_cutout"] = {"value": row["choice_cutout"], "z": z_choice_cutout}
        if row["choice_select_spread"] is not None:
            demand_components["choice_select_spread"] = {"value": row["choice_select_spread"], "z": z_spread}
        if row["fresh50_price"] is not None:
            demand_components["fresh50_price"] = {"value": row["fresh50_price"], "z": z_trim}
        if row["national_loads"] is not None:
            supply_components["national_loads"] = {"value": row["national_loads"], "z": z_loads}
        if row["live_steer_head"] is not None:
            supply_components["live_steer_head"] = {"value": row["live_steer_head"], "z": z_heads}
        if row["packer_margin"] is not None:
            supply_components["packer_margin"] = {"value": row["packer_margin"], "z": z_margin}

        demand_index = None
        supply_index = None

        demand_terms: List[Tuple[float, float]] = []
        for key, weight in demand_weights.items():
            z_val = None
            if key == "choice_cutout_z":
                z_val = z_choice_cutout
            elif key == "choice_select_spread_z":
                z_val = z_spread
            elif key == "trim_50_price_z":
                z_val = z_trim
            if z_val is not None:
                demand_terms.append((z_val, weight))
        if demand_terms:
            total_weight = sum(w for _, w in demand_terms) if reweight else sum(demand_weights.values())
            if total_weight:
                demand_index = sum(z * w for z, w in demand_terms) / total_weight

        supply_terms: List[Tuple[float, float]] = []
        for key, weight in supply_weights.items():
            z_val = None
            if key == "slaughter_head_z":
                z_val = z_heads
            elif key == "trim_loads_z":
                z_val = z_loads
            elif key == "packer_margin_z":
                z_val = z_margin
            if z_val is not None:
                supply_terms.append((z_val, weight))
        if supply_terms:
            total_weight = sum(w for _, w in supply_terms) if reweight else sum(supply_weights.values())
            if total_weight:
                supply_index = sum(z * w for z, w in supply_terms) / total_weight

        used_features = sum(1 for comp in demand_components.values() if comp.get("z") is not None)
        used_features += sum(1 for comp in supply_components.values() if comp.get("z") is not None)
        coverage = (used_features / total_features * 100.0) if total_features else None

        output.append(
            {
                "report_date": row["report_date"],
                "demand_index": demand_index,
                "supply_index": supply_index,
                "demand_components": demand_components,
                "supply_components": supply_components,
                "coverage": coverage,
            }
        )

    return output
