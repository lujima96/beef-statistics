-- Create table to store CSV exports for Select sheet entries
CREATE SCHEMA IF NOT EXISTS beef_data;

CREATE TABLE IF NOT EXISTS beef_data.select_sheet_csv (
  id           BIGSERIAL PRIMARY KEY,
  sheet_date   DATE NOT NULL,
  filename     TEXT,
  csv_content  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='beef_data' AND table_name='select_sheet_csv' AND column_name='sheet_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS select_sheet_csv_date_idx ON beef_data.select_sheet_csv (sheet_date)';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='beef_data' AND table_name='select_sheet_csv' AND column_name='report_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS select_sheet_csv_date_idx ON beef_data.select_sheet_csv (report_date)';
  END IF;
END $$;
