from __future__ import annotations

import json
import math
import logging
from dataclasses import dataclass
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Mapping, Optional, Sequence, Set, Tuple, Type, cast

from fastapi import APIRouter, HTTPException, Response

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2  # type: ignore
    ORTOOLS_AVAILABLE = True
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    pywrapcp = None  # type: ignore[assignment]
    routing_enums_pb2 = None  # type: ignore[assignment]
    ORTOOLS_AVAILABLE = False
from pydantic import BaseModel, Field, ValidationError, validator

import psycopg

try:  # pragma: no cover - allow tests to stub psycopg without errors module
    from psycopg import errors as psycopg_errors
except Exception:  # pragma: no cover - fallback when psycopg.errors is unavailable
    class _PsycopgErrorsFallback:
        UndefinedTable = Exception

    psycopg_errors = _PsycopgErrorsFallback()  # type: ignore[assignment]

from config import config
from db import pg_dsn_from_env
from services import GraphhopperClient, GraphhopperError

logger = logging.getLogger(__name__)
if logger.level == logging.NOTSET:
    logger.setLevel(logging.INFO)

DEFAULT_CAPACITY_BUFFER_RATIO = 1.25

router = APIRouter(prefix="/delivery-estimator", tags=["delivery-estimator"])

_STATE_FILE = (
    Path(__file__).resolve().parents[1] / "storage" / "delivery_estimator_state.json"
)
_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_DEPOT = {
    "locationName": "Manna",
    "address": "1600 Gregory St, North Little Rock, AR 72114",
    "windowStart": "08:00",
    "windowEnd": "17:00",
    "stopTime": "30",
    "serviceMinutes": 30,
    "latitude": 34.765763,
    "longitude": -92.250713,
}

DEPOT_NAME_LOWER = DEFAULT_DEPOT["locationName"].lower()
DEPOT_ADDRESS_LOWER = DEFAULT_DEPOT["address"].lower()

_DB_SCHEMA = "beef_data"
_WORKERS_TABLE = "delivery_estimator_workers"
_TRUCK_COSTS_TABLE = "delivery_estimator_truck_costs"
_VENDORS_TABLE = "delivery_estimator_vendors"
_ROUTES_TABLE = "delivery_estimator_routes"
_ROUTE_STOPS_TABLE = "delivery_estimator_route_stops"


def _rollback_missing_table(conn: psycopg.Connection) -> None:
    try:
        conn.rollback()
    except psycopg.Error:
        logger.exception("Failed to rollback delivery estimator transaction after missing table.")


def _model_dump(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()  # type: ignore[call-arg]


def _model_validate(model: Type[BaseModel], data: Dict[str, Any]) -> BaseModel:
    if hasattr(model, "model_validate"):
        return model.model_validate(data)  # type: ignore[attr-defined]
    return model.parse_obj(data)


def _compute_default_vehicle_capacity(
    total_demand: int, max_stop_demand: int, fleet_size: int
) -> int:
    """Derive a soft capacity per vehicle when no explicit limits are provided."""

    if fleet_size <= 0:
        return max(total_demand, 1)

    average_demand = 0
    if total_demand > 0:
        average_demand = int(math.ceil(total_demand / fleet_size))

    buffered_average = 0
    if average_demand > 0:
        buffered_average = int(math.ceil(average_demand * DEFAULT_CAPACITY_BUFFER_RATIO))

    candidate = max(max_stop_demand, buffered_average)
    if candidate <= 0:
        candidate = 1

    return candidate


class WorkerModel(BaseModel):
    id: int
    firstName: str = ""
    lastName: str = ""
    wage: str = ""
    start: str = ""
    end: str = ""


class WorkerFormModel(BaseModel):
    firstName: str = ""
    lastName: str = ""
    wage: str = ""
    start: str = ""
    end: str = ""


class TruckModel(BaseModel):
    id: int
    workerIds: List[int] = Field(default_factory=list)


class TruckCostRowModel(BaseModel):
    id: int
    make: str = ""
    year: str = ""
    mpg: Optional[float] = Field(default=None, ge=0)
    capacity: Optional[float] = Field(default=None, ge=0)
    mpgInput: str = ""
    capacityInput: str = ""
    fuelCostPerMile: Optional[float] = Field(default=None, ge=0)
    fuelCostPerMileInput: str = ""
    fuelCostMode: str = "auto"
    maintenanceCostPerMile: Optional[float] = Field(default=None, ge=0)
    maintenanceCostPerMileInput: str = ""
    maintenanceCostMode: str = "auto"
    totalCostPerMile: Optional[float] = Field(default=None, ge=0)
    totalCostPerMileInput: str = ""
    totalCostMode: str = "auto"


class TripLogEntryModel(BaseModel):
    date: str = ""
    description: str = ""
    milesDriven: str = ""
    notes: str = ""


class MaintenanceLogEntryModel(BaseModel):
    date: str = ""
    shopService: str = ""
    description: str = ""
    cost: str = ""
    notes: str = ""


class VendorModel(BaseModel):
    id: int
    locationName: str = ""
    address: str = ""
    windowStart: str = ""
    windowEnd: str = ""
    stopTime: str = ""
    latitude: Optional[float] = Field(default=None)
    longitude: Optional[float] = Field(default=None)
    serviceMinutes: Optional[int] = Field(default=None, ge=0)
    stopSequence: Optional[int] = Field(default=None, ge=0)

    @validator("latitude")
    def _validate_latitude(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < -90 or value > 90:
            raise ValueError("latitude must be between -90 and 90 degrees")
        return value

    @validator("longitude")
    def _validate_longitude(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < -180 or value > 180:
            raise ValueError("longitude must be between -180 and 180 degrees")
        return value


class VendorFormModel(BaseModel):
    locationName: str = ""
    address: str = ""
    windowStart: str = ""
    windowEnd: str = ""
    stopTime: str = ""
    latitude: str = ""
    longitude: str = ""
    serviceMinutes: str = ""
    sequence: str = ""


class RoutePlanModel(BaseModel):
    id: int
    name: str = ""
    stopIds: List[int] = Field(default_factory=list)


class RouteRunRequest(BaseModel):
    routeId: int
    truckId: int
    workerIds: List[int] = Field(default_factory=list)
    profile: str = "car"
    stopIds: List[int] = Field(default_factory=list)


class RouteRunResponse(BaseModel):
    routeId: int
    truckId: int
    distanceMiles: float
    travelSeconds: float
    serviceSeconds: float
    totalSeconds: float
    totalCost: float
    laborCost: float
    fuelCost: float
    maintenanceCost: float
    vehicleCost: float
    costPerStop: Optional[float] = None
    costPerMile: Optional[float] = None
    stopCount: int


class MultiRouteLegRequestModel(BaseModel):
    truckId: int = Field(..., ge=1)
    workerIds: List[int] = Field(default_factory=list)
    stopIds: List[int] = Field(default_factory=list)


class MultiRouteRunRequestModel(BaseModel):
    routeId: int = Field(..., ge=1)
    profile: str = Field("car", min_length=1)
    legs: List[MultiRouteLegRequestModel] = Field(default_factory=list)


class MultiRouteRunLegResultModel(BaseModel):
    workerIds: List[int] = Field(default_factory=list)
    stopIds: List[int] = Field(default_factory=list)
    summary: RouteRunResponse
    route: TruckLegResponseModel


class MultiRouteRunResponseModel(BaseModel):
    routeId: int
    profile: str
    legs: List[MultiRouteRunLegResultModel]
    totalDistanceMiles: float = Field(..., ge=0)
    totalTravelSeconds: float = Field(..., ge=0)
    totalServiceSeconds: float = Field(..., ge=0)
    totalSeconds: float = Field(..., ge=0)
    totalCost: float = Field(..., ge=0)
    laborCost: float = Field(..., ge=0)
    fuelCost: float = Field(..., ge=0)
    maintenanceCost: float = Field(..., ge=0)
    vehicleCost: float = Field(..., ge=0)
    costPerStop: Optional[float] = Field(default=None, ge=0)
    costPerMile: Optional[float] = Field(default=None, ge=0)
    stopCount: int = Field(..., ge=0)


class RouteMapStopModel(BaseModel):
    id: Optional[int]
    label: str
    latitude: float
    longitude: float
    isDepot: bool = False
    sequence: int


class RouteMapModel(BaseModel):
    id: int
    name: str
    stops: List[RouteMapStopModel]


class OptimizationFormModel(BaseModel):
    depotLatitude: str = ""
    depotLongitude: str = ""
    truckCount: str = ""


class CoordinatePayloadModel(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)

    class Config:
        allow_population_by_field_name = True


class DepotPayloadModel(BaseModel):
    id: Optional[int] = None
    name: str = ""
    coordinates: CoordinatePayloadModel


class VendorWaypointModel(BaseModel):
    id: Optional[int] = None
    locationName: str = ""
    coordinates: CoordinatePayloadModel
    serviceMinutes: int = Field(0, ge=0)
    sequence: Optional[int] = Field(default=None, ge=0)


class TruckLegPlanModel(BaseModel):
    truckId: Optional[int] = None
    startDepot: DepotPayloadModel
    vendors: List[VendorWaypointModel] = Field(default_factory=list)
    endDepot: Optional[DepotPayloadModel] = None
    returnToStart: bool = False


class DeliveryRouteOptimizationRequest(BaseModel):
    fleetSize: int = Field(..., ge=1)
    legs: List[TruckLegPlanModel] = Field(default_factory=list)
    profile: str = Field("car", min_length=1)
    optimizeAssignments: bool = False


class LegSequenceEntryModel(BaseModel):
    id: Optional[int] = None
    label: str
    stopType: Literal["depot", "vendor", "return"]


class TurnInstructionModel(BaseModel):
    text: str
    distanceMeters: float = Field(..., ge=0)
    timeSeconds: float = Field(..., ge=0)
    sign: Optional[int] = None


class StopTimingModel(BaseModel):
    id: Optional[int] = None
    label: str
    stopType: Literal["depot", "vendor", "return"]
    sequence: int
    arrivalMinutes: float = Field(..., ge=0)
    departureMinutes: float = Field(..., ge=0)
    serviceMinutes: float = Field(..., ge=0)


class CostBreakdownModel(BaseModel):
    laborHours: float = Field(..., ge=0)
    laborCost: Optional[float] = Field(default=None, ge=0)
    fuelGallons: Optional[float] = Field(default=None, ge=0)
    fuelCost: Optional[float] = Field(default=None, ge=0)
    totalCost: Optional[float] = Field(default=None, ge=0)


class TruckLegResponseModel(BaseModel):
    truckId: Optional[int] = None
    sequence: List[LegSequenceEntryModel]
    distanceMeters: float = Field(..., ge=0)
    travelSeconds: float = Field(..., ge=0)
    serviceSeconds: float = Field(..., ge=0)
    totalSeconds: float = Field(..., ge=0)
    geometry: List[CoordinatePayloadModel] = Field(default_factory=list)
    instructions: List[TurnInstructionModel]
    stops: List[StopTimingModel]
    costs: CostBreakdownModel


class SolverDiagnosticsModel(BaseModel):
    status: Literal["success", "no_solution", "timeout", "not_solved", "error"]
    statusDetail: Optional[str] = None
    unassignedStops: List[LegSequenceEntryModel] = Field(default_factory=list)
    violatedConstraints: List[str] = Field(default_factory=list)


class DeliveryRouteOptimizationResponseModel(BaseModel):
    fleetSize: int = Field(..., ge=1)
    legs: List[TruckLegResponseModel]
    totalDistanceMeters: float = Field(..., ge=0)
    totalTravelSeconds: float = Field(..., ge=0)
    totalServiceSeconds: float = Field(..., ge=0)
    totalCost: Optional[float] = Field(default=None, ge=0)
    diagnostics: SolverDiagnosticsModel


class DeliveryEstimatorStateModel(BaseModel):
    schemaVersion: int = Field(default=5, ge=0)
    workers: List[WorkerModel] = Field(default_factory=list)
    workerForm: WorkerFormModel = Field(default_factory=WorkerFormModel)
    trucks: List[TruckModel] = Field(default_factory=list)
    truckCostRows: List[TruckCostRowModel] = Field(default_factory=list)
    tripLogsByTruck: Dict[str, List[TripLogEntryModel]] = Field(default_factory=dict)
    maintenanceLogsByTruck: Dict[str, List[MaintenanceLogEntryModel]] = Field(
        default_factory=dict
    )
    routes: List[RoutePlanModel] = Field(default_factory=list)
    routesByTruck: Dict[str, List[int]] = Field(default_factory=dict)
    vendors: List[VendorModel] = Field(default_factory=list)
    vendorForm: VendorFormModel = Field(default_factory=VendorFormModel)
    optimizationForm: OptimizationFormModel = Field(default_factory=OptimizationFormModel)
    optimizationResult: Optional[DeliveryRouteOptimizationResponseModel] = None
    sidebarOpen: bool = True
    pdfOpen: bool = False
    multiRunResult: Optional[MultiRouteRunResponseModel] = None
    mapPreviewUrl: Optional[str] = None


_FLOAT_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")


def _fetch_workers_from_db(conn: psycopg.Connection) -> List[Dict[str, Any]]:
    query = (
        f"""
        SELECT id, first_name, last_name, wage, shift_start, shift_end
        FROM {_DB_SCHEMA}.{_WORKERS_TABLE}
        ORDER BY id ASC
        """
    )
    with conn.cursor() as cur:
        try:
            cur.execute(query)
        except psycopg_errors.UndefinedTable:
            _rollback_missing_table(conn)
            return []
        rows = cur.fetchall()

    workers: List[Dict[str, Any]] = []
    for row in rows:
        worker = WorkerModel(
            id=int(row[0]),
            firstName=(row[1] or ""),
            lastName=(row[2] or ""),
            wage=(row[3] or ""),
            start=(row[4] or ""),
            end=(row[5] or ""),
        )
        workers.append(_model_dump(worker))
    return workers


def _fetch_truck_cost_rows_from_db(conn: psycopg.Connection) -> List[Dict[str, Any]]:
    query = (
        f"""
        SELECT id, make, vehicle_year, mpg, capacity, mpg_input, capacity_input,
               fuel_cost_per_mile, fuel_cost_per_mile_input, fuel_cost_mode,
               maintenance_cost_per_mile, maintenance_cost_per_mile_input,
               maintenance_cost_mode, total_cost_per_mile, total_cost_per_mile_input,
               total_cost_mode
        FROM {_DB_SCHEMA}.{_TRUCK_COSTS_TABLE}
        ORDER BY id ASC
        """
    )
    with conn.cursor() as cur:
        try:
            cur.execute(query)
        except psycopg_errors.UndefinedTable:
            _rollback_missing_table(conn)
            return []
        rows = cur.fetchall()

    truck_rows: List[Dict[str, Any]] = []
    for row in rows:
        truck = TruckCostRowModel(
            id=int(row[0]),
            make=(row[1] or ""),
            year=(row[2] or ""),
            mpg=float(row[3]) if row[3] is not None else None,
            capacity=float(row[4]) if row[4] is not None else None,
            mpgInput=(row[5] or ""),
            capacityInput=(row[6] or ""),
            fuelCostPerMile=float(row[7]) if row[7] is not None else None,
            fuelCostPerMileInput=(row[8] or ""),
            fuelCostMode=(row[9] or "auto"),
            maintenanceCostPerMile=float(row[10]) if row[10] is not None else None,
            maintenanceCostPerMileInput=(row[11] or ""),
            maintenanceCostMode=(row[12] or "auto"),
            totalCostPerMile=float(row[13]) if row[13] is not None else None,
            totalCostPerMileInput=(row[14] or ""),
            totalCostMode=(row[15] or "auto"),
        )
        truck_rows.append(_model_dump(truck))
    return truck_rows


def _fetch_vendors_from_db(conn: psycopg.Connection) -> List[Dict[str, Any]]:
    query = (
        f"""
        SELECT id, location_name, address, window_start, window_end, stop_time,
               service_minutes, latitude, longitude, stop_sequence
        FROM {_DB_SCHEMA}.{_VENDORS_TABLE}
        ORDER BY id ASC
        """
    )
    with conn.cursor() as cur:
        try:
            cur.execute(query)
        except psycopg_errors.UndefinedTable:
            _rollback_missing_table(conn)
            return []
        rows = cur.fetchall()

    vendors: List[Dict[str, Any]] = []
    for row in rows:
        vendor = VendorModel(
            id=int(row[0]),
            locationName=(row[1] or ""),
            address=(row[2] or ""),
            windowStart=(row[3] or ""),
            windowEnd=(row[4] or ""),
            stopTime=(row[5] or ""),
            serviceMinutes=int(row[6]) if row[6] is not None else None,
            latitude=float(row[7]) if row[7] is not None else None,
            longitude=float(row[8]) if row[8] is not None else None,
            stopSequence=int(row[9]) if row[9] is not None else None,
        )
        vendors.append(_model_dump(vendor))
    return vendors


def _fetch_routes_from_db(conn: psycopg.Connection) -> List[Dict[str, Any]]:
    routes_query = (
        f"""
        SELECT id, name
        FROM {_DB_SCHEMA}.{_ROUTES_TABLE}
        ORDER BY id ASC
        """
    )
    stops_query = (
        f"""
        SELECT route_id, stop_position, vendor_id
        FROM {_DB_SCHEMA}.{_ROUTE_STOPS_TABLE}
        ORDER BY route_id ASC, stop_position ASC
        """
    )

    routes: Dict[int, Dict[str, Any]] = {}
    with conn.cursor() as cur:
        try:
            cur.execute(routes_query)
        except psycopg_errors.UndefinedTable:
            _rollback_missing_table(conn)
            return []
        for row in cur.fetchall():
            route_id = int(row[0])
            routes[route_id] = {
                "id": route_id,
                "name": row[1] or "",
                "stopIds": [],
            }

        try:
            cur.execute(stops_query)
        except psycopg_errors.UndefinedTable:
            _rollback_missing_table(conn)
            ordered_routes = list(routes.values())
            ordered_routes.sort(key=lambda item: item["id"])
            return ordered_routes
        for route_id, position, vendor_id in cur.fetchall():
            route = routes.get(int(route_id))
            if route is None:
                continue
            if vendor_id is None:
                continue
            route["stopIds"].append(int(vendor_id))

    ordered_routes = list(routes.values())
    ordered_routes.sort(key=lambda item: item["id"])
    return ordered_routes


def _fetch_route_stop_ids(cur: psycopg.Cursor[Any], route_id: int) -> List[int]:
    cur.execute(
        f"""
        SELECT vendor_id
        FROM {_DB_SCHEMA}.{_ROUTE_STOPS_TABLE}
        WHERE route_id = %s
        ORDER BY stop_position ASC
        """,
        (route_id,),
    )
    rows = cur.fetchall()
    return [int(row[0]) for row in rows]


def _fetch_vendor_records(
    cur: psycopg.Cursor[Any], vendor_ids: Sequence[int]
) -> Dict[int, Dict[str, Any]]:
    if not vendor_ids:
        return {}
    cur.execute(
        f"""
        SELECT id, location_name, address, window_start, window_end, stop_time,
               service_minutes, latitude, longitude
        FROM {_DB_SCHEMA}.{_VENDORS_TABLE}
        WHERE id = ANY(%s)
        """,
        (list(vendor_ids),),
    )
    records: Dict[int, Dict[str, Any]] = {}
    for row in cur.fetchall():
        vendor_id = int(row[0])
        records[vendor_id] = {
            "id": vendor_id,
            "location_name": row[1] or "",
            "address": row[2] or "",
            "window_start": row[3] or "",
            "window_end": row[4] or "",
            "stop_time": row[5] or "",
            "service_minutes": row[6],
            "latitude": row[7],
            "longitude": row[8],
        }
    return records


def _parse_currency(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        match = _FLOAT_PATTERN.search(value.replace(",", " "))
        if match:
            try:
                return float(match.group())
            except ValueError:  # pragma: no cover - defensive
                return 0.0
    return 0.0


def _parse_minutes(primary: Any, fallback: Any) -> int:
    candidate = primary
    if candidate is None:
        candidate = fallback
    if isinstance(candidate, (int, float)) and not isinstance(candidate, bool):
        return max(0, int(candidate))
    if isinstance(candidate, str):
        match = _FLOAT_PATTERN.search(candidate.replace(",", " "))
        if match:
            try:
                return max(0, int(float(match.group())))
            except ValueError:  # pragma: no cover - defensive
                return 0
    return 0


def _fetch_worker_wages(cur: psycopg.Cursor[Any], worker_ids: Sequence[int]) -> Dict[int, float]:
    if not worker_ids:
        return {}
    cur.execute(
        f"""
        SELECT id, wage
        FROM {_DB_SCHEMA}.{_WORKERS_TABLE}
        WHERE id = ANY(%s)
        """,
        (list(worker_ids),),
    )
    wages: Dict[int, float] = {}
    for row in cur.fetchall():
        worker_id = int(row[0])
        wages[worker_id] = _parse_currency(row[1])
    return wages


def _fetch_truck_cost_per_mile(cur: psycopg.Cursor[Any], truck_id: int) -> Tuple[float, float, float]:
    cur.execute(
        f"""
        SELECT
            total_cost_per_mile,
            total_cost_per_mile_input,
            fuel_cost_per_mile,
            fuel_cost_per_mile_input,
            maintenance_cost_per_mile,
            maintenance_cost_per_mile_input
        FROM {_DB_SCHEMA}.{_TRUCK_COSTS_TABLE}
        WHERE id = %s
        """,
        (truck_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Selected truck was not found")
    total_cost = row[0]
    if total_cost is None:
        total_cost = _parse_currency(row[1])
    fuel_cost = row[2]
    if fuel_cost is None:
        fuel_cost = _parse_currency(row[3])
    maintenance_cost = row[4]
    if maintenance_cost is None:
        maintenance_cost = _parse_currency(row[5])
    total = float(total_cost) if total_cost is not None else 0.0
    fuel = float(fuel_cost) if fuel_cost is not None else 0.0
    maintenance = float(maintenance_cost) if maintenance_cost is not None else 0.0
    if total <= 0 and (fuel > 0 or maintenance > 0):
        total = fuel + maintenance
    elif total > 0 and fuel <= 0 and maintenance <= 0:
        # When only a total is provided, assume it consists entirely of vehicle operating cost.
        fuel = 0.0
        maintenance = total
    return fuel, maintenance, total


def _get_depot_vendor(cur: psycopg.Cursor[Any]) -> Dict[str, Any]:
    cur.execute(
        f"""
        SELECT id, location_name, address, window_start, window_end, stop_time,
               service_minutes, latitude, longitude
        FROM {_DB_SCHEMA}.{_VENDORS_TABLE}
        WHERE lower(location_name) = %s OR lower(address) = %s
        LIMIT 1
        """,
        (DEPOT_NAME_LOWER, DEPOT_ADDRESS_LOWER),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Depot vendor record is missing")
    return {
        "id": int(row[0]),
        "location_name": row[1] or DEFAULT_DEPOT["locationName"],
        "address": row[2] or DEFAULT_DEPOT["address"],
        "window_start": row[3] or DEFAULT_DEPOT["windowStart"],
        "window_end": row[4] or DEFAULT_DEPOT["windowEnd"],
        "stop_time": row[5] or DEFAULT_DEPOT["stopTime"],
        "service_minutes": row[6] if row[6] is not None else DEFAULT_DEPOT["serviceMinutes"],
        "latitude": row[7] if row[7] is not None else DEFAULT_DEPOT["latitude"],
        "longitude": row[8] if row[8] is not None else DEFAULT_DEPOT["longitude"],
    }

def _load_persisted_entities() -> Dict[str, List[Dict[str, Any]]]:
    dsn = pg_dsn_from_env(config)
    try:
        with psycopg.connect(dsn) as conn:
            workers = _fetch_workers_from_db(conn)
            truck_cost_rows = _fetch_truck_cost_rows_from_db(conn)
            vendors = _fetch_vendors_from_db(conn)
            routes = _fetch_routes_from_db(conn)
    except psycopg.OperationalError as exc:
        raise HTTPException(
            status_code=503, detail=f"Database connection failed: {exc}"
        ) from exc
    except psycopg_errors.UndefinedTable:
        logger.warning("Delivery estimator tables are missing; returning empty persisted state.")
        return {
            "workers": [],
            "truckCostRows": [],
            "vendors": [],
            "routes": [],
        }
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load delivery estimator data: {exc}",
        ) from exc

    return {
        "workers": workers,
        "truckCostRows": truck_cost_rows,
        "vendors": vendors,
        "routes": routes,
    }


def _replace_workers(cur: psycopg.Cursor[Any], workers: Sequence[Any]) -> None:
    cur.execute(f"DELETE FROM {_DB_SCHEMA}.{_WORKERS_TABLE}")
    if not workers:
        return

    models: List[WorkerModel] = []
    for entry in workers:
        if isinstance(entry, WorkerModel):
            models.append(entry)
        else:
            models.append(cast(WorkerModel, _model_validate(WorkerModel, entry)))

    cur.executemany(
        f"""
        INSERT INTO {_DB_SCHEMA}.{_WORKERS_TABLE}
            (id, first_name, last_name, wage, shift_start, shift_end)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        [
            (
                int(model.id),
                model.firstName,
                model.lastName,
                model.wage,
                model.start,
                model.end,
            )
            for model in models
        ],
    )


def _replace_truck_costs(cur: psycopg.Cursor[Any], truck_cost_rows: Sequence[Any]) -> None:
    cur.execute(f"DELETE FROM {_DB_SCHEMA}.{_TRUCK_COSTS_TABLE}")
    if not truck_cost_rows:
        return

    models: List[TruckCostRowModel] = []
    for entry in truck_cost_rows:
        if isinstance(entry, TruckCostRowModel):
            models.append(entry)
        else:
            models.append(
                cast(TruckCostRowModel, _model_validate(TruckCostRowModel, entry))
            )

    cur.executemany(
        f"""
        INSERT INTO {_DB_SCHEMA}.{_TRUCK_COSTS_TABLE}
            (id, make, vehicle_year, mpg, capacity, mpg_input, capacity_input,
             fuel_cost_per_mile, fuel_cost_per_mile_input, fuel_cost_mode,
             maintenance_cost_per_mile, maintenance_cost_per_mile_input,
             maintenance_cost_mode, total_cost_per_mile, total_cost_per_mile_input,
             total_cost_mode)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                int(model.id),
                model.make,
                model.year,
                model.mpg,
                model.capacity,
                model.mpgInput,
                model.capacityInput,
                model.fuelCostPerMile,
                model.fuelCostPerMileInput,
                model.fuelCostMode,
                model.maintenanceCostPerMile,
                model.maintenanceCostPerMileInput,
                model.maintenanceCostMode,
                model.totalCostPerMile,
                model.totalCostPerMileInput,
                model.totalCostMode,
            )
            for model in models
        ],
    )


def _replace_vendors(cur: psycopg.Cursor[Any], vendors: Sequence[Any]) -> None:
    cur.execute(f"DELETE FROM {_DB_SCHEMA}.{_VENDORS_TABLE}")
    if not vendors:
        return

    models: List[VendorModel] = []
    for entry in vendors:
        if isinstance(entry, VendorModel):
            models.append(entry)
        else:
            models.append(cast(VendorModel, _model_validate(VendorModel, entry)))

    cur.executemany(
        f"""
        INSERT INTO {_DB_SCHEMA}.{_VENDORS_TABLE}
            (id, location_name, address, window_start, window_end, stop_time,
             service_minutes, latitude, longitude, stop_sequence)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                int(model.id),
                model.locationName,
                model.address,
                model.windowStart,
                model.windowEnd,
                model.stopTime,
                model.serviceMinutes,
                model.latitude,
                model.longitude,
                model.stopSequence,
            )
            for model in models
        ],
    )


def _replace_routes(cur: psycopg.Cursor[Any], routes: Sequence[Any]) -> None:
    cur.execute(f"DELETE FROM {_DB_SCHEMA}.{_ROUTE_STOPS_TABLE}")
    cur.execute(f"DELETE FROM {_DB_SCHEMA}.{_ROUTES_TABLE}")
    if not routes:
        return

    models: List[RoutePlanModel] = []
    for entry in routes:
        if isinstance(entry, RoutePlanModel):
            models.append(entry)
        else:
            models.append(cast(RoutePlanModel, _model_validate(RoutePlanModel, entry)))

    cur.executemany(
        f"""
        INSERT INTO {_DB_SCHEMA}.{_ROUTES_TABLE} (id, name)
        VALUES (%s, %s)
        """,
        [(int(model.id), model.name) for model in models],
    )

    stop_records: List[Tuple[int, int, int]] = []
    for model in models:
        for position, vendor_id in enumerate(model.stopIds, start=1):
            stop_records.append((int(model.id), position, int(vendor_id)))

    if stop_records:
        cur.executemany(
            f"""
            INSERT INTO {_DB_SCHEMA}.{_ROUTE_STOPS_TABLE} (route_id, stop_position, vendor_id)
            VALUES (%s, %s, %s)
            """,
            stop_records,
        )


def _update_route_stop_order(cur: psycopg.Cursor[Any], route_id: int, stop_ids: Sequence[int]) -> None:
    cur.execute(
        f"DELETE FROM {_DB_SCHEMA}.{_ROUTE_STOPS_TABLE} WHERE route_id = %s",
        (route_id,),
    )
    if not stop_ids:
        return
    records = [
        (route_id, position, int(vendor_id))
        for position, vendor_id in enumerate(stop_ids, start=1)
    ]
    cur.executemany(
        f"""
        INSERT INTO {_DB_SCHEMA}.{_ROUTE_STOPS_TABLE} (route_id, stop_position, vendor_id)
        VALUES (%s, %s, %s)
        """,
        records,
    )


def _persist_delivery_entities(payload: Dict[str, Any]) -> None:
    workers = payload.get("workers", [])
    truck_cost_rows = payload.get("truckCostRows", [])
    vendors = payload.get("vendors", [])
    routes = payload.get("routes", [])
    dsn = pg_dsn_from_env(config)

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                _replace_workers(cur, workers)
                _replace_truck_costs(cur, truck_cost_rows)
                _replace_vendors(cur, vendors)
                _replace_routes(cur, routes)
    except psycopg.OperationalError as exc:
        raise HTTPException(
            status_code=503, detail=f"Database connection failed: {exc}"
        ) from exc
    except psycopg_errors.UndefinedTable:
        logger.warning(
            "Delivery estimator tables are missing; skipping database persistence and using file storage only."
        )
        return
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to persist delivery estimator data: {exc}",
        ) from exc


@dataclass
class _RoutePoint:
    identifier: Optional[int]
    label: str
    latitude: float
    longitude: float
    service_minutes: int
    stop_type: Literal["depot", "vendor", "return"]


@dataclass
class _VendorStop:
    point: _RoutePoint
    location_index: int
    demand_units: int
    window_start: int
    window_end: int


@dataclass
class _VehicleInput:
    truck_id: Optional[int]
    start_point: _RoutePoint
    end_point: Optional[_RoutePoint]
    return_to_start: bool
    has_explicit_end_depot: bool


@dataclass
class TruckProfile:
    truck_id: Optional[int]
    mpg: Optional[float]
    worker_hourly_rate: float
    fuel_price_per_gallon: Optional[float]
    capacity_units: Optional[float]


def _build_route_points_for_leg(
    depot_vendor: Dict[str, Any],
    vendor_records: Dict[int, Dict[str, Any]],
    stop_ids: Sequence[int],
) -> List[_RoutePoint]:
    depot_lat = depot_vendor.get("latitude")
    depot_lon = depot_vendor.get("longitude")
    if depot_lat is None or depot_lon is None:
        raise HTTPException(status_code=400, detail="Depot location is missing coordinates.")
    depot_label = depot_vendor.get("location_name") or depot_vendor.get("address") or "Depot"

    points: List[_RoutePoint] = [
        _RoutePoint(
            identifier=depot_vendor["id"],
            label=str(depot_label),
            latitude=float(depot_lat),
            longitude=float(depot_lon),
            service_minutes=0,
            stop_type="depot",
        )
    ]

    for index, vendor_id in enumerate(stop_ids, start=1):
        vendor = vendor_records.get(vendor_id)
        if vendor is None:
            raise HTTPException(
                status_code=400,
                detail=f"Vendor {vendor_id} referenced by the route was not found.",
            )
        lat = vendor.get("latitude")
        lon = vendor.get("longitude")
        if lat is None or lon is None:
            raise HTTPException(
                status_code=400, detail=f"Vendor {vendor_id} is missing coordinates."
            )
        service_minutes = _parse_minutes(
            vendor.get("service_minutes"), vendor.get("stop_time")
        )
        label = vendor.get("location_name") or vendor.get("address") or f"Stop {index}"
        points.append(
            _RoutePoint(
                identifier=vendor_id,
                label=str(label),
                latitude=float(lat),
                longitude=float(lon),
                service_minutes=service_minutes,
                stop_type="vendor",
            )
        )

    points.append(
        _RoutePoint(
            identifier=depot_vendor["id"],
            label=f"{depot_label} (Return)",
            latitude=float(depot_lat),
            longitude=float(depot_lon),
            service_minutes=0,
            stop_type="return",
        )
    )
    return points


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = _FLOAT_PATTERN.search(value.replace(",", " "))
        if not match:
            return None
        try:
            return float(match.group())
        except ValueError:  # pragma: no cover - defensive parsing
            return None
    return None


def _coerce_int(value: Any) -> Optional[int]:
    float_value = _coerce_float(value)
    if float_value is None:
        return None
    try:
        return int(round(float_value))
    except (OverflowError, ValueError):  # pragma: no cover - defensive
        return None


_TIME_PATTERN = re.compile(r"^(?P<hour>\d{1,2}):(?P<minute>\d{2})$")


def _parse_time_to_minutes(value: Any) -> Optional[int]:
    if not isinstance(value, str):
        return None
    match = _TIME_PATTERN.match(value.strip())
    if not match:
        return None
    hour = int(match.group("hour"))
    minute = int(match.group("minute"))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _build_truck_profiles(state: Dict[str, Any]) -> Dict[int, TruckProfile]:
    trucks = {
        truck.get("id"): truck
        for truck in state.get("trucks", [])
        if isinstance(truck, dict) and truck.get("id") is not None
    }
    cost_rows = {
        row.get("id"): row
        for row in state.get("truckCostRows", [])
        if isinstance(row, dict) and row.get("id") is not None
    }
    workers = {
        worker.get("id"): worker
        for worker in state.get("workers", [])
        if isinstance(worker, dict) and worker.get("id") is not None
    }
    default_fuel_price = _coerce_float(
        state.get("fuelPricePerGallon") or state.get("dieselPricePerGallon")
    )
    profiles: Dict[int, TruckProfile] = {}
    for identifier in sorted(set(trucks) | set(cost_rows)):
        truck_data = trucks.get(identifier) or {}
        cost_data = cost_rows.get(identifier) or {}
        mpg = _coerce_float(cost_data.get("mpg"))
        if mpg is None:
            mpg = _coerce_float(cost_data.get("mpgInput"))
        fuel_price = _coerce_float(cost_data.get("fuelPricePerGallon"))
        if fuel_price is None:
            fuel_price = _coerce_float(cost_data.get("dieselPricePerGallon"))
        if fuel_price is None:
            fuel_price = _coerce_float(cost_data.get("fuelPrice"))
        if fuel_price is None:
            fuel_price = default_fuel_price
        worker_rate = 0.0
        for worker_id in truck_data.get("workerIds", []) or []:
            wage_value = _coerce_float(workers.get(worker_id, {}).get("wage"))
            if wage_value is not None:
                worker_rate += wage_value
        capacity = _coerce_float(cost_data.get("capacity"))
        if capacity is None:
            capacity = _coerce_float(cost_data.get("capacityInput"))
        profiles[identifier] = TruckProfile(
            truck_id=identifier,
            mpg=mpg,
            worker_hourly_rate=worker_rate,
            fuel_price_per_gallon=fuel_price,
            capacity_units=capacity,
        )
    return profiles


def _ensure_label(value: str, fallback: str) -> str:
    stripped = (value or "").strip()
    return stripped if stripped else fallback


def _build_route_points(leg: TruckLegPlanModel) -> List[_RoutePoint]:
    start_label = _ensure_label(leg.startDepot.name, "Depot")
    start_point = _RoutePoint(
        identifier=leg.startDepot.id,
        label=start_label,
        latitude=leg.startDepot.coordinates.latitude,
        longitude=leg.startDepot.coordinates.longitude,
        service_minutes=0,
        stop_type="depot",
    )
    points: List[_RoutePoint] = [start_point]

    ordered_vendors = sorted(
        enumerate(leg.vendors),
        key=lambda item: (
            item[1].sequence if item[1].sequence is not None else float("inf"),
            item[0],
        ),
    )
    for order, (_, vendor) in enumerate(ordered_vendors, start=1):
        label = _ensure_label(vendor.locationName, f"Stop {order}")
        points.append(
            _RoutePoint(
                identifier=vendor.id,
                label=label,
                latitude=vendor.coordinates.latitude,
                longitude=vendor.coordinates.longitude,
                service_minutes=vendor.serviceMinutes,
                stop_type="vendor",
            )
        )

    if leg.endDepot is not None:
        end_label = _ensure_label(
            leg.endDepot.name,
            f"{start_label} (End)" if points else "End Depot",
        )
        points.append(
            _RoutePoint(
                identifier=leg.endDepot.id,
                label=end_label,
                latitude=leg.endDepot.coordinates.latitude,
                longitude=leg.endDepot.coordinates.longitude,
                service_minutes=0,
                stop_type="depot",
            )
        )
    elif leg.returnToStart:
        points.append(
            _RoutePoint(
                identifier=leg.startDepot.id,
                label=f"{start_label} (Return)",
                latitude=leg.startDepot.coordinates.latitude,
                longitude=leg.startDepot.coordinates.longitude,
                service_minutes=0,
                stop_type="return",
            )
        )

    if len(points) < 2:
        raise ValueError("At least two waypoints are required to build a route")
    return points


def _build_graphhopper_route_params(
    points: Sequence[_RoutePoint], profile: str
) -> Sequence[Tuple[str, Any]]:
    params: List[Tuple[str, Any]] = [
        ("profile", profile),
        ("points_encoded", "false"),
        ("instructions", "true"),
    ]
    for point in points:
        params.append(("point", f"{point.latitude},{point.longitude}"))
    return params


def _extract_route_path(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("GraphHopper response payload was not a JSON object")
    paths = payload.get("paths")
    if not isinstance(paths, list) or not paths:
        raise ValueError("GraphHopper response did not include route paths")
    path = paths[0]
    if not isinstance(path, dict):
        raise ValueError("GraphHopper path payload was malformed")
    return path


def _decode_polyline(encoded: str, *, precision: int = 5) -> List[Tuple[float, float]]:
    """Decode a polyline string into latitude/longitude tuples."""

    if not encoded:
        return []

    coordinates: List[Tuple[float, float]] = []
    factor = 10 ** precision
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        shift = 0
        result = 0
        while True:
            if index >= length:
                break
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        delta_lat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += delta_lat

        shift = 0
        result = 0
        while True:
            if index >= length:
                break
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        delta_lng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += delta_lng

        coordinates.append((lat / factor, lng / factor))

    return coordinates


def _decode_path_geometry(path: Mapping[str, Any]) -> List[CoordinatePayloadModel]:
    """Convert a GraphHopper path geometry into coordinate payload models."""

    geometry: List[CoordinatePayloadModel] = []
    points_payload = path.get("points")

    if isinstance(points_payload, Mapping):
        raw_coords = points_payload.get("coordinates")
        if isinstance(raw_coords, list):
            for entry in raw_coords:
                if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                    try:
                        longitude = float(entry[0])
                        latitude = float(entry[1])
                    except (TypeError, ValueError):
                        continue
                    geometry.append(
                        CoordinatePayloadModel(latitude=latitude, longitude=longitude)
                    )
        return geometry

    if isinstance(points_payload, str):
        multiplier = path.get("points_encoded_multiplier")
        precision = 5
        if isinstance(multiplier, (int, float)) and multiplier > 0:
            try:
                precision = max(0, int(round(math.log10(float(multiplier)))))
            except (ValueError, OverflowError):
                precision = 5
        for latitude, longitude in _decode_polyline(points_payload, precision=precision):
            geometry.append(
                CoordinatePayloadModel(latitude=latitude, longitude=longitude)
            )

    return geometry


def _segment_metrics_from_instructions(
    instructions: Sequence[Dict[str, Any]], segment_count: int
) -> Tuple[List[float], List[float]]:
    if segment_count <= 0:
        return [], []
    segment_times: List[float] = [0.0] * segment_count
    segment_distances: List[float] = [0.0] * segment_count
    current = 0
    elapsed_time = 0.0
    elapsed_distance = 0.0
    for instruction in instructions:
        time_value = float(instruction.get("time", 0.0)) / 1000.0
        distance_value = float(instruction.get("distance", 0.0))
        elapsed_time += time_value
        elapsed_distance += distance_value
        if instruction.get("sign") in {4, 5} and current < segment_count:
            segment_times[current] = elapsed_time
            segment_distances[current] = elapsed_distance
            current += 1
            elapsed_time = 0.0
            elapsed_distance = 0.0
    if current < segment_count:
        segment_times[current] = elapsed_time
        segment_distances[current] = elapsed_distance
        current += 1
    for index in range(current, segment_count):
        segment_times[index] = segment_times[index] if segment_times[index] else 0.0
        segment_distances[index] = (
            segment_distances[index] if segment_distances[index] else 0.0
        )
    return segment_times, segment_distances


def _build_stop_timings(
    points: Sequence[_RoutePoint], segment_times: Sequence[float]
) -> List[StopTimingModel]:
    stops: List[StopTimingModel] = []
    current_time_seconds = 0.0
    for index, point in enumerate(points):
        service_seconds = float(point.service_minutes or 0) * 60.0
        arrival_minutes = current_time_seconds / 60.0
        departure_minutes = (current_time_seconds + service_seconds) / 60.0
        stops.append(
            StopTimingModel(
                id=point.identifier,
                label=point.label,
                stopType=point.stop_type,
                sequence=index,
                arrivalMinutes=arrival_minutes,
                departureMinutes=departure_minutes,
                serviceMinutes=service_seconds / 60.0,
            )
        )
        if index < len(segment_times):
            current_time_seconds = (
                current_time_seconds + service_seconds + segment_times[index]
            )
    return stops


def _compute_cost_breakdown(
    profile: Optional[TruckProfile],
    distance_meters: float,
    total_seconds: float,
) -> CostBreakdownModel:
    labor_hours = total_seconds / 3600.0 if total_seconds else 0.0
    labor_cost: Optional[float] = None
    fuel_gallons: Optional[float] = None
    fuel_cost: Optional[float] = None

    if profile is not None:
        labor_cost = profile.worker_hourly_rate * labor_hours
        if profile.mpg and profile.mpg > 0:
            distance_miles = distance_meters * 0.000621371
            fuel_gallons = distance_miles / profile.mpg
            if profile.fuel_price_per_gallon is not None:
                fuel_cost = fuel_gallons * profile.fuel_price_per_gallon

    total_cost: Optional[float] = None
    cost_components = [
        component for component in (labor_cost, fuel_cost) if component is not None
    ]
    if cost_components:
        total_cost = sum(cost_components)

    return CostBreakdownModel(
        laborHours=labor_hours,
        laborCost=labor_cost,
        fuelGallons=fuel_gallons,
        fuelCost=fuel_cost,
        totalCost=total_cost,
    )


def _nearest_neighbor_visit_order(
    start_index: int,
    stops: Sequence[_VendorStop],
    distance_matrix: Sequence[Sequence[int]],
) -> List[_VendorStop]:
    remaining = list(stops)
    order: List[_VendorStop] = []
    current_node = start_index
    while remaining:
        best_stop: Optional[_VendorStop] = None
        best_distance = float("inf")
        for candidate in remaining:
            distance = distance_matrix[current_node][candidate.location_index]
            if distance < best_distance:
                best_distance = distance
                best_stop = candidate
        if best_stop is None:
            break
        order.append(best_stop)
        current_node = best_stop.location_index
        remaining.remove(best_stop)
    return order


_VEHICLE_COUNT_WORDS = {2: "two", 3: "three", 4: "four"}


def _plan_balanced_vehicle_split(
    vehicle_inputs: Sequence[_VehicleInput],
    vehicle_start_indices: Sequence[int],
    vehicle_end_indices: Sequence[int],
    vendor_stops: Sequence[_VendorStop],
    distance_matrix: Sequence[Sequence[int]],
    time_matrix: Sequence[Sequence[int]],
) -> Tuple[List[List[_RoutePoint]], SolverDiagnosticsModel]:
    fleet_size = len(vehicle_inputs)
    if fleet_size not in _VEHICLE_COUNT_WORDS:
        raise ValueError(
            "Custom multi-vehicle split requires between two and four vehicles"
        )

    ordered_stops = _nearest_neighbor_visit_order(
        vehicle_start_indices[0], vendor_stops, distance_matrix
    )

    ideal_stop_load = 0.0
    if fleet_size > 0:
        ideal_stop_load = float(len(vendor_stops)) / float(fleet_size)

    start_lat = float(vehicle_inputs[0].start_point.latitude)
    start_lon = float(vehicle_inputs[0].start_point.longitude)
    start_lat_rad = math.radians(start_lat)

    angle_map: Dict[int, float] = {}
    distance_map: Dict[int, float] = {}
    position_map: Dict[int, float] = {}
    coordinate_samples: List[Tuple[int, float, float]] = []
    for stop in vendor_stops:
        dy = float(stop.point.latitude) - start_lat
        dx = (float(stop.point.longitude) - start_lon) * math.cos(start_lat_rad)
        angle = math.atan2(dy, dx)
        if angle < 0:
            angle += 2.0 * math.pi
        angle_map[stop.location_index] = angle
        distance_map[stop.location_index] = math.hypot(dx, dy)
        coordinate_samples.append((stop.location_index, dx, dy))

    if coordinate_samples:
        count = float(len(coordinate_samples))
        mean_dx = sum(sample[1] for sample in coordinate_samples) / count
        mean_dy = sum(sample[2] for sample in coordinate_samples) / count
        cov_xx = (
            sum((sample[1] - mean_dx) ** 2 for sample in coordinate_samples) / count
        )
        cov_yy = (
            sum((sample[2] - mean_dy) ** 2 for sample in coordinate_samples) / count
        )
        cov_xy = (
            sum(
                (sample[1] - mean_dx) * (sample[2] - mean_dy)
                for sample in coordinate_samples
            )
            / count
        )
        axis_angle = 0.5 * math.atan2(2.0 * cov_xy, cov_xx - cov_yy)
        axis_cos = math.cos(axis_angle)
        axis_sin = math.sin(axis_angle)
        for location_index, dx, dy in coordinate_samples:
            position_map[location_index] = dx * axis_cos + dy * axis_sin

    def _distance_between(left: _VendorStop, right: _VendorStop) -> float:
        if left.location_index == right.location_index:
            return 0.0

        candidates: List[float] = []
        for from_idx, to_idx in (
            (left.location_index, right.location_index),
            (right.location_index, left.location_index),
        ):
            try:
                row = distance_matrix[from_idx]
                raw_value = row[to_idx]  # type: ignore[index]
            except (IndexError, TypeError):
                continue

            if isinstance(raw_value, (int, float)):
                candidate = float(raw_value)
                if candidate >= 0:
                    candidates.append(candidate)

        if candidates:
            return min(candidates)

        return float("inf")

    proximity_threshold = 400.0
    if len(vendor_stops) > 1:
        nearest_neighbor_distances: List[float] = []
        for stop in vendor_stops:
            best_distance = float("inf")
            for other in vendor_stops:
                if other is stop:
                    continue
                distance = _distance_between(stop, other)
                if distance <= 0:
                    continue
                if distance < best_distance:
                    best_distance = distance
            if best_distance < float("inf"):
                nearest_neighbor_distances.append(best_distance)

        if nearest_neighbor_distances:
            nearest_neighbor_distances.sort()
            mid = len(nearest_neighbor_distances) // 2
            if len(nearest_neighbor_distances) % 2 == 1:
                median_distance = nearest_neighbor_distances[mid]
            else:
                median_distance = (
                    nearest_neighbor_distances[mid - 1]
                    + nearest_neighbor_distances[mid]
                ) / 2.0

            base_threshold = median_distance * 0.6
            proximity_threshold = max(200.0, min(1200.0, base_threshold))

    def _compute_leg_summary(
        vehicle_idx: int, assigned: Sequence[_VendorStop]
    ) -> Tuple[int, int, int, List[_VendorStop], bool]:
        start_index = vehicle_start_indices[vehicle_idx]
        end_index = vehicle_end_indices[vehicle_idx]

        def _evaluate(sequence_stops: Sequence[_VendorStop]) -> Tuple[int, int, int]:
            sequence: List[int] = [start_index]
            sequence.extend(stop.location_index for stop in sequence_stops)
            if vehicle_inputs[vehicle_idx].end_point is not None:
                sequence.append(end_index)
            travel_minutes = 0
            for from_index, to_index in zip(sequence, sequence[1:]):
                travel_minutes += time_matrix[from_index][to_index]
            service_minutes = sum(
                stop.point.service_minutes for stop in sequence_stops
            )
            total_minutes = travel_minutes + service_minutes
            return total_minutes, travel_minutes, service_minutes

        if not assigned:
            return 0, 0, 0, [], True

        def _score_sequence(
            metrics: Tuple[int, int, int], sequence_stops: Sequence[_VendorStop]
        ) -> Tuple[Tuple[int, int, int, int], bool]:
            total_minutes, travel_minutes, service_minutes = metrics
            angles = [
                angle_map.get(stop.location_index)
                for stop in sequence_stops
                if stop.location_index in angle_map
            ]
            distances = [
                distance_map.get(stop.location_index)
                for stop in sequence_stops
                if stop.location_index in distance_map
            ]
            positions = [
                position_map.get(stop.location_index)
                for stop in sequence_stops
                if stop.location_index in position_map
            ]
            monotonic = True
            if len(angles) >= 2:
                angle_non_decreasing = all(
                    angles[idx] <= angles[idx + 1] + 1e-9
                    for idx in range(len(angles) - 1)
                )
                angle_non_increasing = all(
                    angles[idx] >= angles[idx + 1] - 1e-9
                    for idx in range(len(angles) - 1)
                )
            else:
                angle_non_decreasing = angle_non_increasing = True

            if len(distances) >= 2:
                distance_non_decreasing = all(
                    distances[idx] <= distances[idx + 1] + 1e-9
                    for idx in range(len(distances) - 1)
                )
                distance_non_increasing = all(
                    distances[idx] >= distances[idx + 1] - 1e-9
                    for idx in range(len(distances) - 1)
                )
            else:
                distance_non_decreasing = distance_non_increasing = True

            if len(positions) >= 2:
                position_non_decreasing = all(
                    positions[idx] <= positions[idx + 1] + 1e-9
                    for idx in range(len(positions) - 1)
                )
                position_non_increasing = all(
                    positions[idx] >= positions[idx + 1] - 1e-9
                    for idx in range(len(positions) - 1)
                )
            else:
                position_non_decreasing = position_non_increasing = True

            monotonic = (
                position_non_decreasing
                or position_non_increasing
                or (
                    (angle_non_decreasing or angle_non_increasing)
                    and (distance_non_decreasing or distance_non_increasing)
                )
            )
            return (int(not monotonic), total_minutes, travel_minutes, service_minutes), monotonic

        forward_sequence = list(assigned)
        forward_metrics = _evaluate(forward_sequence)
        forward_score, forward_monotonic = _score_sequence(
            forward_metrics, forward_sequence
        )

        best_sequence: List[_VendorStop] = forward_sequence
        best_metrics = forward_metrics
        best_monotonic = forward_monotonic
        best_score = forward_score

        if len(assigned) > 1:
            reversed_assigned = list(reversed(assigned))
            reverse_metrics = _evaluate(reversed_assigned)
            reverse_score, reverse_monotonic = _score_sequence(
                reverse_metrics, reversed_assigned
            )
            if reverse_score < best_score:
                best_metrics = reverse_metrics
                best_sequence = reversed_assigned
                best_monotonic = reverse_monotonic

        total_minutes, travel_minutes, service_minutes = best_metrics
        return total_minutes, travel_minutes, service_minutes, best_sequence, best_monotonic

    def _ordering_key(stop: _VendorStop) -> Tuple[str, float, float, int]:
        return (
            stop.point.label.lower(),
            round(stop.point.latitude, 6),
            round(stop.point.longitude, 6),
            stop.location_index,
        )

    candidate_orders: List[Tuple[str, List[_VendorStop]]] = []
    seen_orders: Set[Tuple[Tuple[str, float, float, int], ...]] = set()

    def _register_order(ordering: Sequence[_VendorStop], label: str) -> None:
        key = tuple(_ordering_key(stop) for stop in ordering)
        if not key or key in seen_orders:
            return
        seen_orders.add(key)
        candidate_orders.append((label, list(ordering)))

    _register_order(ordered_stops, "nearest-neighbor")
    _register_order(list(reversed(ordered_stops)), "nearest-neighbor-reversed")

    if len(ordered_stops) > 1:
        for rotation in range(1, len(ordered_stops)):
            rotated = ordered_stops[rotation:] + ordered_stops[:rotation]
            _register_order(rotated, f"nearest-neighbor-{rotation}")
            _register_order(
                list(reversed(rotated)),
                f"nearest-neighbor-{rotation}-reversed",
            )

    if vendor_stops:
        def _angle_for_stop(stop: _VendorStop) -> float:
            return angle_map.get(stop.location_index, 0.0)

        def _distance_for_stop(stop: _VendorStop) -> float:
            return distance_map.get(stop.location_index, 0.0)

        angle_sorted = sorted(
            vendor_stops,
            key=lambda stop: (_angle_for_stop(stop), _distance_for_stop(stop)),
        )

        for rotation in range(len(angle_sorted)):
            rotated = angle_sorted[rotation:] + angle_sorted[:rotation]
            _register_order(rotated, f"angle-{rotation}")
            _register_order(list(reversed(rotated)), f"angle-{rotation}-reversed")

        axis_sorted = sorted(
            vendor_stops,
            key=lambda stop: position_map.get(stop.location_index, 0.0),
        )
        for rotation in range(len(axis_sorted)):
            rotated = axis_sorted[rotation:] + axis_sorted[:rotation]
            _register_order(rotated, f"axis-{rotation}")
            _register_order(list(reversed(rotated)), f"axis-{rotation}-reversed")

    best_assignments: Optional[List[List[_VendorStop]]] = None
    best_summaries: Optional[List[Tuple[int, int, int, int]]] = None
    best_score: Optional[Tuple[float, ...]] = None
    best_order_label: Optional[str] = None

    for order_label, ordering in candidate_orders:
        clusters: List[List[_VendorStop]] = []
        if ordering:
            clusters.append([ordering[0]])
            for stop in ordering[1:]:
                current_cluster = clusters[-1]
                last_stop = current_cluster[-1]
                boundary_distance = _distance_between(last_stop, stop)
                if boundary_distance <= proximity_threshold:
                    current_cluster.append(stop)
                else:
                    clusters.append([stop])

        cluster_count = len(clusters)
        if cluster_count == 0:
            continue

        def _flatten_range(start_idx: int, end_idx: int) -> List[_VendorStop]:
            flattened: List[_VendorStop] = []
            for cluster in clusters[start_idx:end_idx]:
                flattened.extend(cluster)
            return flattened

        local_assignments: Optional[List[List[_VendorStop]]] = None
        local_summaries: Optional[List[Tuple[int, int, int, int]]] = None
        local_score: Optional[Tuple[float, ...]] = None

        def _search(
            vehicle_idx: int,
            cluster_idx: int,
            assignments: List[List[_VendorStop]],
            summaries: List[Tuple[int, int, int, int]],
        ) -> None:
            nonlocal local_assignments, local_summaries, local_score

            if vehicle_idx == fleet_size:
                if cluster_idx != cluster_count:
                    return
                if not summaries:
                    return

                totals = [summary[0] for summary in summaries]
                travel_totals = [summary[1] for summary in summaries]
                service_totals = [summary[2] for summary in summaries]
                stop_counts = [summary[3] for summary in summaries]
                monotonic_flags = [summary[4] for summary in summaries]

                boundary_distances: List[float] = []
                for idx in range(len(assignments) - 1):
                    left_assignment = assignments[idx]
                    right_assignment = assignments[idx + 1]
                    if not left_assignment or not right_assignment:
                        continue
                    boundary_distances.append(
                        _distance_between(left_assignment[-1], right_assignment[0])
                    )

                close_pair_weight = 0.0
                for assigned_route in assignments:
                    for first, second in zip(assigned_route, assigned_route[1:]):
                        distance = _distance_between(first, second)
                        if distance == float("inf"):
                            continue
                        gap = proximity_threshold - distance
                        if gap > 0:
                            close_pair_weight += gap / proximity_threshold

                max_total = max(totals)
                min_total = min(totals)
                max_stops = max(stop_counts)
                min_stops = min(stop_counts)
                max_travel = max(travel_totals)
                min_travel = min(travel_totals)

                non_monotonic = sum(1 for flag in monotonic_flags if flag == 0)

                mean_total = sum(float(total) for total in totals) / float(fleet_size)
                mean_stops = sum(float(count) for count in stop_counts) / float(fleet_size)
                mean_travel = sum(float(total) for total in travel_totals) / float(fleet_size)
                total_deviation = sum(abs(float(total) - mean_total) for total in totals)
                stop_deviation = sum(
                    abs(float(count) - mean_stops) for count in stop_counts
                )
                travel_deviation = sum(
                    abs(float(total) - mean_travel) for total in travel_totals
                )
                empty_routes = sum(1 for count in stop_counts if count == 0)
                min_stop_gap = max(0.0, ideal_stop_load - float(min_stops))

                near_boundary_penalty = 0.0
                for distance in boundary_distances:
                    if distance == float("inf"):
                        continue
                    gap = proximity_threshold - distance
                    if gap > 0:
                        near_boundary_penalty += gap

                load_relaxation_factor = 1.0 + close_pair_weight
                if load_relaxation_factor < 1.0:
                    load_relaxation_factor = 1.0

                adjusted_min_stop_gap = min_stop_gap / load_relaxation_factor
                adjusted_stop_range = float(max_stops - min_stops) / load_relaxation_factor
                adjusted_stop_deviation = stop_deviation / load_relaxation_factor

                score: Tuple[float, ...] = (
                    float(non_monotonic),
                    float(empty_routes),
                    near_boundary_penalty,
                    adjusted_min_stop_gap,
                    adjusted_stop_range,
                    adjusted_stop_deviation,
                    float(max_total - min_total),
                    float(max_total),
                    total_deviation,
                    float(max_travel - min_travel),
                    travel_deviation,
                    sum(service_totals),
                )

                if local_score is None or score < local_score:
                    local_score = score
                    local_assignments = [list(assigned) for assigned in assignments]
                    local_summaries = list(summaries)
                return

            for end_idx in range(cluster_idx, cluster_count + 1):
                assigned = _flatten_range(cluster_idx, end_idx)
                (
                    total_minutes,
                    travel_minutes,
                    service_minutes,
                    oriented,
                    is_monotonic,
                ) = _compute_leg_summary(vehicle_idx, assigned)
                summary = (
                    total_minutes,
                    travel_minutes,
                    service_minutes,
                    len(oriented),
                    1 if is_monotonic else 0,
                )
                _search(
                    vehicle_idx + 1,
                    end_idx,
                    assignments + [list(oriented)],
                    summaries + [summary],
                )

        _search(0, 0, [], [])

        if (
            local_assignments is None
            or local_summaries is None
            or local_score is None
        ):
            continue

        if best_score is None or local_score < best_score:
            best_score = local_score
            best_assignments = local_assignments
            best_summaries = local_summaries
            best_order_label = order_label

    if best_assignments is None or best_summaries is None:
        assignments = [list(ordered_stops)]
        (
            totals,
            travel_minutes,
            service_minutes,
            oriented,
            is_monotonic,
        ) = _compute_leg_summary(0, ordered_stops)
        summaries = [
            (
                totals,
                travel_minutes,
                service_minutes,
                len(oriented),
                1 if is_monotonic else 0,
            )
        ]
        for vehicle_idx in range(1, fleet_size):
            (
                totals,
                travel_minutes,
                service_minutes,
                _,
                _is_monotonic,
            ) = _compute_leg_summary(vehicle_idx, [])
            summaries.append(
                (
                    totals,
                    travel_minutes,
                    service_minutes,
                    0,
                    1 if _is_monotonic else 0,
                )
            )
    else:
        assignments = best_assignments
        summaries = best_summaries

    if best_order_label:
        logger.debug(
            "Selected %s ordering for %d-vehicle split", best_order_label, fleet_size
        )

    routes: List[List[_RoutePoint]] = []
    for vehicle_idx, assigned in enumerate(assignments):
        route_points: List[_RoutePoint] = [vehicle_inputs[vehicle_idx].start_point]
        route_points.extend(stop.point for stop in assigned)
        if vehicle_inputs[vehicle_idx].end_point is not None:
            route_points.append(vehicle_inputs[vehicle_idx].end_point)
        routes.append(route_points)

    summary_strings = [
        f"leg{idx + 1}={summary}" for idx, summary in enumerate(summaries)
    ]
    logger.info(
        "Custom %s-vehicle split produced assignments: %s",
        fleet_size,
        " ".join(summary_strings),
    )

    vehicle_word = _VEHICLE_COUNT_WORDS[fleet_size]
    diagnostics = SolverDiagnosticsModel(
        status="success",
        statusDetail=(
            "Routes were generated with a custom "
            f"{vehicle_word}-vehicle heuristic to balance stop time."
        ),
        unassignedStops=[],
        violatedConstraints=[],
    )

    return routes, diagnostics


async def _plan_routes_with_vrp(
    payload: DeliveryRouteOptimizationRequest,
    state: Dict[str, Any],
    client: GraphhopperClient,
    truck_profiles: Dict[int, TruckProfile],
) -> Tuple[List[List[_RoutePoint]], List[Optional[int]], SolverDiagnosticsModel]:

    if payload.fleetSize <= 0:
        raise HTTPException(status_code=400, detail="Fleet size must be positive")
    if len(payload.legs) < payload.fleetSize:
        raise HTTPException(
            status_code=400,
            detail="When optimizeAssignments is enabled, each vehicle must include depot details",
        )

    state_vendors = {
        vendor.get("id"): vendor
        for vendor in state.get("vendors", [])
        if isinstance(vendor, dict) and vendor.get("id") is not None
    }

    def _register_point(
        index_map: Dict[Tuple[float, float], int],
        points: List[Dict[str, float]],
        latitude: float,
        longitude: float,
    ) -> int:
        key = (round(latitude, 6), round(longitude, 6))
        if key in index_map:
            return index_map[key]
        slot = len(points)
        points.append({"lat": latitude, "lng": longitude})
        index_map[key] = slot
        return slot

    point_index: Dict[Tuple[float, float], int] = {}
    matrix_points: List[Dict[str, float]] = []

    vehicle_inputs: List[_VehicleInput] = []
    vehicle_start_indices: List[int] = []
    vehicle_end_indices: List[int] = []

    for idx in range(payload.fleetSize):
        leg = payload.legs[idx]
        start_label = _ensure_label(leg.startDepot.name, f"Depot {idx + 1}")
        start_point = _RoutePoint(
            identifier=leg.startDepot.id,
            label=start_label,
            latitude=leg.startDepot.coordinates.latitude,
            longitude=leg.startDepot.coordinates.longitude,
            service_minutes=0,
            stop_type="depot",
        )
        start_index = _register_point(
            point_index,
            matrix_points,
            start_point.latitude,
            start_point.longitude,
        )

        end_point: Optional[_RoutePoint] = None
        if leg.endDepot is not None:
            end_label = _ensure_label(leg.endDepot.name, f"{start_label} (End)")
            end_point = _RoutePoint(
                identifier=leg.endDepot.id,
                label=end_label,
                latitude=leg.endDepot.coordinates.latitude,
                longitude=leg.endDepot.coordinates.longitude,
                service_minutes=0,
                stop_type="depot",
            )
            end_index = _register_point(
                point_index,
                matrix_points,
                end_point.latitude,
                end_point.longitude,
            )
        elif leg.returnToStart:
            end_point = _RoutePoint(
                identifier=leg.startDepot.id,
                label=f"{start_label} (Return)",
                latitude=leg.startDepot.coordinates.latitude,
                longitude=leg.startDepot.coordinates.longitude,
                service_minutes=0,
                stop_type="return",
            )
            end_index = start_index
        else:
            raise HTTPException(
                status_code=400,
                detail="Each vehicle must return to a depot or provide an explicit end depot",
            )

        vehicle_inputs.append(
            _VehicleInput(
                truck_id=leg.truckId,
                start_point=start_point,
                end_point=end_point,
                return_to_start=leg.returnToStart or leg.endDepot is None,
                has_explicit_end_depot=leg.endDepot is not None,
            )
        )
        vehicle_start_indices.append(start_index)
        vehicle_end_indices.append(end_index)

    vendor_candidates: List[VendorWaypointModel] = []
    for leg in payload.legs:
        vendor_candidates.extend(leg.vendors)
    if not vendor_candidates:
        raise HTTPException(
            status_code=400, detail="At least one vendor stop is required"
        )

    vendor_lookup: Dict[Any, _VendorStop] = {}
    for candidate in vendor_candidates:
        latitude = candidate.coordinates.latitude
        longitude = candidate.coordinates.longitude
        location_index = _register_point(
            point_index, matrix_points, latitude, longitude
        )
        if candidate.id is not None and candidate.id in vendor_lookup:
            continue
        key: Any = candidate.id if candidate.id is not None else location_index
        if key in vendor_lookup:
            continue
        service_minutes = int(candidate.serviceMinutes or 0)
        state_entry = state_vendors.get(candidate.id)
        if service_minutes <= 0 and state_entry is not None:
            parsed_service = _coerce_int(state_entry.get("serviceMinutes"))
            if parsed_service is not None:
                service_minutes = parsed_service
        service_minutes = max(service_minutes, 0)
        label = _ensure_label(candidate.locationName, f"Stop {len(vendor_lookup) + 1}")
        vendor_point = _RoutePoint(
            identifier=candidate.id,
            label=label,
            latitude=latitude,
            longitude=longitude,
            service_minutes=service_minutes,
            stop_type="vendor",
        )
        if state_entry is not None:
            window_start = _parse_time_to_minutes(state_entry.get("windowStart"))
            window_end = _parse_time_to_minutes(state_entry.get("windowEnd"))
        else:
            window_start = None
            window_end = None
        if window_start is None:
            window_start = 0
        if window_end is None or window_end <= window_start:
            window_end = window_start + max(service_minutes, 15)
        demand_units: Optional[int] = None
        if state_entry is not None:
            for demand_key in (
                "demand",
                "quantity",
                "units",
                "load",
                "capacityRequired",
            ):
                demand_units = _coerce_int(state_entry.get(demand_key))
                if demand_units is not None and demand_units > 0:
                    break
        if demand_units is None:
            demand_units = service_minutes if service_minutes > 0 else 1
        vendor_lookup[key] = _VendorStop(
            point=vendor_point,
            location_index=location_index,
            demand_units=max(demand_units, 1),
            window_start=window_start,
            window_end=window_end,
        )

    vendor_stops = list(vendor_lookup.values())
    vendor_demands = [stop.demand_units for stop in vendor_stops]
    total_vendor_demand = sum(vendor_demands)
    max_vendor_demand = max(vendor_demands, default=1)

    matrix_payload = {
        "profile": payload.profile,
        "points": matrix_points,
        "out_arrays": ["distances", "times"],
    }

    matrix_callable = getattr(client, "_matrix_via_routes", None)
    if matrix_callable is None:
        matrix_callable = getattr(client, "matrix", None)
    if matrix_callable is None:
        raise HTTPException(
            status_code=502,
            detail="GraphHopper client does not provide a matrix endpoint.",
        )

    raw_matrix: Any
    try:
        raw_matrix = await matrix_callable(matrix_payload)
    except GraphhopperError as exc:  # pragma: no cover - network dependent
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    distances = raw_matrix.get("distances") if isinstance(raw_matrix, dict) else None
    times = raw_matrix.get("times") if isinstance(raw_matrix, dict) else None
    if not isinstance(distances, list) or not isinstance(times, list):
        raise HTTPException(
            status_code=502, detail="GraphHopper matrix response was malformed"
        )

    point_count = len(matrix_points)
    if point_count == 0:
        raise HTTPException(
            status_code=400, detail="Unable to build routing matrix with no locations"
        )

    def _normalise_matrix(source: List[Any], scale: float = 1.0) -> List[List[int]]:
        normalised: List[List[int]] = []
        for row in source:
            if not isinstance(row, list):
                raise HTTPException(
                    status_code=502, detail="GraphHopper matrix row was malformed"
                )
            normalised_row: List[int] = []
            for value in row:
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    numeric = 0.0
                normalised_row.append(int(round(numeric * scale)))
            normalised.append(normalised_row)
        if len(normalised) != point_count:
            raise HTTPException(
                status_code=502,
                detail="GraphHopper matrix dimensions were inconsistent",
            )
        return normalised

    distance_matrix = _normalise_matrix(distances)
    time_matrix = _normalise_matrix(times, scale=1.0 / 60_000.0)
    max_distance = max((max(row) for row in distance_matrix if row), default=0)
    overlap_penalty = max(1000, int(max_distance * 0.5)) if max_distance else 1000

    if 2 <= payload.fleetSize <= 4:
        routes, diagnostics = _plan_balanced_vehicle_split(
            vehicle_inputs,
            vehicle_start_indices,
            vehicle_end_indices,
            vendor_stops,
            distance_matrix,
            time_matrix,
        )
        leg_truck_ids = [vehicle.truck_id for vehicle in vehicle_inputs]
        return routes, leg_truck_ids, diagnostics

    service_times = [0] * point_count
    demands = [0] * point_count
    horizon_default = 24 * 60
    time_windows: List[Tuple[int, int]] = [(0, horizon_default)] * point_count

    preferred_vehicle_by_node: Dict[int, int] = {}
    if payload.fleetSize > 1 and vendor_stops:
        for stop in vendor_stops:
            index = stop.location_index
            if not (0 <= index < point_count):
                continue
            best_vehicle: Optional[int] = None
            best_distance = float("inf")
            for vehicle_idx, start_index in enumerate(vehicle_start_indices):
                if not (0 <= start_index < point_count):
                    continue
                distance_value = distance_matrix[start_index][index]
                if distance_value < best_distance:
                    best_distance = distance_value
                    best_vehicle = vehicle_idx
            if best_vehicle is not None:
                preferred_vehicle_by_node[index] = best_vehicle

    for stop in vendor_stops:
        index = stop.location_index
        if 0 <= index < point_count:
            service_times[index] = max(int(stop.point.service_minutes), 0)
            demands[index] = max(int(stop.demand_units), 1)
            window_start = max(stop.window_start, 0)
            window_end = max(stop.window_end, window_start + service_times[index])
            time_windows[index] = (window_start, window_end)

    if vendor_stops:
        max_window = max(window for _, window in time_windows)
    else:
        max_window = horizon_default
    planning_horizon = max(horizon_default, max_window + 60)

    for index in vehicle_start_indices + vehicle_end_indices:
        if 0 <= index < point_count:
            time_windows[index] = (0, planning_horizon)

    vendor_time_conflicts = [
        stop
        for stop in vendor_stops
        if (stop.window_end - stop.window_start) < stop.point.service_minutes
    ]

    vehicle_capacities: List[int] = []
    explicit_capacities: List[int] = []
    for vehicle in vehicle_inputs:
        capacity: Optional[int] = None
        if vehicle.truck_id is not None:
            profile = truck_profiles.get(vehicle.truck_id)
        else:
            profile = None
        if profile is not None and profile.capacity_units is not None:
            capacity = max(int(math.floor(profile.capacity_units)), 1)
        if capacity is not None:
            explicit_capacities.append(capacity)
        else:
            capacity = _compute_default_vehicle_capacity(
                total_vendor_demand, max_vendor_demand, payload.fleetSize
            )
        vehicle_capacities.append(capacity)

    capacity_violations = []
    if explicit_capacities:
        max_capacity = max(explicit_capacities)
        capacity_violations = [
            stop for stop in vendor_stops if stop.demand_units > max_capacity
        ]

    _ensure_ortools_available()

    manager = pywrapcp.RoutingIndexManager(
        point_count, payload.fleetSize, vehicle_start_indices, vehicle_end_indices
    )
    routing = pywrapcp.RoutingModel(manager)

    def _make_distance_callback(vehicle_idx: int):
        def distance_callback(from_index: int, to_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            cost = distance_matrix[from_node][to_node]
            preferred_vehicle = preferred_vehicle_by_node.get(to_node)
            if preferred_vehicle is not None and preferred_vehicle != vehicle_idx:
                cost += overlap_penalty
            return cost

        return distance_callback

    for vehicle_idx in range(payload.fleetSize):
        distance_callback_index = routing.RegisterTransitCallback(
            _make_distance_callback(vehicle_idx)
        )
        routing.SetArcCostEvaluatorOfVehicle(distance_callback_index, vehicle_idx)

    def time_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return service_times[from_node] + time_matrix[from_node][to_node]

    time_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.AddDimension(
        time_callback_index,
        60,
        planning_horizon,
        True,
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")
    span_cost_coefficient = getattr(
        config, "delivery_estimator_span_cost_coefficient", 0
    )
    if payload.fleetSize <= 1:
        logger.debug(
            "Skipping span cost equalization: single vehicle (fleet=%d)",
            payload.fleetSize,
        )
    elif span_cost_coefficient <= 0:
        logger.debug(
            "Skipping span cost equalization: coefficient=%d",
            span_cost_coefficient,
        )
    elif not hasattr(time_dimension, "SetGlobalSpanCostCoefficient"):
        logger.debug(
            "Skipping span cost equalization: OR-Tools span cost unavailable",
        )
    else:
        time_dimension.SetGlobalSpanCostCoefficient(span_cost_coefficient)

    for location_index, window in enumerate(time_windows):
        start, end = window
        index = manager.NodeToIndex(location_index)
        time_dimension.CumulVar(index).SetRange(start, end)

    for vehicle_idx in range(payload.fleetSize):
        routing.AddVariableMinimizedByFinalizer(
            time_dimension.CumulVar(routing.Start(vehicle_idx))
        )
        routing.AddVariableMinimizedByFinalizer(
            time_dimension.CumulVar(routing.End(vehicle_idx))
        )

    def demand_callback(from_index: int) -> int:
        node = manager.IndexToNode(from_index)
        return demands[node]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,
        vehicle_capacities,
        True,
        "Capacity",
    )

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.time_limit.FromSeconds(60)
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.log_search = False

    logger.info("VRP Inputs:")
    logger.info(f"distance_matrix: {distance_matrix}")
    logger.info(f"time_matrix: {time_matrix}")
    logger.info(f"demands: {demands}")
    logger.info(f"time_windows: {time_windows}")
    logger.info(f"vehicle_capacities: {vehicle_capacities}")

    solution = routing.SolveWithParameters(search_parameters)
    status_code = routing.status()
    status_lookup = {
        getattr(pywrapcp.RoutingModel, "ROUTING_NOT_SOLVED", 0): "not_solved",
        getattr(pywrapcp.RoutingModel, "ROUTING_SUCCESS", 1): "success",
        getattr(pywrapcp.RoutingModel, "ROUTING_FAIL", 2): "no_solution",
        getattr(pywrapcp.RoutingModel, "ROUTING_FAIL_TIMEOUT", 3): "timeout",
        getattr(pywrapcp.RoutingModel, "ROUTING_INVALID", 4): "error",
    }
    status = status_lookup.get(status_code, "error")
    logger.warning(
        "VRP solve finished: status=%s (%s) solution=%s vendors=%d vehicles=%d",
        status,
        status_code,
        "yes" if solution is not None else "no",
        len(vendor_stops),
        len(vehicle_inputs),
    )

    def _nearest_neighbor_route(
        vehicle: _VehicleInput,
        start_index: int,
        candidates: List[_VendorStop],
    ) -> List[_RoutePoint]:
        route_points: List[_RoutePoint] = [vehicle.start_point]
        ordered_candidates = _nearest_neighbor_visit_order(
            start_index, candidates, distance_matrix
        )
        route_points.extend(stop.point for stop in ordered_candidates)
        if vehicle.end_point is not None:
            route_points.append(vehicle.end_point)
        return route_points

    routes: List[List[_RoutePoint]] = []
    fallback_used = solution is None
    if solution is None:
        logger.warning(
            "VRP solver returned no solution; falling back to greedy nearest-neighbor routing."
        )
        remaining_stops = vendor_stops.copy()
        unassigned = []
        for vehicle_idx, vehicle in enumerate(vehicle_inputs):
            vehicles_remaining = len(vehicle_inputs) - vehicle_idx
            if not remaining_stops:
                route_points = [vehicle.start_point]
                if vehicle.end_point is not None:
                    route_points.append(vehicle.end_point)
                routes.append(route_points)
                continue
            chunk_size = max(1, math.ceil(len(remaining_stops) / max(vehicles_remaining, 1)))
            assigned_chunk = remaining_stops[:chunk_size]
            route_points = _nearest_neighbor_route(
                vehicle,
                vehicle_start_indices[vehicle_idx],
                assigned_chunk,
            )
            routes.append(route_points)
            remaining_stops = remaining_stops[chunk_size:]
        unassigned = remaining_stops
    else:
        vendor_map_by_index = {stop.location_index: stop for stop in vendor_stops}
        unassigned: List[_VendorStop] = []
        for stop in vendor_stops:
            index = manager.NodeToIndex(stop.location_index)
            if solution.Value(routing.NextVar(index)) == index:
                unassigned.append(stop)

        for vehicle_idx, vehicle in enumerate(vehicle_inputs):
            route_points: List[_RoutePoint] = [vehicle.start_point]
            index = routing.Start(vehicle_idx)
            next_index = solution.Value(routing.NextVar(index))
            while not routing.IsEnd(next_index):
                node = manager.IndexToNode(next_index)
                vendor_stop = vendor_map_by_index.get(node)
                if vendor_stop is not None:
                    route_points.append(vendor_stop.point)
                next_index = solution.Value(routing.NextVar(next_index))
            if vehicle.end_point is not None:
                route_points.append(vehicle.end_point)
            routes.append(route_points)

    leg_truck_ids = [vehicle.truck_id for vehicle in vehicle_inputs]

    violated_constraints: List[str] = []
    if capacity_violations:
        violated_constraints.append("capacity")
    if vendor_time_conflicts:
        violated_constraints.append("time_window")
    violated_constraints = sorted(set(violated_constraints))

    logger.warning("Unassigned stops: %s", [stop.point.label for stop in unassigned])
    logger.warning("Violated constraints: %s", violated_constraints)

    status_detail_lookup = {
        "no_solution": "Vehicle routing solver could not find a feasible assignment for all stops.",
        "timeout": "Vehicle routing solver timed out before completing the search.",
        "not_solved": "Vehicle routing solver did not start.",
        "error": "Vehicle routing solver returned an invalid result.",
    }
    status_detail = status_detail_lookup.get(status)
    if fallback_used:
        fallback_note = " Routes were generated with a greedy fallback heuristic."
        if status_detail:
            status_detail = f"{status_detail}{fallback_note}"
        else:
            status_detail = fallback_note.strip()
    if status_detail is None and unassigned:
        status_detail = "Some stops could not be assigned to any vehicle."

    diagnostics = SolverDiagnosticsModel(
        status=status,
        statusDetail=status_detail,
        unassignedStops=[
            LegSequenceEntryModel(
                id=stop.point.identifier,
                label=stop.point.label,
                stopType="vendor",
            )
            for stop in unassigned
        ],
        violatedConstraints=violated_constraints,
    )

    return routes, leg_truck_ids, diagnostics


async def _compute_leg_response(
    client: GraphhopperClient,
    points: Sequence[_RoutePoint],
    profile: str,
    truck_profiles: Dict[int, TruckProfile],
    available_truck_ids: Sequence[int],
    index: int,
    requested_truck_id: Optional[int],
) -> TruckLegResponseModel:
    if not points:
        raise HTTPException(
            status_code=400, detail="Route must include at least one stop"
        )

    truck_id = requested_truck_id
    if truck_id is None and available_truck_ids:
        truck_id = available_truck_ids[index % len(available_truck_ids)]
    profile_info = truck_profiles.get(truck_id) if truck_id is not None else None

    if len(points) < 2:
        service_seconds = sum(
            point.service_minutes * 60
            for point in points
            if point.stop_type == "vendor"
        )
        sequence_entries = [
            LegSequenceEntryModel(
                id=point.identifier, label=point.label, stopType=point.stop_type
            )
            for point in points
        ]
        stops = _build_stop_timings(points, [0.0] * max(len(points) - 1, 0))
        costs = _compute_cost_breakdown(profile_info, 0.0, service_seconds)
        geometry = [
            CoordinatePayloadModel(latitude=point.latitude, longitude=point.longitude)
            for point in points
        ]
        return TruckLegResponseModel(
            truckId=truck_id,
            sequence=sequence_entries,
            distanceMeters=0.0,
            travelSeconds=0.0,
            serviceSeconds=service_seconds,
            totalSeconds=service_seconds,
            geometry=geometry,
            instructions=[],
            stops=stops,
            costs=costs,
        )

    params = _build_graphhopper_route_params(points, profile)
    try:
        raw_response = await client.route(params)
    except GraphhopperError as exc:  # pragma: no cover - network dependent
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        path = _extract_route_path(raw_response)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    geometry = _decode_path_geometry(path)

    instructions_payload = path.get("instructions")
    instructions_list = (
        instructions_payload if isinstance(instructions_payload, list) else []
    )
    segment_count = len(points) - 1
    segment_times, _ = _segment_metrics_from_instructions(
        instructions_list, segment_count
    )

    travel_seconds = float(path.get("time", 0)) / 1000.0
    if segment_count > 0:
        computed_travel = sum(segment_times)
        if travel_seconds > 0 and computed_travel <= 0:
            even_time = travel_seconds / segment_count
            segment_times = [even_time] * segment_count
    distance_meters = float(path.get("distance", 0))
    service_seconds = sum(
        point.service_minutes * 60 for point in points if point.stop_type == "vendor"
    )
    total_seconds = travel_seconds + service_seconds

    stops = _build_stop_timings(points, segment_times)
    instructions = [
        TurnInstructionModel(
            text=str(instruction.get("text", "")),
            distanceMeters=float(instruction.get("distance", 0.0)),
            timeSeconds=float(instruction.get("time", 0.0)) / 1000.0,
            sign=instruction.get("sign"),
        )
        for instruction in instructions_list
    ]

    costs = _compute_cost_breakdown(profile_info, distance_meters, total_seconds)

    sequence_entries = [
        LegSequenceEntryModel(
            id=point.identifier, label=point.label, stopType=point.stop_type
        )
        for point in points
    ]

    if not geometry:
        geometry = [
            CoordinatePayloadModel(latitude=point.latitude, longitude=point.longitude)
            for point in points
        ]

    return TruckLegResponseModel(
        truckId=truck_id,
        sequence=sequence_entries,
        distanceMeters=distance_meters,
        travelSeconds=travel_seconds,
        serviceSeconds=service_seconds,
        totalSeconds=total_seconds,
        geometry=geometry,
        instructions=instructions,
        stops=stops,
        costs=costs,
    )


def _read_state_file() -> Dict[str, Any]:
    file_state: Optional[Dict[str, Any]] = None
    if _STATE_FILE.exists():
        try:
            raw = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=500, detail="Saved state is corrupted") from exc
        try:
            validated = _model_validate(DeliveryEstimatorStateModel, raw)
        except ValidationError as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=500, detail="Saved state is invalid") from exc
        file_state = _model_dump(validated)

    persisted = _load_persisted_entities()

    if file_state is None:
        if not any(persisted.values()):
            raise HTTPException(status_code=404, detail="No delivery estimator state found")
        state = _model_dump(DeliveryEstimatorStateModel())
    else:
        state = dict(file_state)

    file_workers = file_state.get("workers", []) if file_state else []
    file_truck_cost_rows = file_state.get("truckCostRows", []) if file_state else []
    file_vendors = file_state.get("vendors", []) if file_state else []

    state["workers"] = persisted["workers"] or file_workers
    state["truckCostRows"] = persisted["truckCostRows"] or file_truck_cost_rows
    state["vendors"] = persisted["vendors"] or file_vendors
    state["routes"] = persisted.get("routes", []) or state.get("routes", [])

    return state


def _write_state_file(payload: Dict[str, Any]) -> None:
    _persist_delivery_entities(payload)
    sanitized = dict(payload)
    sanitized["workers"] = []
    sanitized["truckCostRows"] = []
    sanitized["vendors"] = []
    sanitized["routes"] = []
    tmp_path = _STATE_FILE.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(sanitized, separators=(",", ":")), encoding="utf-8")
    tmp_path.replace(_STATE_FILE)


def _ensure_ortools_available() -> None:
    if not ORTOOLS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Delivery estimator optimization requires the 'ortools' package; install it to enable this feature.",
        )


@router.get("/state")
async def get_delivery_estimator_state() -> Dict[str, Any]:
    """Return the persisted delivery estimator state, if present."""

    try:
        return _read_state_file()
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        return _model_dump(DeliveryEstimatorStateModel())


@router.put("/state", status_code=204)
async def put_delivery_estimator_state(
    payload: DeliveryEstimatorStateModel,
) -> Response:
    """Persist the delivery estimator state."""

    _write_state_file(_model_dump(payload))
    return Response(status_code=204)


@router.post("/run/multi", response_model=MultiRouteRunResponseModel)
async def run_multi_route_evaluation(
    payload: MultiRouteRunRequestModel,
) -> MultiRouteRunResponseModel:
    """Evaluate a saved route across multiple truck legs."""

    if payload.routeId <= 0:
        raise HTTPException(status_code=400, detail="Select a valid route before running a calculation.")
    if not payload.legs:
        raise HTTPException(status_code=400, detail="Provide at least one leg to evaluate.")

    try:
        state = _read_state_file()
    except HTTPException as exc:
        if exc.status_code == 404:
            state = _model_dump(DeliveryEstimatorStateModel())
        else:
            raise
    truck_profiles = _build_truck_profiles(state)
    available_truck_ids = sorted(truck_profiles.keys())

    unique_truck_ids = {leg.truckId for leg in payload.legs}
    if not available_truck_ids and unique_truck_ids:
        available_truck_ids = sorted(unique_truck_ids)

    unique_worker_ids: Set[int] = {
        worker_id for leg in payload.legs for worker_id in leg.workerIds
    }

    client = GraphhopperClient.from_settings()
    dsn = pg_dsn_from_env(config)

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            base_route_stop_ids = _fetch_route_stop_ids(cur, payload.routeId)
            depot_vendor = _get_depot_vendor(cur)

            route_stop_set = set(base_route_stop_ids)
            leg_stop_lists: List[List[int]] = []
            union_stop_ids: Set[int] = set()

            for leg in payload.legs:
                stops = list(leg.stopIds) if leg.stopIds else list(base_route_stop_ids)
                if not stops:
                    raise HTTPException(
                        status_code=400,
                        detail="Each leg must include at least one stop to evaluate.",
                    )
                if route_stop_set:
                    invalid = [stop_id for stop_id in stops if stop_id not in route_stop_set]
                    if invalid:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Stops {invalid} are not part of the selected route.",
                        )
                leg_stop_lists.append(stops)
                union_stop_ids.update(stops)

            if not union_stop_ids:
                union_stop_ids.update(route_stop_set)

            vendor_ids = set(union_stop_ids)
            vendor_ids.add(depot_vendor["id"])
            vendor_records = _fetch_vendor_records(cur, vendor_ids)

            truck_cost_cache: Dict[int, Tuple[float, float, float]] = {}
            for truck_id in unique_truck_ids:
                truck_cost_cache[truck_id] = _fetch_truck_cost_per_mile(cur, truck_id)

            worker_wages_map = _fetch_worker_wages(cur, list(unique_worker_ids))

    leg_results: List[MultiRouteRunLegResultModel] = []
    total_distance_miles = 0.0
    total_travel_seconds = 0.0
    total_service_seconds = 0.0
    total_seconds = 0.0
    total_cost = 0.0
    total_labor_cost = 0.0
    total_fuel_cost = 0.0
    total_maintenance_cost = 0.0
    total_vehicle_cost = 0.0
    total_stop_count = 0

    for index, (leg, stop_ids) in enumerate(zip(payload.legs, leg_stop_lists)):
        points = _build_route_points_for_leg(depot_vendor, vendor_records, stop_ids)
        route_model = await _compute_leg_response(
            client,
            points,
            payload.profile,
            truck_profiles,
            available_truck_ids,
            index,
            leg.truckId,
        )

        distance_miles = route_model.distanceMeters * 0.000621371 if route_model.distanceMeters else 0.0
        travel_seconds = route_model.travelSeconds
        service_seconds = route_model.serviceSeconds
        leg_total_seconds = route_model.totalSeconds

        worker_rate = sum(worker_wages_map.get(worker_id, 0.0) for worker_id in leg.workerIds)
        labor_cost = 0.0
        if worker_rate > 0 and leg_total_seconds > 0:
            labor_cost = worker_rate * (leg_total_seconds / 3600.0)

        fuel_per_mile = 0.0
        maintenance_per_mile = 0.0
        total_per_mile = 0.0
        truck_costs = truck_cost_cache.get(leg.truckId)
        if truck_costs is not None:
            fuel_per_mile, maintenance_per_mile, total_per_mile = truck_costs

        fuel_cost = fuel_per_mile * distance_miles if distance_miles > 0 else 0.0
        maintenance_cost = maintenance_per_mile * distance_miles if distance_miles > 0 else 0.0
        if (fuel_cost <= 0.0 and maintenance_cost <= 0.0) and total_per_mile > 0.0:
            vehicle_cost = total_per_mile * distance_miles
            maintenance_cost = vehicle_cost
            fuel_cost = 0.0
        else:
            vehicle_cost = fuel_cost + maintenance_cost
        total_leg_cost = labor_cost + vehicle_cost

        stop_count = len(stop_ids)
        cost_per_stop = total_leg_cost / stop_count if stop_count > 0 else None
        cost_per_mile = total_leg_cost / distance_miles if distance_miles > 0 else None

        summary = RouteRunResponse(
            routeId=payload.routeId,
            truckId=leg.truckId,
            distanceMiles=distance_miles,
            travelSeconds=travel_seconds,
            serviceSeconds=service_seconds,
            totalSeconds=leg_total_seconds,
            totalCost=total_leg_cost,
            laborCost=labor_cost,
            fuelCost=fuel_cost,
            maintenanceCost=maintenance_cost,
            vehicleCost=vehicle_cost,
            costPerStop=cost_per_stop,
            costPerMile=cost_per_mile,
            stopCount=stop_count,
        )

        leg_results.append(
            MultiRouteRunLegResultModel(
                workerIds=list(leg.workerIds),
                stopIds=list(stop_ids),
                summary=summary,
                route=route_model,
            )
        )

        total_distance_miles += distance_miles
        total_travel_seconds += travel_seconds
        total_service_seconds += service_seconds
        total_seconds += leg_total_seconds
        total_cost += total_leg_cost
        total_labor_cost += labor_cost
        total_fuel_cost += fuel_cost
        total_maintenance_cost += maintenance_cost
        total_vehicle_cost += vehicle_cost
        total_stop_count += stop_count

    cost_per_stop_total = total_cost / total_stop_count if total_stop_count > 0 else None
    cost_per_mile_total = total_cost / total_distance_miles if total_distance_miles > 0 else None

    return MultiRouteRunResponseModel(
        routeId=payload.routeId,
        profile=payload.profile,
        legs=leg_results,
        totalDistanceMiles=total_distance_miles,
        totalTravelSeconds=total_travel_seconds,
        totalServiceSeconds=total_service_seconds,
        totalSeconds=total_seconds,
        totalCost=total_cost,
        laborCost=total_labor_cost,
        fuelCost=total_fuel_cost,
        maintenanceCost=total_maintenance_cost,
        vehicleCost=total_vehicle_cost,
        costPerStop=cost_per_stop_total,
        costPerMile=cost_per_mile_total,
        stopCount=total_stop_count,
    )


@router.get("/run/latest", response_model=Optional[MultiRouteRunResponseModel])
async def get_latest_multi_route(routeId: Optional[int] = None) -> Optional[MultiRouteRunResponseModel]:
    try:
        state = _read_state_file()
    except HTTPException as exc:
        if exc.status_code == 404:
            return None
        raise

    stored = state.get("multiRunResult")
    if stored is None:
        return None

    result = _model_validate(MultiRouteRunResponseModel, stored)
    if routeId is not None and result.routeId != routeId:
        return None

    return result


@router.post("/run", response_model=RouteRunResponse)
async def run_route_evaluation(payload: RouteRunRequest) -> RouteRunResponse:
    """Evaluate a saved route using the selected truck and workers."""

    if payload.routeId <= 0:
        raise HTTPException(status_code=400, detail="Select a valid route before running a calculation.")

    dsn = pg_dsn_from_env(config)
    requested_stop_ids = [int(vendor_id) for vendor_id in payload.stopIds]
    route_stop_ids: List[int] = []
    depot_vendor: Dict[str, Any]
    vendor_records: Dict[int, Dict[str, Any]]
    worker_wages: Dict[int, float]

    fuel_per_mile = 0.0
    maintenance_per_mile = 0.0
    total_per_mile = 0.0

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            db_route_stop_ids = _fetch_route_stop_ids(cur, payload.routeId)
            if not db_route_stop_ids and not requested_stop_ids:
                raise HTTPException(status_code=400, detail="Selected route has no stops to evaluate.")

            depot_vendor = _get_depot_vendor(cur)
            if requested_stop_ids:
                route_stop_ids = requested_stop_ids
            else:
                route_stop_ids = db_route_stop_ids

            route_stop_ids = [vendor_id for vendor_id in route_stop_ids if vendor_id != depot_vendor["id"]]
            if not route_stop_ids:
                raise HTTPException(status_code=400, detail="Selected route has no stops to evaluate.")
            vendor_ids = list({*route_stop_ids, depot_vendor["id"]})
            vendor_records = _fetch_vendor_records(cur, vendor_ids)
            fuel_per_mile, maintenance_per_mile, total_per_mile = _fetch_truck_cost_per_mile(cur, payload.truckId)
            worker_wages = _fetch_worker_wages(cur, payload.workerIds)

    points: List[_RoutePoint] = []

    depot_lat = depot_vendor.get("latitude")
    depot_lon = depot_vendor.get("longitude")
    if depot_lat is None or depot_lon is None:
        raise HTTPException(status_code=400, detail="Depot location is missing coordinates.")

    depot_label = depot_vendor.get("location_name") or depot_vendor.get("address") or "Depot"
    points.append(
        _RoutePoint(
            identifier=depot_vendor["id"],
            label=str(depot_label),
            latitude=float(depot_lat),
            longitude=float(depot_lon),
            service_minutes=0,
            stop_type="depot",
        )
    )

    service_minutes_total = _parse_minutes(depot_vendor.get("service_minutes"), depot_vendor.get("stop_time"))
    for index, vendor_id in enumerate(route_stop_ids, start=1):
        vendor = vendor_records.get(vendor_id)
        if vendor is None:
            raise HTTPException(status_code=400, detail=f"Vendor {vendor_id} referenced by the route was not found.")
        lat = vendor.get("latitude")
        lon = vendor.get("longitude")
        if lat is None or lon is None:
            raise HTTPException(status_code=400, detail=f"Vendor {vendor_id} is missing coordinates.")

        service_minutes = _parse_minutes(vendor.get("service_minutes"), vendor.get("stop_time"))
        service_minutes_total += service_minutes

        label = vendor.get("location_name") or vendor.get("address") or f"Stop {index}"
        points.append(
            _RoutePoint(
                identifier=vendor_id,
                label=str(label),
                latitude=float(lat),
                longitude=float(lon),
                service_minutes=service_minutes,
                stop_type="vendor",
            )
        )

    points.append(
        _RoutePoint(
            identifier=depot_vendor["id"],
            label=f"{depot_label} (Return)",
            latitude=float(depot_lat),
            longitude=float(depot_lon),
            service_minutes=0,
            stop_type="return",
        )
    )

    client = GraphhopperClient.from_settings()
    params = _build_graphhopper_route_params(points, payload.profile)
    try:
        raw_response = await client.route(params)
    except GraphhopperError as exc:  # pragma: no cover - network dependent
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    path = _extract_route_path(raw_response)
    distance_meters = float(path.get("distance", 0.0))
    travel_seconds = float(path.get("time", 0.0)) / 1000.0
    service_seconds = float(service_minutes_total) * 60.0
    total_seconds = travel_seconds + service_seconds
    distance_miles = distance_meters / 1609.344 if distance_meters > 0 else 0.0

    total_worker_rate = sum(worker_wages.get(worker_id, 0.0) for worker_id in payload.workerIds)
    labor_cost = 0.0
    if total_worker_rate > 0 and total_seconds > 0:
        labor_cost = total_worker_rate * (total_seconds / 3600.0)

    fuel_cost = fuel_per_mile * distance_miles if distance_miles > 0 else 0.0
    maintenance_cost = maintenance_per_mile * distance_miles if distance_miles > 0 else 0.0
    if (fuel_cost <= 0.0 and maintenance_cost <= 0.0) and total_per_mile > 0.0:
        vehicle_cost = total_per_mile * distance_miles
        maintenance_cost = vehicle_cost
        fuel_cost = 0.0
    else:
        vehicle_cost = fuel_cost + maintenance_cost
    total_cost = labor_cost + vehicle_cost

    stop_count = len(route_stop_ids)
    cost_per_stop = total_cost / stop_count if stop_count > 0 else None
    cost_per_mile = total_cost / distance_miles if distance_miles > 0 else None

    return RouteRunResponse(
        routeId=payload.routeId,
        truckId=payload.truckId,
        distanceMiles=distance_miles,
        travelSeconds=travel_seconds,
        serviceSeconds=service_seconds,
        totalSeconds=total_seconds,
        totalCost=total_cost,
        laborCost=labor_cost,
        fuelCost=fuel_cost,
        maintenanceCost=maintenance_cost,
        vehicleCost=vehicle_cost,
        costPerStop=cost_per_stop,
        costPerMile=cost_per_mile,
        stopCount=stop_count,
    )


@router.get("/routes", response_model=List[RouteMapModel])
async def list_delivery_routes() -> List[RouteMapModel]:
    """Return the available delivery routes with map-friendly stop coordinates."""

    dsn = pg_dsn_from_env(config)
    try:
        with psycopg.connect(dsn) as conn:
            raw_routes = _fetch_routes_from_db(conn)
            if not raw_routes:
                return []

            with conn.cursor() as cur:
                depot_vendor = _get_depot_vendor(cur)

            depot_id = int(depot_vendor["id"])

            vendor_ids: Set[int] = set()
            prepared_routes: List[Tuple[int, str, List[int]]] = []
            for raw_route in raw_routes:
                route_id = int(raw_route.get("id", 0))
                if route_id <= 0:
                    continue
                name = str(raw_route.get("name") or f"Route {route_id}")

                stop_ids: List[int] = [
                    int(vendor_id)
                    for vendor_id in raw_route.get("stopIds", [])
                    if vendor_id is not None
                ]
                stop_ids = [vendor_id for vendor_id in stop_ids if vendor_id != depot_id]
                if not stop_ids:
                    continue

                vendor_ids.update(stop_ids)
                prepared_routes.append((route_id, name, stop_ids))

            if not prepared_routes:
                return []

            with conn.cursor() as cur:
                vendor_records = _fetch_vendor_records(cur, list(vendor_ids | {depot_id}))

            depot_record = {**vendor_records.get(depot_id, {}), **depot_vendor}
            vendor_records[depot_id] = depot_record

            depot_lat = depot_record.get("latitude")
            depot_lon = depot_record.get("longitude")
            if depot_lat is None or depot_lon is None:
                raise HTTPException(status_code=500, detail="Depot record is missing coordinates.")

            depot_entry = RouteMapStopModel(
                id=depot_id,
                label=str(
                    depot_record.get("location_name")
                    or depot_record.get("address")
                    or DEFAULT_DEPOT["locationName"]
                ),
                latitude=float(depot_lat),
                longitude=float(depot_lon),
                isDepot=True,
                sequence=0,
            )

            routes: List[RouteMapModel] = []
            for route_id, name, stop_ids in prepared_routes:
                sequence = 0
                stops: List[RouteMapStopModel] = [
                    RouteMapStopModel(**depot_entry.model_dump())
                ]
                sequence += 1

                for vendor_id in stop_ids:
                    record = vendor_records.get(vendor_id)
                    if record is None:
                        continue
                    latitude = record.get("latitude")
                    longitude = record.get("longitude")
                    if latitude is None or longitude is None:
                        continue
                    label = (
                        record.get("location_name")
                        or record.get("address")
                        or f"Stop {sequence}"
                    )
                    stops.append(
                        RouteMapStopModel(
                            id=vendor_id,
                            label=str(label),
                            latitude=float(latitude),
                            longitude=float(longitude),
                            isDepot=False,
                            sequence=sequence,
                        )
                    )
                    sequence += 1

                if sequence > 1:
                    stops.append(
                        RouteMapStopModel(
                            id=depot_entry.id,
                            label=f"{depot_entry.label} (Return)",
                            latitude=depot_entry.latitude,
                            longitude=depot_entry.longitude,
                            isDepot=True,
                            sequence=sequence,
                        )
                    )

                if len(stops) < 2:
                    continue

                routes.append(RouteMapModel(id=route_id, name=name, stops=stops))
            return routes
    except psycopg_errors.UndefinedTable:
        return []
    except psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}") from exc
    except psycopg.Error as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load delivery routes: {exc}") from exc


@router.post("/routes/{route_id}/optimize", response_model=RoutePlanModel)
async def optimize_route_order(route_id: int) -> RoutePlanModel:
    """Optimize the stop order for a saved route (keeping the depot fixed)."""

    if route_id <= 0:
        raise HTTPException(status_code=400, detail="Select a valid route to optimize.")

    dsn = pg_dsn_from_env(config)
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT name FROM {_DB_SCHEMA}.{_ROUTES_TABLE} WHERE id = %s",
                (route_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Route not found")
            route_name = row[0] or ""

            stop_ids = _fetch_route_stop_ids(cur, route_id)
            depot_vendor = _get_depot_vendor(cur)

            stop_ids = [vendor_id for vendor_id in stop_ids if vendor_id != depot_vendor["id"]]
            if not stop_ids:
                raise HTTPException(status_code=400, detail="Route must include at least one stop to optimize.")

            vendor_records = _fetch_vendor_records(cur, stop_ids)

    logger.warning("Route %s current order: %s", route_id, stop_ids)

    depot_lat = depot_vendor.get("latitude")
    depot_lon = depot_vendor.get("longitude")
    if depot_lat is None or depot_lon is None:
        raise HTTPException(status_code=400, detail="Depot is missing coordinates.")

    state = _read_state_file()
    existing_vendor_ids = {
        vendor.get("id")
        for vendor in state.get("vendors", [])
        if isinstance(vendor, dict) and vendor.get("id") is not None
    }
    for vendor_id, record in vendor_records.items():
        if vendor_id in existing_vendor_ids:
            continue
        state.setdefault("vendors", []).append(
            {
                "id": vendor_id,
                "locationName": record.get("location_name") or record.get("address") or f"Vendor {vendor_id}",
                "address": record.get("address", ""),
                "windowStart": record.get("window_start") or "08:00",
                "windowEnd": record.get("window_end") or "17:00",
                "stopTime": record.get("stop_time") or "0",
                "serviceMinutes": record.get("service_minutes"),
                "latitude": record.get("latitude"),
                "longitude": record.get("longitude"),
            }
        )

    truck_profiles = _build_truck_profiles(state)
    if not truck_profiles:
        truck_profiles = {0: TruckProfile(truck_id=None, mpg=None, worker_hourly_rate=0.0, fuel_price_per_gallon=None, capacity_units=None)}

    vendor_waypoints: List[VendorWaypointModel] = []
    for index, vendor_id in enumerate(stop_ids, start=1):
        record = vendor_records.get(vendor_id)
        if record is None:
            raise HTTPException(status_code=400, detail=f"Vendor {vendor_id} referenced by the route was not found.")
        lat = record.get("latitude")
        lon = record.get("longitude")
        if lat is None or lon is None:
            raise HTTPException(status_code=400, detail=f"Vendor {vendor_id} is missing coordinates.")
        vendor_waypoints.append(
            VendorWaypointModel(
                id=vendor_id,
                locationName=record.get("location_name") or record.get("address") or f"Stop {index}",
                coordinates=CoordinatePayloadModel(latitude=float(lat), longitude=float(lon)),
                serviceMinutes=_parse_minutes(record.get("service_minutes"), record.get("stop_time")),
                sequence=None,
            )
        )

    depot_name = depot_vendor.get("location_name") or depot_vendor.get("address") or "Depot"
    start_depot = DepotPayloadModel(
        id=depot_vendor["id"],
        name=str(depot_name),
        coordinates=CoordinatePayloadModel(latitude=float(depot_lat), longitude=float(depot_lon)),
    )

    leg = TruckLegPlanModel(
        truckId=None,
        startDepot=start_depot,
        vendors=vendor_waypoints,
        endDepot=None,
        returnToStart=True,
    )

    optimize_payload = DeliveryRouteOptimizationRequest(
        fleetSize=1,
        legs=[leg],
        profile="car",
        optimizeAssignments=False,
    )

    client = GraphhopperClient.from_settings()
    planned_routes, _, _ = await _plan_routes_with_vrp(
        optimize_payload,
        state,
        client,
        truck_profiles,
    )

    if not planned_routes:
        raise HTTPException(status_code=502, detail="Route optimization did not return any stop order.")

    optimized_route = planned_routes[0]
    optimized_order: List[int] = []
    for point in optimized_route:
        if point.stop_type == "vendor" and point.identifier is not None:
            optimized_order.append(int(point.identifier))

    if not optimized_order:
        raise HTTPException(status_code=502, detail="Route optimization failed to produce vendor order.")

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            _update_route_stop_order(cur, route_id, optimized_order)

    logger.warning("Route %s optimized order: %s", route_id, optimized_order)

    return RoutePlanModel(id=route_id, name=route_name, stopIds=optimized_order)


@router.post("/optimize", response_model=DeliveryRouteOptimizationResponseModel)
async def optimize_delivery_routes(
    payload: DeliveryRouteOptimizationRequest,
) -> DeliveryRouteOptimizationResponseModel:
    """Optimize one or more delivery legs and compute operating costs."""

    if not payload.legs:
        raise HTTPException(
            status_code=400, detail="At least one truck leg is required"
        )
    if payload.fleetSize < len(payload.legs):
        raise HTTPException(
            status_code=400,
            detail="Fleet size must be greater than or equal to the number of legs",
        )

    state = _read_state_file()
    truck_profiles = _build_truck_profiles(state)
    available_truck_ids: List[int] = list(truck_profiles.keys())
    if not available_truck_ids:
        available_truck_ids = [
            truck.get("id")
            for truck in state.get("trucks", [])
            if isinstance(truck, dict) and truck.get("id") is not None
        ]

    client = GraphhopperClient.from_settings()

    legs: List[TruckLegResponseModel] = []
    total_distance = 0.0
    total_travel_seconds = 0.0
    total_service_seconds = 0.0
    aggregated_costs: List[float] = []
    diagnostics = SolverDiagnosticsModel(
        status="success",
        statusDetail=None,
        unassignedStops=[],
        violatedConstraints=[],
    )

    planned_routes: List[List[_RoutePoint]] = []
    route_truck_ids: List[Optional[int]] = []

    if payload.optimizeAssignments:
        planned_routes, route_truck_ids, diagnostics = await _plan_routes_with_vrp(
            payload, state, client, truck_profiles
        )
        if len(payload.legs) > len(planned_routes):
            for leg in payload.legs[len(planned_routes) :]:
                try:
                    points = _build_route_points(leg)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
                planned_routes.append(points)
                route_truck_ids.append(leg.truckId)
    else:
        for leg in payload.legs:
            try:
                points = _build_route_points(leg)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            planned_routes.append(points)
            route_truck_ids.append(leg.truckId)

    for index, points in enumerate(planned_routes):
        requested_truck_id = (
            route_truck_ids[index] if index < len(route_truck_ids) else None
        )
        leg_response = await _compute_leg_response(
            client,
            points,
            payload.profile,
            truck_profiles,
            available_truck_ids,
            index,
            requested_truck_id,
        )
        legs.append(leg_response)

        total_distance += leg_response.distanceMeters
        total_travel_seconds += leg_response.travelSeconds
        total_service_seconds += leg_response.serviceSeconds
        if leg_response.costs.totalCost is not None:
            aggregated_costs.append(leg_response.costs.totalCost)

    total_cost = sum(aggregated_costs) if aggregated_costs else None

    return DeliveryRouteOptimizationResponseModel(
        fleetSize=payload.fleetSize,
        legs=legs,
        totalDistanceMeters=total_distance,
        totalTravelSeconds=total_travel_seconds,
        totalServiceSeconds=total_service_seconds,
        totalCost=total_cost,
        diagnostics=diagnostics,
    )
