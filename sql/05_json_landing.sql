-- Simplified JSON Landing Tables (one table per processed JSON category)
-- Store full JSON payload plus convenient header columns that are
-- maintained by lightweight BEFORE INSERT/UPDATE triggers. We avoid
-- generated columns to support broader Postgres versions and sidestep
-- immutability restrictions on JSONB operators.

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Ensure enum exists (created in 01_types.sql)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='run_enum') THEN
    RAISE EXCEPTION 'run_enum type missing. Run 01_types.sql first.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS boxed_am_reports_json (
  id                    BIGSERIAL PRIMARY KEY,
  -- Convenience fields synchronized from payload via trigger
  report_id             TEXT,
  report_date           DATE,
  run                   run_enum,
  location              TEXT,
  source                TEXT,
  -- Ingestion metadata + full JSON document
  source_file           TEXT,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_boxed_am UNIQUE (report_id, report_date, run)
);
CREATE INDEX IF NOT EXISTS idx_boxed_am_report_date ON boxed_am_reports_json (report_date);
CREATE INDEX IF NOT EXISTS idx_boxed_am_payload_gin ON boxed_am_reports_json USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS boxed_pm_reports_json (
  id                    BIGSERIAL PRIMARY KEY,
  -- Convenience fields synchronized from payload via trigger
  report_id             TEXT,
  report_date           DATE,
  run                   run_enum,
  location              TEXT,
  source                TEXT,
  -- Ingestion metadata + full JSON document
  source_file           TEXT,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_boxed_pm UNIQUE (report_id, report_date, run)
);
CREATE INDEX IF NOT EXISTS idx_boxed_pm_report_date ON boxed_pm_reports_json (report_date);
CREATE INDEX IF NOT EXISTS idx_boxed_pm_payload_gin ON boxed_pm_reports_json USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS catalog_reports_json (
  id            BIGSERIAL PRIMARY KEY,
  -- Convenience fields synchronized from payload via trigger
  report_code   TEXT,
  report_name   TEXT,
  report_date   DATE,
  location      TEXT,
  -- Ingestion metadata + full JSON document
  source_file   TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_json UNIQUE (report_code, report_date)
);
CREATE INDEX IF NOT EXISTS idx_catalog_json_report_date ON catalog_reports_json (report_date);
CREATE INDEX IF NOT EXISTS idx_catalog_json_payload_gin ON catalog_reports_json USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS index_reports_json (
  id            BIGSERIAL PRIMARY KEY,
  -- Convenience fields synchronized from payload via trigger
  report_id     TEXT,
  report_date   DATE,
  location      TEXT,
  source        TEXT,
  -- Ingestion metadata + full JSON document
  source_file   TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_index_json UNIQUE (report_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_index_json_report_date ON index_reports_json (report_date);
CREATE INDEX IF NOT EXISTS idx_index_json_payload_gin ON index_reports_json USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS trimmings_am_reports_json (
  id            BIGSERIAL PRIMARY KEY,
  -- Convenience fields synchronized from payload via trigger
  report_code   TEXT,
  report_date   DATE,
  run           run_enum,
  -- Ingestion metadata + full JSON document
  source_file   TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_trimmings_am_json UNIQUE (report_code, report_date, run)
);
CREATE INDEX IF NOT EXISTS idx_trim_am_json_report_date ON trimmings_am_reports_json (report_date);
CREATE INDEX IF NOT EXISTS idx_trim_am_json_payload_gin ON trimmings_am_reports_json USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS trimmings_pm_reports_json (
  id            BIGSERIAL PRIMARY KEY,
  -- Convenience fields synchronized from payload via trigger
  report_code   TEXT,
  report_date   DATE,
  run           run_enum,
  -- Ingestion metadata + full JSON document
  source_file   TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_trimmings_pm_json UNIQUE (report_code, report_date, run)
);
CREATE INDEX IF NOT EXISTS idx_trim_pm_json_report_date ON trimmings_pm_reports_json (report_date);
CREATE INDEX IF NOT EXISTS idx_trim_pm_json_payload_gin ON trimmings_pm_reports_json USING gin (payload jsonb_path_ops);

-- Synchronization triggers to keep convenience columns aligned with payload

-- 1) Boxed AM
CREATE OR REPLACE FUNCTION boxed_am_reports_json_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.report_id = COALESCE(NEW.report_id, NEW.payload->>'report_id');
  NEW.report_date = COALESCE(NEW.report_date, (NEW.payload->>'report_date')::date);
  NEW.run = COALESCE(NEW.run, (NEW.payload->>'run')::run_enum);
  NEW.location = COALESCE(NEW.location, NEW.payload->>'location');
  NEW.source = COALESCE(NEW.source, NEW.payload->>'source');
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_boxed_am_reports_json_sync ON boxed_am_reports_json;
CREATE TRIGGER trg_boxed_am_reports_json_sync
BEFORE INSERT OR UPDATE ON boxed_am_reports_json
FOR EACH ROW EXECUTE FUNCTION boxed_am_reports_json_sync();

-- 2) Boxed PM
CREATE OR REPLACE FUNCTION boxed_pm_reports_json_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.report_id = COALESCE(NEW.report_id, NEW.payload->>'report_id');
  NEW.report_date = COALESCE(NEW.report_date, (NEW.payload->>'report_date')::date);
  NEW.run = COALESCE(NEW.run, (NEW.payload->>'run')::run_enum);
  NEW.location = COALESCE(NEW.location, NEW.payload->>'location');
  NEW.source = COALESCE(NEW.source, NEW.payload->>'source');
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_boxed_pm_reports_json_sync ON boxed_pm_reports_json;
CREATE TRIGGER trg_boxed_pm_reports_json_sync
BEFORE INSERT OR UPDATE ON boxed_pm_reports_json
FOR EACH ROW EXECUTE FUNCTION boxed_pm_reports_json_sync();

-- 3) Catalog
CREATE OR REPLACE FUNCTION catalog_reports_json_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.report_code = COALESCE(NEW.report_code, NEW.payload#>>'{report,report_code}');
  NEW.report_name = COALESCE(NEW.report_name, NEW.payload#>>'{report,report_name}');
  NEW.report_date = COALESCE(NEW.report_date, (NEW.payload#>>'{report,report_date}')::date);
  NEW.location = COALESCE(NEW.location, NEW.payload#>>'{report,location}');
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_catalog_reports_json_sync ON catalog_reports_json;
CREATE TRIGGER trg_catalog_reports_json_sync
BEFORE INSERT OR UPDATE ON catalog_reports_json
FOR EACH ROW EXECUTE FUNCTION catalog_reports_json_sync();

-- 4) Index Report
CREATE OR REPLACE FUNCTION index_reports_json_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.report_id = COALESCE(NEW.report_id, NEW.payload->>'report_id');
  NEW.report_date = COALESCE(NEW.report_date, (NEW.payload->>'date')::date);
  NEW.location = COALESCE(NEW.location, NEW.payload->>'location');
  NEW.source = COALESCE(NEW.source, NEW.payload->>'source');
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_index_reports_json_sync ON index_reports_json;
CREATE TRIGGER trg_index_reports_json_sync
BEFORE INSERT OR UPDATE ON index_reports_json
FOR EACH ROW EXECUTE FUNCTION index_reports_json_sync();

-- 5) Trimmings AM
CREATE OR REPLACE FUNCTION trimmings_am_reports_json_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.report_code = COALESCE(NEW.report_code, NEW.payload->>'report_code');
  NEW.report_date = COALESCE(NEW.report_date, (NEW.payload->>'report_date')::date);
  NEW.run = COALESCE(NEW.run, (NEW.payload->>'run')::run_enum);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_trimmings_am_reports_json_sync ON trimmings_am_reports_json;
CREATE TRIGGER trg_trimmings_am_reports_json_sync
BEFORE INSERT OR UPDATE ON trimmings_am_reports_json
FOR EACH ROW EXECUTE FUNCTION trimmings_am_reports_json_sync();

-- 6) Trimmings PM
CREATE OR REPLACE FUNCTION trimmings_pm_reports_json_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.report_code = COALESCE(NEW.report_code, NEW.payload->>'report_code');
  NEW.report_date = COALESCE(NEW.report_date, (NEW.payload->>'report_date')::date);
  NEW.run = COALESCE(NEW.run, (NEW.payload->>'run')::run_enum);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_trimmings_pm_reports_json_sync ON trimmings_pm_reports_json;
CREATE TRIGGER trg_trimmings_pm_reports_json_sync
BEFORE INSERT OR UPDATE ON trimmings_pm_reports_json
FOR EACH ROW EXECUTE FUNCTION trimmings_pm_reports_json_sync();

-- Weather: national daily average temperatures (ingested via scripts/loader)
CREATE TABLE IF NOT EXISTS national_daily_average_temperature (
  observation_date       DATE PRIMARY KEY,
  average_temperature_f  NUMERIC NOT NULL,
  states_reporting       INTEGER,
  station_observations   INTEGER,
  source_file            TEXT,
  ingested_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS national_daily_average_temperature_date_idx
  ON national_daily_average_temperature (observation_date);

-- Optional: daily linkage view (presence of each feed by date)
CREATE OR REPLACE VIEW daily_report_bundle AS
SELECT d::date AS report_date,
       (SELECT COUNT(*) FROM boxed_am_reports_json b WHERE b.report_date = d)  AS boxed_am,
       (SELECT COUNT(*) FROM boxed_pm_reports_json b WHERE b.report_date = d)  AS boxed_pm,
       (SELECT COUNT(*) FROM catalog_reports_json  c WHERE c.report_date = d)  AS catalog,
       (SELECT COUNT(*) FROM index_reports_json    i WHERE i.report_date = d)  AS index_report,
       (SELECT COUNT(*) FROM trimmings_am_reports_json t WHERE t.report_date=d) AS trimmings_am,
       (SELECT COUNT(*) FROM trimmings_pm_reports_json t WHERE t.report_date=d) AS trimmings_pm,
       (SELECT average_temperature_f FROM national_daily_average_temperature temp WHERE temp.observation_date = d) AS average_temperature_f
FROM generate_series(
       COALESCE((SELECT MIN(report_date) FROM boxed_am_reports_json), CURRENT_DATE),
       CURRENT_DATE,
       interval '1 day'
     ) AS d;

-- Convenience view to expose detailed Ground Beef items from Boxed AM/PM JSON
-- New payload key: payload->'ground_beef_items' holds an array of objects with
--  { label, percent?, trades, pounds, low, high, weighted_average }
-- This view normalizes those lines for easier querying and charting.
DROP VIEW IF EXISTS boxed_ground_beef_items;
CREATE OR REPLACE VIEW boxed_ground_beef_items AS
SELECT 'AM'::run_enum AS run,
       t.report_date,
       (ln->>'label')               AS label,
       NULLIF(ln->>'percent','')::int            AS percent,
       NULLIF(ln->>'trades','')::int             AS trades,
       NULLIF(ln->>'pounds','')::bigint          AS pounds,
       NULLIF(ln->>'low','')::numeric            AS low,
       NULLIF(ln->>'high','')::numeric           AS high,
       NULLIF(ln->>'weighted_average','')::numeric AS weighted_average
FROM boxed_am_reports_json t
     CROSS JOIN LATERAL jsonb_array_elements(t.payload->'ground_beef_items') ln
UNION ALL
SELECT 'PM'::run_enum AS run,
       t.report_date,
       (ln->>'label')               AS label,
       NULLIF(ln->>'percent','')::int            AS percent,
       NULLIF(ln->>'trades','')::int             AS trades,
       NULLIF(ln->>'pounds','')::bigint          AS pounds,
       NULLIF(ln->>'low','')::numeric            AS low,
       NULLIF(ln->>'high','')::numeric           AS high,
       NULLIF(ln->>'weighted_average','')::numeric AS weighted_average
FROM boxed_pm_reports_json t
     CROSS JOIN LATERAL jsonb_array_elements(t.payload->'ground_beef_items') ln;
