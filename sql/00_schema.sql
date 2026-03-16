-- Simplified JSON-first schema bootstrap
-- Idempotent: safe to run multiple times
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

-- Note: All tables live in schema beef_data. See 05_json_landing.sql
-- for the canonical JSON landing tables created under this schema.
