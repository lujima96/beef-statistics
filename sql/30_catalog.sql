-- Catalog convenience view for simplified JSON-first schema
-- Provides a stable, light-weight header view over catalog_reports_json

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Header-only view (common fields), payload remains accessible via the table
CREATE OR REPLACE VIEW catalog_reports_view AS
SELECT id,
       report_code,
       report_name,
       report_date,
       location,
       source_file,
       created_at
FROM catalog_reports_json;

COMMENT ON VIEW catalog_reports_view IS 'Header view over catalog_reports_json (payload stored in table)';

