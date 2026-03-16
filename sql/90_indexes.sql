-- Simplified-schema indexes focused on JSON landing tables
-- Adds helpful single-column and composite indexes used for common filters

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Boxed AM
CREATE INDEX IF NOT EXISTS idx_boxed_am_report_id      ON boxed_am_reports_json (report_id);
CREATE INDEX IF NOT EXISTS idx_boxed_am_run            ON boxed_am_reports_json (run);
CREATE INDEX IF NOT EXISTS idx_boxed_am_date_run       ON boxed_am_reports_json (report_date, run);

-- Boxed PM
CREATE INDEX IF NOT EXISTS idx_boxed_pm_report_id      ON boxed_pm_reports_json (report_id);
CREATE INDEX IF NOT EXISTS idx_boxed_pm_run            ON boxed_pm_reports_json (run);
CREATE INDEX IF NOT EXISTS idx_boxed_pm_date_run       ON boxed_pm_reports_json (report_date, run);

-- Catalog
CREATE INDEX IF NOT EXISTS idx_catalog_json_report_code ON catalog_reports_json (report_code);

-- Index report
CREATE INDEX IF NOT EXISTS idx_index_json_report_id     ON index_reports_json (report_id);

-- Trimmings AM/PM
CREATE INDEX IF NOT EXISTS idx_trim_am_json_report_code ON trimmings_am_reports_json (report_code);
CREATE INDEX IF NOT EXISTS idx_trim_pm_json_report_code ON trimmings_pm_reports_json (report_code);

-- Note: report_date and payload GIN indexes are created in 05_json_landing.sql
