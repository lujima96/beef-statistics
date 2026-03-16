-- Simplified schema types
-- Create enum(s) first; run this before any tables

CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_enum') THEN
    CREATE TYPE run_enum AS ENUM ('AM', 'PM');
  END IF;
END;
$$;

-- Document the intent of this enum used by JSON landing tables
COMMENT ON TYPE run_enum IS 'AM/PM run indicator used by boxed/trimmings JSON tables';
