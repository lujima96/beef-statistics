-- Convenience utilities for simplified JSON-first schema
-- Adds lightweight aggregate views that aid validation and exploration

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Simple counts across all JSON landing tables
CREATE OR REPLACE VIEW report_table_counts AS
SELECT 'boxed_am_reports_json'      AS table_name, COUNT(*) AS row_count FROM boxed_am_reports_json
UNION ALL SELECT 'boxed_pm_reports_json',   COUNT(*) FROM boxed_pm_reports_json
UNION ALL SELECT 'catalog_reports_json',    COUNT(*) FROM catalog_reports_json
UNION ALL SELECT 'index_reports_json',      COUNT(*) FROM index_reports_json
UNION ALL SELECT 'trimmings_am_reports_json', COUNT(*) FROM trimmings_am_reports_json
UNION ALL SELECT 'trimmings_pm_reports_json', COUNT(*) FROM trimmings_pm_reports_json;

COMMENT ON VIEW report_table_counts IS 'Row counts for all simplified JSON landing tables';

