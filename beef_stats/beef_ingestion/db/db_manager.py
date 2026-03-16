# db/db_manager.py
import os, re
from pathlib import Path
from datetime import datetime

import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

load_dotenv()

# Where to save generated DDL scripts
_SQL_DIR = Path(__file__).resolve().parents[1] / "sql" / "migrations"
_SQL_DIR.mkdir(parents=True, exist_ok=True)

# basic whitelist for table names (start with letter/_; then letters/digits/_)
_TBL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

def get_connection():
    """Open a connection into beef_data schema by default."""
    return psycopg2.connect(
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
        host=os.getenv("PG_HOST", "localhost"),
        port=os.getenv("PG_HOST_PORT", 5432),
        options="-c search_path=beef_data"  # 👈 force schema
    )

def _validate_table_name(table: str) -> None:
    if not _TBL_RE.match(table):
        raise ValueError(
            f"Invalid table name: {table!r}. "
            "Use letters, digits, and underscores; must not start with a digit."
        )

def ensure_table_exists(conn, table: str) -> Path:
    """
    Idempotently creates the table if missing under beef_data schema.
    Tables link back to beef_data.report_dates(report_date).
    Writes the exact DDL we executed to sql/migrations/<timestamp>__create_<table>.sql
    Returns the path to the generated SQL file.
    """
    _validate_table_name(table)

    ddl = sql.SQL("""
        CREATE TABLE IF NOT EXISTS beef_data.{tbl} (
            id BIGSERIAL PRIMARY KEY,
            url TEXT NOT NULL,
            report_date DATE NOT NULL REFERENCES beef_data.report_dates(report_date),
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE (url, report_date)
        );
    """).format(tbl=sql.Identifier(table))

    ddl_text = ddl.as_string(conn).strip() + "\n"

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    sql_path = _SQL_DIR / f"{ts}__create_{table}.sql"
    sql_path.write_text(ddl_text, encoding="utf-8")

    with conn.cursor() as cur:
        cur.execute(ddl)
    conn.commit()
    return sql_path

def insert_file_record(conn, table: str, file_url: str, report_date) -> None:
    """
    Insert a file record tied to a report_date.
    If the report_date doesn’t exist in beef_data.report_dates, you’ll get a FK error,
    so make sure to pre-populate or insert that first.
    """
    _validate_table_name(table)
    ensure_table_exists(conn, table)

    query = sql.SQL("""
        INSERT INTO beef_data.{table} (url, report_date)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING;
    """).format(table=sql.Identifier(table))

    with conn.cursor() as cur:
        cur.execute(query, (file_url, report_date))
    conn.commit()


def fetch_existing_urls(conn, table: str) -> set[str]:
    """Return the set of URLs already stored for *table*."""

    _validate_table_name(table)

    query = sql.SQL("SELECT url FROM beef_data.{table};").format(
        table=sql.Identifier(table)
    )

    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return {row[0] for row in rows if row and isinstance(row[0], str)}
