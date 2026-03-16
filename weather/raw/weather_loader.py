#!/usr/bin/env python3
import os
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

# ───────────────────────────────────────────────
# Load .env explicitly (absolute path)
ENV_PATH = Path("/home/paul/Desktop/beef_stats_project/beef_stats/.env")
print(f"Loading env from {ENV_PATH}")
if not ENV_PATH.exists():
    raise FileNotFoundError(f".env file not found at {ENV_PATH}")

load_dotenv(ENV_PATH)

# Build DB params
DB_PARAMS = {
    "dbname": os.getenv("POSTGRES_DB"),
    "user": os.getenv("POSTGRES_USER"),
    "password": os.getenv("POSTGRES_PASSWORD"),
    "host": os.getenv("PGHOST", "localhost"),
    "port": int(os.getenv("PGPORT", os.getenv("PG_HOST_PORT", 5432))),
}

# Guard clause to stop if required env vars missing
for key in ("dbname", "user", "password"):
    if not DB_PARAMS[key]:
        raise RuntimeError(f"Missing required DB param: {key} (check your .env)")

TABLE = "beef_data.weather_events"

CREATE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id BIGSERIAL PRIMARY KEY,
    event_begin_date TIMESTAMP,          -- parsed from BEGIN_DATE_TIME
    begin_yearmonth INT,
    begin_day INT,
    begin_time TEXT,
    end_yearmonth INT,
    end_day INT,
    end_time TEXT,
    episode_id BIGINT,
    event_id BIGINT,
    state TEXT,
    state_fips INT,
    year INT,
    month_name TEXT,
    event_type TEXT,
    cz_type TEXT,
    cz_fips TEXT,
    cz_name TEXT,
    wfo TEXT,
    begin_date_time TEXT,
    cz_timezone TEXT,
    end_date_time TEXT,
    injuries_direct INT,
    injuries_indirect INT,
    deaths_direct INT,
    deaths_indirect INT,
    damage_property TEXT,
    damage_crops TEXT,
    source TEXT,
    magnitude TEXT,
    magnitude_type TEXT,
    flood_cause TEXT,
    category TEXT,
    tor_f_scale TEXT,
    tor_length TEXT,
    tor_width TEXT,
    tor_other_wfo TEXT,
    tor_other_cz_state TEXT,
    tor_other_cz_fips TEXT,
    tor_other_cz_name TEXT,
    begin_range TEXT,
    begin_azimuth TEXT,
    begin_location TEXT,
    end_range TEXT,
    end_azimuth TEXT,
    end_location TEXT,
    begin_lat NUMERIC,
    begin_lon NUMERIC,
    end_lat NUMERIC,
    end_lon NUMERIC,
    episode_narrative TEXT,
    event_narrative TEXT,
    data_source TEXT
);
"""

def main():
    print(
        f"Connecting to DB '{DB_PARAMS['dbname']}' as user '{DB_PARAMS['user']}' "
        f"on host '{DB_PARAMS['host']}:{DB_PARAMS['port']}'"
    )

    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor()

    # Create table if missing
    cur.execute(CREATE_SQL)
    conn.commit()

    # Truncate table before reload
    cur.execute(f"TRUNCATE TABLE {TABLE};")
    conn.commit()
    print("✔ Table truncated")

    folder = Path(__file__).parent
    csv_files = sorted(folder.glob("weather_events_*.csv"))

    for csv_file in csv_files:
        print(f"Loading {csv_file.name}...")
        df = pd.read_csv(csv_file, low_memory=False)

        # Parse BEGIN_DATE_TIME into proper datetime
        df["event_begin_date"] = pd.to_datetime(
            df["BEGIN_DATE_TIME"], errors="coerce", format="%d-%b-%y %H:%M:%S"
        )

        # Replace NaN with None for psycopg2
        df = df.where(pd.notnull(df), None)

        # Insert rows
        cols = list(df.columns)
        colnames = ", ".join(c.lower() for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        sql = f"INSERT INTO {TABLE} ({colnames}) VALUES ({placeholders})"

        for _, row in df.iterrows():
            vals = [row[c] for c in cols]
            cur.execute(sql, vals)

        conn.commit()
        print(f"✔ {csv_file.name} loaded ({len(df)} rows).")

    cur.close()
    conn.close()
    print("🎉 All files loaded successfully!")


if __name__ == "__main__":
    main()
