-- Fuel stop entries linked 1:1 with route logs by report date
CREATE TABLE IF NOT EXISTS beef_data.fuel_stops (
    fuel_stop_id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    route_log_id INTEGER NOT NULL,
    start_time TIME,
    end_time TIME,
    odometer NUMERIC(12, 2),
    cost NUMERIC(12, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_fuel_stops_report_date
        FOREIGN KEY (report_date)
        REFERENCES beef_data.report_dates(report_date)
        ON UPDATE CASCADE,
    CONSTRAINT fk_fuel_stops_route_log
        FOREIGN KEY (route_log_id)
        REFERENCES beef_data.route_logs(id)
        ON DELETE CASCADE,
    CONSTRAINT fuel_stops_unique_report_date UNIQUE (report_date),
    CONSTRAINT fuel_stops_unique_route_log UNIQUE (route_log_id)
);
