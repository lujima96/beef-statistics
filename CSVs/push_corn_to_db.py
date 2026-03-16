import os
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2 import sql


def load_env(path: Path) -> dict[str, str]:
    """Minimal .env loader so the script can reuse project credentials."""

    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"
for key, value in load_env(ENV_PATH).items():
    os.environ.setdefault(key, value)


def get_env(name: str, *fallback_keys: str, default: str | None = None) -> str | None:
    for key in (name, *fallback_keys):
        val = os.environ.get(key)
        if val:
            return val
    return default


DB_NAME = get_env("POSTGRES_DB", "PGDATABASE", default="beef_data")
DB_USER = get_env("POSTGRES_USER", "PGUSER", default="postgres")
DB_PASS = get_env("POSTGRES_PASSWORD", "PGPASSWORD", default="postgres")
DB_HOST = get_env("POSTGRES_HOST", "PGHOST", default="127.0.0.1")
DB_PORT = get_env("PG_HOST_PORT", "POSTGRES_PORT", "PGPORT", default="5432")
DB_SCHEMA = get_env("POSTGRES_SCHEMA", "PGSCHEMA", default="beef_data")

CSV_FILE = Path(__file__).resolve().parent / "feed-grains-yearbook-recent_normalized.csv"

if not all([DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT]):
    raise RuntimeError("Database credentials are incomplete; check beef_stats/.env")


def main() -> None:
    with psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        host=DB_HOST,
        port=DB_PORT,
    ) as conn:
        with conn.cursor() as cur:
            schema = DB_SCHEMA or "public"
            schema_id = sql.Identifier(schema)

            cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}".strip()).format(schema_id))

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.feed_costs (
                        id SERIAL PRIMARY KEY,
                        report_date DATE NOT NULL REFERENCES {}.report_dates(report_date) ON DELETE CASCADE,
                        table_name TEXT NOT NULL,
                        commodity TEXT NOT NULL,
                        attribute TEXT NOT NULL,
                        geography TEXT NOT NULL,
                        unit TEXT NOT NULL,
                        value NUMERIC,
                        frequency TEXT NOT NULL,
                        raw_year INT NOT NULL,
                        raw_timeperiod TEXT,
                        created_at TIMESTAMP DEFAULT now()
                    );
                    """
                ).format(schema_id, schema_id)
            )

            df = pd.read_csv(CSV_FILE)
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
            records = df[
                [
                    "report_date",
                    "table_name",
                    "commodity",
                    "attribute",
                    "geography",
                    "unit",
                    "amount",
                    "frequency",
                    "year",
                    "timeperiod",
                ]
            ].values.tolist()

            insert_query = sql.SQL(
                """
                    INSERT INTO {}.feed_costs (
                        report_date,
                        table_name,
                        commodity,
                        attribute,
                        geography,
                        unit,
                        value,
                        frequency,
                        raw_year,
                        raw_timeperiod
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT DO NOTHING;
                """
            ).format(schema_id)

            cur.executemany(insert_query, records)

        print(f"Inserted {len(records)} rows into feed_costs")


if __name__ == "__main__":
    main()
