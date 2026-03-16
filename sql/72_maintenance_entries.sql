CREATE TABLE IF NOT EXISTS beef_data.maintenance_entries (
    maintenance_id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    mileage NUMERIC(12, 2),
    make TEXT,
    service_location TEXT,
    address TEXT,
    labor NUMERIC(12, 2),
    parts NUMERIC(12, 2),
    total NUMERIC(12, 2),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_maintenance_entries_report_date
        FOREIGN KEY (report_date)
        REFERENCES beef_data.report_dates(report_date)
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS maintenance_entries_report_date_idx
    ON beef_data.maintenance_entries (report_date);
