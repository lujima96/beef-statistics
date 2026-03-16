-- Normalize CSV export tables to use report_date and enforce via FK
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Helper to rename column if present as sheet_date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='beef_data' AND table_name='cow_sheet_csv' AND column_name='sheet_date'
  ) THEN
    ALTER TABLE beef_data.cow_sheet_csv RENAME COLUMN sheet_date TO report_date;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='beef_data' AND table_name='choice_sheet_csv' AND column_name='sheet_date'
  ) THEN
    ALTER TABLE beef_data.choice_sheet_csv RENAME COLUMN sheet_date TO report_date;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='beef_data' AND table_name='prime_sheet_csv' AND column_name='sheet_date'
  ) THEN
    ALTER TABLE beef_data.prime_sheet_csv RENAME COLUMN sheet_date TO report_date;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='beef_data' AND table_name='select_sheet_csv' AND column_name='sheet_date'
  ) THEN
    ALTER TABLE beef_data.select_sheet_csv RENAME COLUMN sheet_date TO report_date;
  END IF;
END $$;

-- Ensure NOT NULL on report_date for CSV export tables
ALTER TABLE IF EXISTS beef_data.cow_sheet_csv    ALTER COLUMN report_date SET NOT NULL;
ALTER TABLE IF EXISTS beef_data.choice_sheet_csv ALTER COLUMN report_date SET NOT NULL;
ALTER TABLE IF EXISTS beef_data.prime_sheet_csv  ALTER COLUMN report_date SET NOT NULL;
ALTER TABLE IF EXISTS beef_data.select_sheet_csv ALTER COLUMN report_date SET NOT NULL;

-- Add/refresh foreign keys to report_dates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cow_sheet_report_date') THEN
    ALTER TABLE beef_data.cow_sheet_csv DROP CONSTRAINT fk_cow_sheet_report_date;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_choice_sheet_report_date') THEN
    ALTER TABLE beef_data.choice_sheet_csv DROP CONSTRAINT fk_choice_sheet_report_date;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_prime_sheet_report_date') THEN
    ALTER TABLE beef_data.prime_sheet_csv DROP CONSTRAINT fk_prime_sheet_report_date;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_select_sheet_report_date') THEN
    ALTER TABLE beef_data.select_sheet_csv DROP CONSTRAINT fk_select_sheet_report_date;
  END IF;
END $$;

ALTER TABLE IF EXISTS beef_data.cow_sheet_csv
  ADD CONSTRAINT fk_cow_sheet_report_date
  FOREIGN KEY (report_date) REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE;

ALTER TABLE IF EXISTS beef_data.choice_sheet_csv
  ADD CONSTRAINT fk_choice_sheet_report_date
  FOREIGN KEY (report_date) REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE;

ALTER TABLE IF EXISTS beef_data.prime_sheet_csv
  ADD CONSTRAINT fk_prime_sheet_report_date
  FOREIGN KEY (report_date) REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE;

ALTER TABLE IF EXISTS beef_data.select_sheet_csv
  ADD CONSTRAINT fk_select_sheet_report_date
  FOREIGN KEY (report_date) REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE;

-- Add FKs for existing JSON landing and weekly PDF tables (allow NULLs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_boxed_am_report_date') THEN
    ALTER TABLE beef_data.boxed_am_reports_json
      ADD CONSTRAINT fk_boxed_am_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_boxed_pm_report_date') THEN
    ALTER TABLE beef_data.boxed_pm_reports_json
      ADD CONSTRAINT fk_boxed_pm_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_catalog_report_date') THEN
    ALTER TABLE beef_data.catalog_reports_json
      ADD CONSTRAINT fk_catalog_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_index_report_date') THEN
    ALTER TABLE beef_data.index_reports_json
      ADD CONSTRAINT fk_index_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_trim_am_report_date') THEN
    ALTER TABLE beef_data.trimmings_am_reports_json
      ADD CONSTRAINT fk_trim_am_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_trim_pm_report_date') THEN
    ALTER TABLE beef_data.trimmings_pm_reports_json
      ADD CONSTRAINT fk_trim_pm_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_weekly_retail_report_date') THEN
    ALTER TABLE beef_data.weekly_retail_price_pdfs
      ADD CONSTRAINT fk_weekly_retail_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_weekly_boxed_report_date') THEN
    ALTER TABLE beef_data.weekly_boxed_beef_pdfs
      ADD CONSTRAINT fk_weekly_boxed_report_date FOREIGN KEY (report_date)
      REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

