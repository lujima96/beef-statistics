from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import sys
import types
import importlib.machinery

sys.path.append(str(Path(__file__).resolve().parents[1]))

routes_path = Path(__file__).resolve().parents[1] / "routes"
routes_stub = types.ModuleType("routes")
routes_stub.__path__ = [str(routes_path)]
routes_stub.__spec__ = importlib.machinery.ModuleSpec(
    "routes", loader=None, is_package=True
)
routes_stub.__spec__.submodule_search_locations = [str(routes_path)]
sys.modules.setdefault("routes", routes_stub)

services_module = types.ModuleType("routes.services")


class _StubGraphhopperError(Exception):
    pass


class _StubGraphhopperClient:
    async def matrix(self, payload):  # pragma: no cover - stub only
        raise NotImplementedError


class _BalancedTwoVehicleMatrixClient(_StubGraphhopperClient):
    def __init__(self):
        self.coordinate_labels = {
            (34.75, -92.25): "depot",
            (35.09, -92.43): "conway",
            (34.95, -92.42): "mayflower",
            (34.74, -92.27): "little_rock",
            (34.60, -92.49): "bryant",
        }
        self.distance_rows = {
            "depot": {
                "conway": 10,
                "mayflower": 20,
                "little_rock": 18,
                "bryant": 30,
            },
            "conway": {
                "depot": 10,
                "mayflower": 9,
                "little_rock": 16,
                "bryant": 25,
            },
            "mayflower": {
                "depot": 20,
                "conway": 9,
                "little_rock": 11,
                "bryant": 22,
            },
            "little_rock": {
                "depot": 18,
                "conway": 16,
                "mayflower": 11,
                "bryant": 15,
            },
            "bryant": {
                "depot": 30,
                "conway": 25,
                "mayflower": 22,
                "little_rock": 15,
            },
        }
        self.time_rows = {
            "depot": {
                "conway": 12,
                "mayflower": 25,
                "little_rock": 22,
                "bryant": 35,
            },
            "conway": {
                "depot": 12,
                "mayflower": 10,
                "little_rock": 20,
                "bryant": 30,
            },
            "mayflower": {
                "depot": 25,
                "conway": 10,
                "little_rock": 12,
                "bryant": 28,
            },
            "little_rock": {
                "depot": 22,
                "conway": 20,
                "mayflower": 12,
                "bryant": 18,
            },
            "bryant": {
                "depot": 35,
                "conway": 30,
                "mayflower": 28,
                "little_rock": 18,
            },
        }
        for label, row in self.distance_rows.items():
            row[label] = 0
        for label, row in self.time_rows.items():
            row[label] = 0

    def _point_key(self, point):
        return (round(point["lat"], 6), round(point["lng"], 6))

    async def matrix(self, payload):
        points = payload.get("points", [])
        labels = [self.coordinate_labels[self._point_key(point)] for point in points]
        distances = []
        times = []
        for from_label in labels:
            distance_row = []
            time_row = []
            for to_label in labels:
                distance_row.append(self.distance_rows[from_label][to_label])
                time_row.append(self.time_rows[from_label][to_label] * 60000)
            distances.append(distance_row)
            times.append(time_row)
        return {"distances": distances, "times": times}


class _LinearMatrixClient(_StubGraphhopperClient):
    def __init__(
        self,
        coordinate_map,
        positions,
        minutes_per_unit: float = 2.5,
        base_offset: float = 5.0,
    ):
        self.coordinate_labels = {
            (round(lat, 6), round(lon, 6)): label
            for label, (lat, lon) in coordinate_map.items()
        }
        self.positions = {label: float(pos) for label, pos in positions.items()}
        self.distance_rows = {}
        self.time_rows = {}
        for label, pos in self.positions.items():
            distance_row = {}
            time_row = {}
            for other_label, other_pos in self.positions.items():
                if label == other_label:
                    distance_row[other_label] = 0
                    time_row[other_label] = 0
                    continue
                distance_units = abs(pos - other_pos)
                distance_value = int(round(distance_units * 10))
                if distance_value <= 0:
                    distance_value = 1
                travel_minutes = int(
                    round(distance_units * minutes_per_unit + base_offset)
                )
                if travel_minutes <= 0:
                    travel_minutes = 1
                distance_row[other_label] = distance_value
                time_row[other_label] = travel_minutes
            self.distance_rows[label] = distance_row
            self.time_rows[label] = time_row

    def _point_key(self, point):
        return (round(point["lat"], 6), round(point["lng"], 6))

    async def matrix(self, payload):
        points = payload.get("points", [])
        labels = [self.coordinate_labels[self._point_key(point)] for point in points]
        distances = []
        times = []
        for from_label in labels:
            distance_row = []
            time_row = []
            for to_label in labels:
                distance_row.append(self.distance_rows[from_label][to_label])
                time_row.append(self.time_rows[from_label][to_label] * 60000)
            distances.append(distance_row)
            times.append(time_row)
        return {"distances": distances, "times": times}


class _BalancedThreeVehicleMatrixClient(_LinearMatrixClient):
    def __init__(self):
        coordinates = {
            "depot": (34.75, -92.25),
            "little_rock": (34.74, -92.27),
            "sherwood": (34.83, -92.21),
            "jacksonville": (34.87, -92.11),
            "mayflower": (34.95, -92.42),
            "conway": (35.09, -92.43),
            "bryant": (34.60, -92.49),
            "benton": (34.56, -92.59),
        }
        positions = {
            "depot": 0,
            "little_rock": 4,
            "sherwood": 7,
            "jacksonville": 10,
            "mayflower": 15,
            "conway": 20,
            "bryant": -7,
            "benton": -13,
        }
        super().__init__(coordinates, positions, minutes_per_unit=2.4, base_offset=5.0)


class _BalancedFourVehicleMatrixClient(_LinearMatrixClient):
    def __init__(self):
        coordinates = {
            "depot": (34.75, -92.25),
            "little_rock": (34.74, -92.27),
            "sherwood": (34.83, -92.21),
            "jacksonville": (34.87, -92.11),
            "cabot": (34.95, -92.02),
            "mayflower": (34.95, -92.42),
            "conway": (35.09, -92.43),
            "greenbrier": (35.23, -92.39),
            "bryant": (34.60, -92.49),
            "benton": (34.56, -92.59),
            "malvern": (34.37, -92.82),
        }
        positions = {
            "depot": 0,
            "little_rock": 4,
            "sherwood": 7,
            "jacksonville": 10,
            "cabot": 14,
            "mayflower": 18,
            "conway": 23,
            "greenbrier": 27,
            "bryant": -7,
            "benton": -13,
            "malvern": -20,
        }
        super().__init__(coordinates, positions, minutes_per_unit=2.4, base_offset=5.0)


services_module.GraphhopperClient = _StubGraphhopperClient
services_module.GraphhopperError = _StubGraphhopperError

sys.modules["routes.services"] = services_module

try:
    import psycopg  # noqa: F401  # type: ignore
except ImportError:  # pragma: no cover - fallback for test isolation
    dummy_psycopg = types.ModuleType("psycopg")
    dummy_psycopg.connect = MagicMock()

    class _SQLStub:
        def __init__(self, value: str = ""):
            self.value = value

        def format(self, *args, **kwargs):
            return self

        def join(self, parts):
            return self

        def __add__(self, other):  # pragma: no cover - stub behaviour
            other_value = getattr(other, "value", "")
            return _SQLStub(self.value + other_value)

        __radd__ = __add__

    dummy_psycopg.sql = types.SimpleNamespace(
        SQL=lambda value="": _SQLStub(str(value)),
        Identifier=lambda *args, **kwargs: _SQLStub(),
    )
    sys.modules["psycopg"] = dummy_psycopg

try:
    import fastapi  # noqa: F401  # type: ignore
except Exception:  # pragma: no cover - fallback for test isolation
    for module_name in list(sys.modules):
        if module_name.startswith("fastapi"):
            del sys.modules[module_name]
    fastapi_stub = types.ModuleType("fastapi")

    class _StubHTTPException(Exception):
        def __init__(self, status_code: int, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class _StubAPIRouter:
        def __init__(self, *args, **kwargs):
            self.routes = []

        def _decorator(self, func):
            return func

        def get(self, *args, **kwargs):
            return self._decorator

        def post(self, *args, **kwargs):
            return self._decorator

        def put(self, *args, **kwargs):
            return self._decorator

        def delete(self, *args, **kwargs):
            return self._decorator

        def add_api_route(self, *args, **kwargs):
            return self._decorator

    class _StubResponse:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

    class _StubFastAPI:
        def __init__(self, *args, **kwargs):
            self.routers = []

        def add_middleware(self, *args, **kwargs):
            return None

        def include_router(self, router):
            self.routers.append(router)

    class _StubCORSMiddleware:
        def __init__(self, *args, **kwargs):
            return None

    fastapi_stub.APIRouter = _StubAPIRouter
    fastapi_stub.HTTPException = _StubHTTPException
    fastapi_stub.Response = _StubResponse
    fastapi_stub.FastAPI = _StubFastAPI

    middleware_module = types.ModuleType("fastapi.middleware")
    cors_module = types.ModuleType("fastapi.middleware.cors")
    cors_module.CORSMiddleware = _StubCORSMiddleware
    middleware_module.cors = cors_module

    fastapi_stub.middleware = middleware_module

    sys.modules["fastapi.middleware"] = middleware_module
    sys.modules["fastapi.middleware.cors"] = cors_module

    sys.modules["fastapi"] = fastapi_stub

import importlib.util

delivery_estimator_spec = importlib.util.spec_from_file_location(
    "routes.delivery_estimator",
    routes_path / "delivery_estimator.py",
    submodule_search_locations=[str(routes_path)],
)
delivery_estimator = importlib.util.module_from_spec(delivery_estimator_spec)
sys.modules["routes.delivery_estimator"] = delivery_estimator
assert delivery_estimator_spec.loader is not None
delivery_estimator_spec.loader.exec_module(delivery_estimator)

CoordinatePayloadModel = delivery_estimator.CoordinatePayloadModel
DeliveryRouteOptimizationRequest = delivery_estimator.DeliveryRouteOptimizationRequest
DepotPayloadModel = delivery_estimator.DepotPayloadModel
TruckLegPlanModel = delivery_estimator.TruckLegPlanModel
VendorWaypointModel = delivery_estimator.VendorWaypointModel
_plan_routes_with_vrp = delivery_estimator._plan_routes_with_vrp
pywrapcp = delivery_estimator.pywrapcp
routing_enums_pb2 = delivery_estimator.routing_enums_pb2

if pywrapcp is None:
    class _StubCumulVar:
        def SetRange(self, start, end):
            return None

    class _StubDimension:
        def CumulVar(self, index):
            return _StubCumulVar()

    class _StubVar:
        def Value(self, *args, **kwargs):
            return 0

    class _StubRoutingModel:
        ROUTING_NOT_SOLVED = 0
        ROUTING_SUCCESS = 1
        ROUTING_FAIL = 2
        ROUTING_FAIL_TIMEOUT = 3
        ROUTING_INVALID = 4

        def __init__(self, manager):
            self._manager = manager
            self._transit_callbacks = []
            self._unary_callbacks = []

        def RegisterTransitCallback(self, func):
            self._transit_callbacks.append(func)
            return len(self._transit_callbacks) - 1

        def SetArcCostEvaluatorOfVehicle(self, *args, **kwargs):
            return None

        def RegisterUnaryTransitCallback(self, func):
            self._unary_callbacks.append(func)
            return len(self._unary_callbacks) - 1

        def AddDimension(self, *args, **kwargs):
            return None

        def GetDimensionOrDie(self, name):
            return _StubDimension()

        def AddVariableMinimizedByFinalizer(self, *args, **kwargs):
            return None

        def AddDimensionWithVehicleCapacity(self, *args, **kwargs):
            return None

        def SolveWithParameters(self, *args, **kwargs):
            return []

        def status(self):
            return self.ROUTING_SUCCESS

        def Start(self, vehicle_idx):
            return 0

        def End(self, vehicle_idx):
            return 0

        def NextVar(self, index):
            return _StubVar()

    class _StubRoutingIndexManager:
        def __init__(self, *args, **kwargs):
            return None

        def IndexToNode(self, index):
            return index

        def NodeToIndex(self, node):
            return node

    class _StubSearchParameters:
        def __init__(self):
            self.time_limit = types.SimpleNamespace(FromSeconds=lambda *_: None)
            self.first_solution_strategy = 0
            self.local_search_metaheuristic = 0
            self.log_search = False

    pywrapcp = types.SimpleNamespace(
        RoutingModel=_StubRoutingModel,
        RoutingIndexManager=_StubRoutingIndexManager,
        DefaultRoutingSearchParameters=lambda: _StubSearchParameters(),
    )
    delivery_estimator.pywrapcp = pywrapcp

if routing_enums_pb2 is None:
    routing_enums_pb2 = types.SimpleNamespace(
        FirstSolutionStrategy=types.SimpleNamespace(PARALLEL_CHEAPEST_INSERTION=0),
        LocalSearchMetaheuristic=types.SimpleNamespace(GUIDED_LOCAL_SEARCH=0),
    )
    delivery_estimator.routing_enums_pb2 = routing_enums_pb2

_ROUTING_STATUS_DEFAULTS = {
    "ROUTING_NOT_SOLVED": 0,
    "ROUTING_SUCCESS": 1,
    "ROUTING_FAIL": 2,
    "ROUTING_FAIL_TIMEOUT": 3,
    "ROUTING_INVALID": 4,
}
for status_name, default_value in _ROUTING_STATUS_DEFAULTS.items():
    if not hasattr(pywrapcp.RoutingModel, status_name):
        setattr(pywrapcp.RoutingModel, status_name, default_value)


class _StubGraphhopperClient:
    async def matrix(self, payload):
        return {
            "distances": [[0, 1000], [1000, 0]],
            "times": [[0, 60000], [60000, 0]],
        }


@pytest.mark.asyncio
async def test_plan_routes_fallback_appends_explicit_end_depot():
    payload = DeliveryRouteOptimizationRequest(
        fleetSize=1,
        profile="car",
        optimizeAssignments=False,
        legs=[
            TruckLegPlanModel(
                truckId=None,
                startDepot=DepotPayloadModel(
                    id=1,
                    name="Depot A",
                    coordinates=CoordinatePayloadModel(latitude=10.0, longitude=10.0),
                ),
                endDepot=DepotPayloadModel(
                    id=1,
                    name="Depot A",
                    coordinates=CoordinatePayloadModel(latitude=10.0, longitude=10.0),
                ),
                returnToStart=False,
                vendors=[
                    VendorWaypointModel(
                        id=100,
                        locationName="Vendor",
                        coordinates=CoordinatePayloadModel(latitude=11.0, longitude=11.0),
                        serviceMinutes=15,
                    )
                ],
            )
        ],
    )

    state = {"vendors": []}
    client = _StubGraphhopperClient()

    failure_status = getattr(pywrapcp.RoutingModel, "ROUTING_FAIL", None)
    if failure_status is None:
        failure_status = getattr(pywrapcp.RoutingModel, "ROUTING_NOT_SOLVED", 0)

    with (
        patch("routes.delivery_estimator.ORTOOLS_AVAILABLE", True),
        patch(
            "routes.delivery_estimator.pywrapcp.RoutingModel.SolveWithParameters",
            return_value=None,
        ),
        patch(
            "routes.delivery_estimator.pywrapcp.RoutingModel.status",
            return_value=failure_status,
        ),
    ):
        routes, _, diagnostics = await _plan_routes_with_vrp(
            state=state,
            payload=payload,
            client=client,
            truck_profiles={},
        )

    route = routes[0]
    assert [point.stop_type for point in route] == ["depot", "vendor", "depot"]
    assert route[-1].identifier == payload.legs[0].endDepot.id


@pytest.mark.asyncio
async def test_plan_routes_two_vehicle_custom_split_balances_time():
    client = _BalancedTwoVehicleMatrixClient()
    depot = DepotPayloadModel(
        id=1,
        name="Manna Depot",
        coordinates=CoordinatePayloadModel(latitude=34.75, longitude=-92.25),
    )
    payload = DeliveryRouteOptimizationRequest(
        fleetSize=2,
        profile="car",
        optimizeAssignments=False,
        legs=[
            TruckLegPlanModel(
                truckId=101,
                startDepot=depot,
                returnToStart=True,
                vendors=[
                    VendorWaypointModel(
                        id=11,
                        locationName="Conway",
                        coordinates=CoordinatePayloadModel(
                            latitude=35.09, longitude=-92.43
                        ),
                        serviceMinutes=30,
                    ),
                    VendorWaypointModel(
                        id=12,
                        locationName="Conway",
                        coordinates=CoordinatePayloadModel(
                            latitude=35.09, longitude=-92.43
                        ),
                        serviceMinutes=30,
                    ),
                    VendorWaypointModel(
                        id=13,
                        locationName="Mayflower",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.95, longitude=-92.42
                        ),
                        serviceMinutes=10,
                    ),
                    VendorWaypointModel(
                        id=14,
                        locationName="Little Rock",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.74, longitude=-92.27
                        ),
                        serviceMinutes=35,
                    ),
                    VendorWaypointModel(
                        id=15,
                        locationName="Bryant",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.60, longitude=-92.49
                        ),
                        serviceMinutes=20,
                    ),
                ],
            ),
            TruckLegPlanModel(
                truckId=202,
                startDepot=depot.copy(deep=True),
                returnToStart=True,
                vendors=[],
            ),
        ],
    )

    routes, truck_ids, diagnostics = await _plan_routes_with_vrp(
        state={"vendors": []}, payload=payload, client=client, truck_profiles={}
    )

    assert len(routes) == 2
    assert truck_ids == [101, 202]
    assert diagnostics.status == "success"
    assert diagnostics.unassignedStops == []
    assert diagnostics.violatedConstraints == []

    vendor_routes = [
        [point.identifier for point in route if point.stop_type == "vendor"]
        for route in routes
    ]
    all_vendor_ids = sorted({vid for route_ids in vendor_routes for vid in route_ids})
    assert all_vendor_ids == [11, 12, 13, 14, 15]

    conway_route_index = next(
        idx for idx, route_ids in enumerate(vendor_routes) if 11 in route_ids
    )
    assert 12 in vendor_routes[conway_route_index]

    coord_labels = client.coordinate_labels

    def _coord_key(point):
        return (round(point.latitude, 6), round(point.longitude, 6))

    totals = []
    for route in routes:
        labels = [coord_labels[_coord_key(point)] for point in route]
        travel_minutes = sum(
            client.time_rows[labels[idx]][labels[idx + 1]]
            for idx in range(len(labels) - 1)
        )
        service_minutes = sum(
            point.service_minutes for point in route if point.stop_type == "vendor"
        )
        totals.append(travel_minutes + service_minutes)

    assert abs(totals[0] - totals[1]) <= 20


@pytest.mark.asyncio
async def test_plan_routes_three_vehicle_custom_split_balances_time_and_paths():
    client = _BalancedThreeVehicleMatrixClient()
    depot = DepotPayloadModel(
        id=1,
        name="Manna Depot",
        coordinates=CoordinatePayloadModel(latitude=34.75, longitude=-92.25),
    )
    payload = DeliveryRouteOptimizationRequest(
        fleetSize=3,
        profile="car",
        optimizeAssignments=False,
        legs=[
            TruckLegPlanModel(
                truckId=301,
                startDepot=depot,
                returnToStart=True,
                vendors=[
                    VendorWaypointModel(
                        id=21,
                        locationName="Little Rock Market",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.74, longitude=-92.27
                        ),
                        serviceMinutes=35,
                    ),
                    VendorWaypointModel(
                        id=22,
                        locationName="Sherwood Pantry",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.83, longitude=-92.21
                        ),
                        serviceMinutes=25,
                    ),
                    VendorWaypointModel(
                        id=23,
                        locationName="Jacksonville Stop",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.87, longitude=-92.11
                        ),
                        serviceMinutes=20,
                    ),
                    VendorWaypointModel(
                        id=24,
                        locationName="Mayflower Depot",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.95, longitude=-92.42
                        ),
                        serviceMinutes=30,
                    ),
                    VendorWaypointModel(
                        id=25,
                        locationName="Conway Food Bank",
                        coordinates=CoordinatePayloadModel(
                            latitude=35.09, longitude=-92.43
                        ),
                        serviceMinutes=30,
                    ),
                    VendorWaypointModel(
                        id=26,
                        locationName="Bryant Outreach",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.60, longitude=-92.49
                        ),
                        serviceMinutes=25,
                    ),
                    VendorWaypointModel(
                        id=27,
                        locationName="Benton Pantry",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.56, longitude=-92.59
                        ),
                        serviceMinutes=40,
                    ),
                ],
            ),
            TruckLegPlanModel(
                truckId=302,
                startDepot=depot.copy(deep=True),
                returnToStart=True,
                vendors=[],
            ),
            TruckLegPlanModel(
                truckId=303,
                startDepot=depot.copy(deep=True),
                returnToStart=True,
                vendors=[],
            ),
        ],
    )

    routes, truck_ids, diagnostics = await _plan_routes_with_vrp(
        state={"vendors": []}, payload=payload, client=client, truck_profiles={}
    )

    assert len(routes) == 3
    assert truck_ids == [301, 302, 303]
    assert diagnostics.status == "success"
    assert "three-vehicle" in diagnostics.statusDetail
    assert diagnostics.unassignedStops == []
    assert diagnostics.violatedConstraints == []

    coord_labels = client.coordinate_labels

    def _coord_key(point):
        return (round(point.latitude, 6), round(point.longitude, 6))

    vendor_routes = [
        [point.identifier for point in route if point.stop_type == "vendor"]
        for route in routes
    ]
    all_vendor_ids = sorted({vid for route_ids in vendor_routes for vid in route_ids})
    assert all_vendor_ids == [21, 22, 23, 24, 25, 26, 27]

    totals = []
    for route in routes:
        labels = [coord_labels[_coord_key(point)] for point in route]
        travel_minutes = sum(
            client.time_rows[labels[idx]][labels[idx + 1]]
            for idx in range(len(labels) - 1)
        )
        service_minutes = sum(
            point.service_minutes for point in route if point.stop_type == "vendor"
        )
        totals.append(travel_minutes + service_minutes)

        vendor_labels = [
            coord_labels[_coord_key(point)]
            for point in route
            if point.stop_type == "vendor"
        ]
        vendor_positions = [client.positions[label] for label in vendor_labels]
        if len(vendor_positions) >= 2:
            non_decreasing = all(
                vendor_positions[i] <= vendor_positions[i + 1]
                for i in range(len(vendor_positions) - 1)
            )
            non_increasing = all(
                vendor_positions[i] >= vendor_positions[i + 1]
                for i in range(len(vendor_positions) - 1)
            )
            assert non_decreasing or non_increasing

    assert max(totals) - min(totals) <= 35


@pytest.mark.asyncio
async def test_plan_routes_four_vehicle_custom_split_balances_time_and_paths():
    client = _BalancedFourVehicleMatrixClient()
    depot = DepotPayloadModel(
        id=1,
        name="Manna Depot",
        coordinates=CoordinatePayloadModel(latitude=34.75, longitude=-92.25),
    )
    payload = DeliveryRouteOptimizationRequest(
        fleetSize=4,
        profile="car",
        optimizeAssignments=False,
        legs=[
            TruckLegPlanModel(
                truckId=401,
                startDepot=depot,
                returnToStart=True,
                vendors=[
                    VendorWaypointModel(
                        id=31,
                        locationName="Malvern Aid",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.37, longitude=-92.82
                        ),
                        serviceMinutes=30,
                    ),
                    VendorWaypointModel(
                        id=32,
                        locationName="Benton Pantry",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.56, longitude=-92.59
                        ),
                        serviceMinutes=35,
                    ),
                    VendorWaypointModel(
                        id=33,
                        locationName="Bryant Outreach",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.60, longitude=-92.49
                        ),
                        serviceMinutes=22,
                    ),
                    VendorWaypointModel(
                        id=34,
                        locationName="Little Rock Market",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.74, longitude=-92.27
                        ),
                        serviceMinutes=28,
                    ),
                    VendorWaypointModel(
                        id=35,
                        locationName="Sherwood Pantry",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.83, longitude=-92.21
                        ),
                        serviceMinutes=24,
                    ),
                    VendorWaypointModel(
                        id=36,
                        locationName="Jacksonville Stop",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.87, longitude=-92.11
                        ),
                        serviceMinutes=22,
                    ),
                    VendorWaypointModel(
                        id=37,
                        locationName="Cabot Depot",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.95, longitude=-92.02
                        ),
                        serviceMinutes=27,
                    ),
                    VendorWaypointModel(
                        id=38,
                        locationName="Mayflower Pantry",
                        coordinates=CoordinatePayloadModel(
                            latitude=34.95, longitude=-92.42
                        ),
                        serviceMinutes=26,
                    ),
                    VendorWaypointModel(
                        id=39,
                        locationName="Conway Food Bank",
                        coordinates=CoordinatePayloadModel(
                            latitude=35.09, longitude=-92.43
                        ),
                        serviceMinutes=26,
                    ),
                    VendorWaypointModel(
                        id=40,
                        locationName="Greenbrier Outreach",
                        coordinates=CoordinatePayloadModel(
                            latitude=35.23, longitude=-92.39
                        ),
                        serviceMinutes=24,
                    ),
                ],
            ),
            TruckLegPlanModel(
                truckId=402,
                startDepot=depot.copy(deep=True),
                returnToStart=True,
                vendors=[],
            ),
            TruckLegPlanModel(
                truckId=403,
                startDepot=depot.copy(deep=True),
                returnToStart=True,
                vendors=[],
            ),
            TruckLegPlanModel(
                truckId=404,
                startDepot=depot.copy(deep=True),
                returnToStart=True,
                vendors=[],
            ),
        ],
    )

    routes, truck_ids, diagnostics = await _plan_routes_with_vrp(
        state={"vendors": []}, payload=payload, client=client, truck_profiles={}
    )

    assert len(routes) == 4
    assert truck_ids == [401, 402, 403, 404]
    assert diagnostics.status == "success"
    assert "four-vehicle" in diagnostics.statusDetail
    assert diagnostics.unassignedStops == []
    assert diagnostics.violatedConstraints == []

    coord_labels = client.coordinate_labels

    def _coord_key(point):
        return (round(point.latitude, 6), round(point.longitude, 6))

    vendor_routes = [
        [point.identifier for point in route if point.stop_type == "vendor"]
        for route in routes
    ]
    all_vendor_ids = sorted({vid for route_ids in vendor_routes for vid in route_ids})
    assert all_vendor_ids == [31, 32, 33, 34, 35, 36, 37, 38, 39, 40]

    totals = []
    for route in routes:
        labels = [coord_labels[_coord_key(point)] for point in route]
        travel_minutes = sum(
            client.time_rows[labels[idx]][labels[idx + 1]]
            for idx in range(len(labels) - 1)
        )
        service_minutes = sum(
            point.service_minutes for point in route if point.stop_type == "vendor"
        )
        totals.append(travel_minutes + service_minutes)

        vendor_labels = [
            coord_labels[_coord_key(point)]
            for point in route
            if point.stop_type == "vendor"
        ]
        vendor_positions = [client.positions[label] for label in vendor_labels]
        if len(vendor_positions) >= 2:
            non_decreasing = all(
                vendor_positions[i] <= vendor_positions[i + 1]
                for i in range(len(vendor_positions) - 1)
            )
            non_increasing = all(
                vendor_positions[i] >= vendor_positions[i + 1]
                for i in range(len(vendor_positions) - 1)
            )
            assert non_decreasing or non_increasing

    assert max(totals) - min(totals) <= 40


@pytest.mark.asyncio
async def test_list_delivery_routes_fetches_vendors_once_and_returns_sequences():
    depot_record = {
        "id": 1,
        "location_name": "Manna Depot",
        "address": "1600 Depot Way",
        "window_start": "08:00",
        "window_end": "17:00",
        "stop_time": "30",
        "service_minutes": 30,
        "latitude": 34.75,
        "longitude": -92.25,
    }

    raw_routes = [
        {"id": 10, "name": "North Loop", "stopIds": [1, 2, 3]},
        {"id": 20, "name": "South Loop", "stopIds": [4, 1, 5]},
    ]

    vendor_store = {
        1: {**depot_record},
        2: {
            "id": 2,
            "location_name": "Vendor A",
            "address": "10 Main St",
            "window_start": "08:00",
            "window_end": "17:00",
            "stop_time": "20",
            "service_minutes": 20,
            "latitude": 34.80,
            "longitude": -92.30,
        },
        3: {
            "id": 3,
            "location_name": "Vendor B",
            "address": "20 Oak St",
            "window_start": "08:00",
            "window_end": "17:00",
            "stop_time": "15",
            "service_minutes": 15,
            "latitude": 34.85,
            "longitude": -92.35,
        },
        4: {
            "id": 4,
            "location_name": "Vendor C",
            "address": "30 Pine St",
            "window_start": "08:00",
            "window_end": "17:00",
            "stop_time": "25",
            "service_minutes": 25,
            "latitude": 34.90,
            "longitude": -92.40,
        },
        5: {
            "id": 5,
            "location_name": "Vendor D",
            "address": "40 Elm St",
            "window_start": "08:00",
            "window_end": "17:00",
            "stop_time": "18",
            "service_minutes": 18,
            "latitude": 34.95,
            "longitude": -92.45,
        },
    }

    fetched_ids = []

    def fake_fetch(cur, vendor_ids):
        fetched_ids.append(tuple(sorted(vendor_ids)))
        return {
            vendor_id: vendor_store[vendor_id]
            for vendor_id in vendor_ids
            if vendor_id in vendor_store
        }

    class _DummyCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class _DummyConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return _DummyCursor()

    dummy_connection = _DummyConnection()

    with (
        patch("routes.delivery_estimator.pg_dsn_from_env", return_value="postgresql://test"),
        patch("routes.delivery_estimator.psycopg.connect", return_value=dummy_connection),
        patch("routes.delivery_estimator._fetch_routes_from_db", return_value=raw_routes),
        patch("routes.delivery_estimator._get_depot_vendor", return_value=depot_record),
        patch("routes.delivery_estimator._fetch_vendor_records", side_effect=fake_fetch) as fetch_mock,
    ):
        routes = await delivery_estimator.list_delivery_routes()

    assert fetch_mock.call_count == 1
    assert len(fetched_ids) == 1
    assert set(fetched_ids[0]) == {1, 2, 3, 4, 5}

    assert [route.id for route in routes] == [10, 20]
    assert routes[0].name == "North Loop"
    assert routes[1].name == "South Loop"

    first_route_ids = [stop.id for stop in routes[0].stops]
    second_route_ids = [stop.id for stop in routes[1].stops]

    assert first_route_ids == [1, 2, 3, 1]
    assert second_route_ids == [1, 4, 5, 1]

    assert [stop.sequence for stop in routes[0].stops] == [0, 1, 2, 3]
    assert [stop.sequence for stop in routes[1].stops] == [0, 1, 2, 3]

    assert routes[0].stops[0].label == "Manna Depot"
    assert routes[0].stops[-1].label == "Manna Depot (Return)"
    assert routes[1].stops[0].label == "Manna Depot"
    assert routes[1].stops[-1].label == "Manna Depot (Return)"

    assert routes[0].stops[0].latitude == pytest.approx(depot_record["latitude"])
    assert routes[0].stops[0].longitude == pytest.approx(depot_record["longitude"])


def test_compute_default_vehicle_capacity_balances_average_load():
    capacity = delivery_estimator._compute_default_vehicle_capacity(120, 40, 2)
    assert capacity == 75


def test_compute_default_vehicle_capacity_handles_zero_demand():
    capacity = delivery_estimator._compute_default_vehicle_capacity(0, 0, 3)
    assert capacity == 1


def test_compute_default_vehicle_capacity_respects_largest_stop():
    capacity = delivery_estimator._compute_default_vehicle_capacity(30, 20, 5)
    assert capacity == 20
