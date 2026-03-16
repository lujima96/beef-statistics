-- Boxed Beef convenience view for simplified JSON-first schema
-- Unifies AM and PM JSON landing tables into a single query surface

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Unified view over AM/PM boxed reports
CREATE OR REPLACE VIEW boxed_reports_json AS
SELECT id,
       report_id,
       report_date,
       run,
       location,
       source,
       source_file,
       payload,
       created_at
FROM boxed_am_reports_json
UNION ALL
SELECT id,
       report_id,
       report_date,
       run,
       location,
       source,
       source_file,
       payload,
       created_at
FROM boxed_pm_reports_json;

COMMENT ON VIEW boxed_reports_json IS 'Unified AM/PM boxed beef reports backed by JSON landing tables';
