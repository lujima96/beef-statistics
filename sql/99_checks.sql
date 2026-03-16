
-- beef_data • Simplified Schema Health Check

SET search_path TO beef_data, public;

-- 1) Enum present
SELECT 'MISSING run_enum' AS issue
WHERE NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_enum');

-- 2) Required tables exist
SELECT 'MISSING boxed_am_reports_json' AS issue WHERE to_regclass('beef_data.boxed_am_reports_json') IS NULL
UNION ALL SELECT 'MISSING boxed_pm_reports_json' WHERE to_regclass('beef_data.boxed_pm_reports_json') IS NULL
UNION ALL SELECT 'MISSING catalog_reports_json'  WHERE to_regclass('beef_data.catalog_reports_json')  IS NULL
UNION ALL SELECT 'MISSING index_reports_json'    WHERE to_regclass('beef_data.index_reports_json')    IS NULL
UNION ALL SELECT 'MISSING trimmings_am_reports_json' WHERE to_regclass('beef_data.trimmings_am_reports_json') IS NULL
UNION ALL SELECT 'MISSING trimmings_pm_reports_json' WHERE to_regclass('beef_data.trimmings_pm_reports_json') IS NULL
UNION ALL SELECT 'MISSING national_daily_average_temperature' WHERE to_regclass('beef_data.national_daily_average_temperature') IS NULL
UNION ALL SELECT 'MISSING diesel_weekly_prices' WHERE to_regclass('beef_data.diesel_weekly_prices') IS NULL
UNION ALL SELECT 'MISSING number_of_occurrences_monthly' WHERE to_regclass('beef_data.number_of_occurrences_monthly') IS NULL;

-- 3) Uniqueness guards present
WITH uniqs AS (
  SELECT c.conname, t.relname AS table_name, c.contype
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname='beef_data' AND c.contype='u'
)
SELECT 'MISSING_UQ_boxed_am' WHERE NOT EXISTS (SELECT 1 FROM uniqs WHERE conname='uq_boxed_am')
UNION ALL SELECT 'MISSING_UQ_boxed_pm' WHERE NOT EXISTS (SELECT 1 FROM uniqs WHERE conname='uq_boxed_pm')
UNION ALL SELECT 'MISSING_UQ_catalog_json' WHERE NOT EXISTS (SELECT 1 FROM uniqs WHERE conname='uq_catalog_json')
UNION ALL SELECT 'MISSING_UQ_index_json' WHERE NOT EXISTS (SELECT 1 FROM uniqs WHERE conname='uq_index_json')
UNION ALL SELECT 'MISSING_UQ_trimmings_am_json' WHERE NOT EXISTS (SELECT 1 FROM uniqs WHERE conname='uq_trimmings_am_json')
UNION ALL SELECT 'MISSING_UQ_trimmings_pm_json' WHERE NOT EXISTS (SELECT 1 FROM uniqs WHERE conname='uq_trimmings_pm_json');

-- 4) Duplicate detection (should return 0 rows)
SELECT 'boxed_am' AS table_name, report_id, report_date, run, COUNT(*) AS cnt
FROM boxed_am_reports_json
GROUP BY report_id, report_date, run HAVING COUNT(*) > 1
UNION ALL
SELECT 'boxed_pm', report_id, report_date, run, COUNT(*)
FROM boxed_pm_reports_json
GROUP BY report_id, report_date, run HAVING COUNT(*) > 1
UNION ALL
SELECT 'catalog', report_code, report_date, NULL::run_enum, COUNT(*)
FROM catalog_reports_json
GROUP BY report_code, report_date HAVING COUNT(*) > 1
UNION ALL
SELECT 'index', report_id, report_date, NULL::run_enum, COUNT(*)
FROM index_reports_json
GROUP BY report_id, report_date HAVING COUNT(*) > 1
UNION ALL
SELECT 'trimmings_am', report_code, report_date, run, COUNT(*)
FROM trimmings_am_reports_json
GROUP BY report_code, report_date, run HAVING COUNT(*) > 1
UNION ALL
SELECT 'trimmings_pm', report_code, report_date, run, COUNT(*)
FROM trimmings_pm_reports_json
GROUP BY report_code, report_date, run HAVING COUNT(*) > 1;

-- 5) Daily bundle view present
SELECT 'MISSING_VIEW_daily_report_bundle' AS issue
WHERE to_regclass('beef_data.daily_report_bundle') IS NULL;

-- 6) Expected indexes present (names as defined across 05/90 SQL)
WITH expected(idx_name) AS (
  VALUES
    -- From 05_json_landing.sql (report_date + payload GIN)
    ('idx_boxed_am_report_date'),
    ('idx_boxed_am_payload_gin'),
    ('idx_boxed_pm_report_date'),
    ('idx_boxed_pm_payload_gin'),
    ('idx_catalog_json_report_date'),
    ('idx_catalog_json_payload_gin'),
    ('idx_index_json_report_date'),
    ('idx_index_json_payload_gin'),
    ('idx_trim_am_json_report_date'),
    ('idx_trim_am_json_payload_gin'),
    ('idx_trim_pm_json_report_date'),
    ('idx_trim_pm_json_payload_gin'),
    -- From 90_indexes.sql (additional helpful indexes)
    ('idx_boxed_am_report_id'),
    ('idx_boxed_am_run'),
    ('idx_boxed_am_date_run'),
    ('idx_boxed_pm_report_id'),
    ('idx_boxed_pm_run'),
    ('idx_boxed_pm_date_run'),
    ('idx_catalog_json_report_code'),
    ('idx_index_json_report_id'),
    ('idx_trim_am_json_report_code'),
    ('idx_trim_pm_json_report_code'),
    ('national_daily_average_temperature_date_idx'),
    ('idx_diesel_weekly_price_date'),
    ('idx_number_of_occurrences_monthly_month_start'),
    ('idx_number_of_occurrences_monthly_event_type')
)
SELECT 'MISSING_INDEX_' || e.idx_name AS issue
FROM expected e
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'beef_data'
    AND c.relkind = 'i'
    AND c.relname = e.idx_name
);
