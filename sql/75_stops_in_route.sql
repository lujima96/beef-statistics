-- Individual stops tied back to route logs
CREATE TABLE IF NOT EXISTS beef_data.stops_in_route (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL,
    from_location TEXT,
    to_location TEXT,
    start_miles NUMERIC(12, 2),
    end_miles NUMERIC(12, 2),
    start_time TIME,
    end_time TIME,
    odometer NUMERIC(12, 2),
    cost NUMERIC(12, 2),
    is_fuel_stop BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_stops_in_route_route
        FOREIGN KEY (route_id)
        REFERENCES beef_data.route_logs(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS stops_in_route_route_id_idx
    ON beef_data.stops_in_route (route_id);
