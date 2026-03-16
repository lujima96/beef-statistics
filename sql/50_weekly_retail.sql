-- Weekly Retail Prices PDF storage
CREATE SCHEMA IF NOT EXISTS beef_data;
SET search_path TO beef_data, public;

CREATE TABLE IF NOT EXISTS weekly_retail_price_pdfs (
  id            BIGSERIAL PRIMARY KEY,
  report_date   DATE NOT NULL,
  report_code   TEXT,
  source_url    TEXT,
  filename      TEXT NOT NULL,
  file_size     BIGINT,
  content_type  TEXT,
  sha256        TEXT,
  pdf_bytes     BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_weekly_retail_pdf UNIQUE (report_date, filename)
);

CREATE INDEX IF NOT EXISTS idx_weekly_retail_date ON weekly_retail_price_pdfs (report_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_retail_sha256 ON weekly_retail_price_pdfs ((COALESCE(sha256, '')));

