-- Boxed AM entries since 2018 (full listing)
-- Lists every row inserted into beef_data.boxed_am_reports_json from
-- 2018-01-01 through today, including the original payload JSON.

SET search_path TO beef_data, public;

SELECT
  id,
  report_date,
  report_id,
  run,
  location,
  source,
  source_file,
  created_at,
  payload
FROM beef_data.boxed_am_reports_json
WHERE report_date >= DATE '2018-01-01'
ORDER BY report_date DESC, id DESC;
