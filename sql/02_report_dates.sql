-- Central date dimension table to enforce normalized report dates
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

CREATE TABLE IF NOT EXISTS report_dates (
  report_date DATE PRIMARY KEY
);

-- Seed a practical date range if empty (1970-01-01 .. 2100-12-31)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM report_dates LIMIT 1) THEN
    INSERT INTO report_dates (report_date)
    SELECT d::date
    FROM generate_series(date '1970-01-01', date '2100-12-31', interval '1 day') AS g(d);
  END IF;
END $$;

