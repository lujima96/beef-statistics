import os
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env in project root
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

DB_PARAMS = {
    "dbname": os.getenv("POSTGRES_DB"),
    "user": os.getenv("POSTGRES_USER"),
    "password": os.getenv("POSTGRES_PASSWORD"),
    "host": "localhost",              # adjust if different (e.g. 'db' in Docker)
    "port": os.getenv("PG_HOST_PORT", 5432),
}

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
    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor()
    cur.execute(CREATE_SQL)
    conn.commit()

    folder = Path(__file__).parent
    csv_files = sorted(folder.glob("weather_events_*.csv"))

    for csv_file in csv_files:
        print(f"Loading {csv_file.name}...")
        df = pd.read_csv(csv_file, low_memory=False)

        # Parse BEGIN_DATE_TIME into proper datetime
        df["event_begin_date"] = pd.to_datetime(
            df["BEGIN_DATE_TIME"], errors="coerce", format="%d-%b-%y %H:%M:%S"
        )

        # Replace NaN with None
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
        print(f"✔ {csv_file.name} loaded.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
