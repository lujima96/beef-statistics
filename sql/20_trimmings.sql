-- Trimmings convenience view for simplified JSON-first schema
-- Unifies AM and PM JSON landing tables into a single query surface

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Unified view over AM/PM trimmings reports
CREATE OR REPLACE VIEW trimmings_reports_json AS
SELECT id,
       report_code,
       report_date,
       run,
       source_file,
       payload,
       created_at
FROM trimmings_am_reports_json
UNION ALL
SELECT id,
       report_code,
       report_date,
       run,
       source_file,
       payload,
       created_at
FROM trimmings_pm_reports_json;

COMMENT ON VIEW trimmings_reports_json IS 'Unified AM/PM trimmings reports backed by JSON landing tables';

