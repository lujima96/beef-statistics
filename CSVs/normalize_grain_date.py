import pandas as pd
from dateutil import parser

# Input files
files = [
    "CSVs/feed-grains-yearbook-historical.csv",
    "CSVs/feed-grains-yearbook-recent.csv"
]

def normalize_date(row):
    year = int(row["year"])
    freq = str(row["frequency"]).lower()
    period = str(row["timeperiod"]).strip()

    # Annual → Jan 1
    if "annual" in freq:
        return f"{year}-01-01"

    # Quarterly → first month of the quarter
    if "quarter" in freq or "q" in period.lower():
        if "1" in period.lower():
            return f"{year}-01-01"
        elif "2" in period.lower():
            return f"{year}-04-01"
        elif "3" in period.lower():
            return f"{year}-07-01"
        elif "4" in period.lower():
            return f"{year}-10-01"

    # Monthly → parse month name or number
    try:
        month = parser.parse(period).month
        return f"{year}-{month:02d}-01"
    except Exception:
        # Fallback → default to Jan 1
        return f"{year}-01-01"

for f in files:
    print(f"Processing {f}...")
    df = pd.read_csv(f)

    # Add normalized report_date column
    df["report_date"] = df.apply(normalize_date, axis=1)

    # Save normalized version
    out_file = f.replace(".csv", "_normalized.csv")
    df.to_csv(out_file, index=False)
    print(f"  Saved {out_file} with {len(df)} rows")
