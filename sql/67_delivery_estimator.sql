-- Delivery estimator relational tables
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

CREATE TABLE IF NOT EXISTS delivery_estimator_workers (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    wage TEXT NOT NULL DEFAULT '',
    shift_start TEXT NOT NULL DEFAULT '',
    shift_end TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_estimator_truck_costs (
    id INTEGER PRIMARY KEY,
    make TEXT NOT NULL DEFAULT '',
    vehicle_year TEXT NOT NULL DEFAULT '',
    mpg DOUBLE PRECISION,
    capacity DOUBLE PRECISION,
    mpg_input TEXT NOT NULL DEFAULT '',
    capacity_input TEXT NOT NULL DEFAULT '',
    fuel_cost_per_mile DOUBLE PRECISION,
    fuel_cost_per_mile_input TEXT NOT NULL DEFAULT '',
    fuel_cost_mode TEXT NOT NULL DEFAULT 'auto',
    maintenance_cost_per_mile DOUBLE PRECISION,
    maintenance_cost_per_mile_input TEXT NOT NULL DEFAULT '',
    maintenance_cost_mode TEXT NOT NULL DEFAULT 'auto',
    total_cost_per_mile DOUBLE PRECISION,
    total_cost_per_mile_input TEXT NOT NULL DEFAULT '',
    total_cost_mode TEXT NOT NULL DEFAULT 'auto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_estimator_vendors (
    id INTEGER PRIMARY KEY,
    location_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    window_start TEXT NOT NULL DEFAULT '',
    window_end TEXT NOT NULL DEFAULT '',
    stop_time TEXT NOT NULL DEFAULT '',
    service_minutes INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    stop_sequence INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_estimator_workers_name
    ON delivery_estimator_workers (last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_delivery_estimator_truck_costs_make
    ON delivery_estimator_truck_costs (make, vehicle_year);

CREATE INDEX IF NOT EXISTS idx_delivery_estimator_vendors_location
    ON delivery_estimator_vendors (location_name);

CREATE TABLE IF NOT EXISTS delivery_estimator_routes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_estimator_route_stops (
    route_id INTEGER NOT NULL REFERENCES delivery_estimator_routes(id) ON DELETE CASCADE,
    stop_position INTEGER NOT NULL,
    vendor_id INTEGER NOT NULL,
    PRIMARY KEY(route_id, stop_position)
);

CREATE INDEX IF NOT EXISTS idx_delivery_estimator_route_stops_route
    ON delivery_estimator_route_stops (route_id, stop_position);
