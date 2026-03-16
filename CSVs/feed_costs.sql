CREATE TABLE feed_costs (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,        -- ERS table name (e.g., "Table 9--Corn...")
    commodity TEXT NOT NULL,         -- "Corn", "Sorghum", etc.
    attribute TEXT NOT NULL,         -- "Price received by farmers"
    geography TEXT NOT NULL,         -- usually "United States"
    unit TEXT NOT NULL,              -- "bushel", "ton"
    value NUMERIC NOT NULL,          -- the actual number
    frequency TEXT NOT NULL,         -- 'Annual', 'Quarterly', 'Monthly'
    report_date DATE NOT NULL,       -- normalized date (YYYY-MM-DD)
    raw_year INT NOT NULL,           -- raw year from CSV
    raw_timeperiod TEXT,             -- "Marketing year Jun-May", "Q1", "July", etc.
    created_at TIMESTAMP DEFAULT now()
);
