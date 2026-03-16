-- beef_data • Minimal Health Check (setup verification)
-- Returns zero rows when everything is set up; otherwise lists missing items.

SET search_path TO beef_data, public;

-- 0) Schema present
SELECT 'MISSING_SCHEMA_beef_data' AS issue
WHERE NOT EXISTS (
  SELECT 1 FROM pg_namespace WHERE nspname = 'beef_data'
)
UNION ALL

-- 1) Enum present
SELECT 'MISSING_TYPE_run_enum' AS issue
WHERE NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_enum')
UNION ALL

-- 2) Required tables present (simplified landing tables)
SELECT 'MISSING_TABLE_boxed_am_reports_json' WHERE to_regclass('beef_data.boxed_am_reports_json') IS NULL
UNION ALL SELECT 'MISSING_TABLE_boxed_pm_reports_json' WHERE to_regclass('beef_data.boxed_pm_reports_json') IS NULL
UNION ALL SELECT 'MISSING_TABLE_catalog_reports_json'  WHERE to_regclass('beef_data.catalog_reports_json')  IS NULL
UNION ALL SELECT 'MISSING_TABLE_index_reports_json'    WHERE to_regclass('beef_data.index_reports_json')    IS NULL
UNION ALL SELECT 'MISSING_TABLE_trimmings_am_reports_json' WHERE to_regclass('beef_data.trimmings_am_reports_json') IS NULL
UNION ALL SELECT 'MISSING_TABLE_trimmings_pm_reports_json' WHERE to_regclass('beef_data.trimmings_pm_reports_json') IS NULL
UNION ALL

-- 3) Required views present (convenience + bundle)
SELECT 'MISSING_VIEW_boxed_reports_json'      WHERE to_regclass('beef_data.boxed_reports_json')      IS NULL
UNION ALL SELECT 'MISSING_VIEW_trimmings_reports_json' WHERE to_regclass('beef_data.trimmings_reports_json') IS NULL
UNION ALL SELECT 'MISSING_VIEW_catalog_reports_view'   WHERE to_regclass('beef_data.catalog_reports_view')   IS NULL
UNION ALL SELECT 'MISSING_VIEW_index_reports_view'     WHERE to_regclass('beef_data.index_reports_view')     IS NULL
UNION ALL SELECT 'MISSING_VIEW_report_table_counts'    WHERE to_regclass('beef_data.report_table_counts')    IS NULL
UNION ALL SELECT 'MISSING_VIEW_daily_report_bundle'    WHERE to_regclass('beef_data.daily_report_bundle')    IS NULL;
