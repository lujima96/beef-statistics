-- De-duplicate all major tables by their natural unique keys, keeping newest rows
-- Run in DBeaver or psql. Safe to run multiple times.

BEGIN;
SET search_path TO beef_data, public;

-- 1) boxed_am_reports_json: unique by (report_id, report_date, run)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_id, report_date, run
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM boxed_am_reports_json
)
DELETE FROM boxed_am_reports_json t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 2) boxed_pm_reports_json: unique by (report_id, report_date, run)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_id, report_date, run
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM boxed_pm_reports_json
)
DELETE FROM boxed_pm_reports_json t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 3) catalog_reports_json: unique by (report_code, report_date)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_code, report_date
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM catalog_reports_json
)
DELETE FROM catalog_reports_json t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 4) index_reports_json: unique by (report_id, report_date)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_id, report_date
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM index_reports_json
)
DELETE FROM index_reports_json t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 5) trimmings_am_reports_json: unique by (report_code, report_date, run)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_code, report_date, run
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM trimmings_am_reports_json
)
DELETE FROM trimmings_am_reports_json t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 6) trimmings_pm_reports_json: unique by (report_code, report_date, run)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_code, report_date, run
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM trimmings_pm_reports_json
)
DELETE FROM trimmings_pm_reports_json t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 7) weekly_retail_price_pdfs: unique by (report_date, filename)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_date, filename
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM weekly_retail_price_pdfs
)
DELETE FROM weekly_retail_price_pdfs t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 8) weekly_boxed_beef_pdfs: unique by (report_date, filename)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY report_date, filename
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM weekly_boxed_beef_pdfs
)
DELETE FROM weekly_boxed_beef_pdfs t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

COMMIT;

-- Optional: quick duplicate check summaries (should all return zero rows)
-- SELECT 'boxed_am' AS tbl, report_id, report_date, run, COUNT(*) c
-- FROM boxed_am_reports_json GROUP BY 1,2,3,4 HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'boxed_pm', report_id, report_date, run, COUNT(*) FROM boxed_pm_reports_json GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;

