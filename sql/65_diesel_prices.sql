-- Weekly diesel retail prices sourced from EIA
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

CREATE TABLE IF NOT EXISTS diesel_weekly_prices (
  price_date DATE PRIMARY KEY REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE,
  diesel_dollars_per_gallon NUMERIC(10,4) NOT NULL,
  source_file TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diesel_weekly_price_date
  ON diesel_weekly_prices (price_date);
