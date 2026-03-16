-- Route log header table linked to report dates
CREATE TABLE IF NOT EXISTS beef_data.route_logs (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    driver_name TEXT,
    truck_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_route_logs_report_date
        FOREIGN KEY (report_date)
        REFERENCES beef_data.report_dates(report_date)
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS route_logs_report_date_idx
    ON beef_data.route_logs (report_date);

ALTER TABLE beef_data.route_logs
    ADD COLUMN IF NOT EXISTS truck_description TEXT;
