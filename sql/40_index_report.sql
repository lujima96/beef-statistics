-- Index report convenience view for simplified JSON-first schema
-- Exposes commonly used header fields from index_reports_json

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

CREATE OR REPLACE VIEW index_reports_view AS
SELECT id,
       report_id,
       report_date,
       location,
       source,
       source_file,
       payload,
       created_at
FROM index_reports_json;

COMMENT ON VIEW index_reports_view IS 'Header view over index_reports_json (payload stored in table)';

