-- Derived daily supply & demand composite indices
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

CREATE TABLE IF NOT EXISTS supply_demand_indices (
  report_date DATE PRIMARY KEY REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE,
  demand_index NUMERIC(10,4),
  supply_index NUMERIC(10,4),
  demand_components JSONB,
  supply_components JSONB,
  coverage NUMERIC(5,2),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE supply_demand_indices IS 'Derived composite indices summarizing market supply and demand signals per report date';
COMMENT ON COLUMN supply_demand_indices.demand_components IS 'JSON blob recording component values/z-scores used to compute demand index';
COMMENT ON COLUMN supply_demand_indices.supply_components IS 'JSON blob recording component values/z-scores used to compute supply index';
COMMENT ON COLUMN supply_demand_indices.coverage IS 'Percentage (0-100) of component data available for that day';
