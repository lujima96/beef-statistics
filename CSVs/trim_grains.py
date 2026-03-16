import pandas as pd

# File paths
files = [
    "CSVs/feed-grains-yearbook-historical.csv",
    "CSVs/feed-grains-yearbook-recent.csv"
]

# Tables you want to keep (high + medium priority)
KEEP_TABLES = [
    "Table 1--Corn, sorghum, barley, and oats: Planted acreage, harvested acreage, production, yield, and price received by farmers",
    "Table 3--Feed grains (corn, sorghum, barley, and oats): Supply and disappearance, million metric tons",
    "Table 4--Corn: Supply and disappearance, million bushels",
    "Table 9--Corn and sorghum: Prices received by farmers, United States",
    "Table 12--Corn: Cash prices at principal markets, dollars per bushel",
    "Table 15--Feed-price ratios for livestock, poultry, and milk",
    "Table 16--Byproduct feeds: Wholesale price, bulk, specified markets, dollars per ton",
    "Table 17--Processed corn products: Quoted market prices",
    "Table 29--Processed feeds: Quantities fed and feed per grain-consuming animal unit, 1,000 metric tons",
    "Table 31--Corn: Food, seed, and industrial use, million bushels",
    # optional context tables
    "Table 8--Hay: Production, harvested acreage, yield, and stocks",
    "Table 11--Hay: Prices received by farmers, United States, dollars per ton",
    "Table 18--U.S. corn and sorghum exports",
    "Table 28--Rail rates and grain shipments",
    "Table 2--Foreign coarse grains: Supply and disappearance",
]

for f in files:
    print(f"Processing {f}...")
    df = pd.read_csv(f)
    before_count = len(df)

    # Keep only rows whose table_name matches our list
    df_clean = df[df["table_name"].isin(KEEP_TABLES)]

    after_count = len(df_clean)
    print(f"  Kept {after_count} of {before_count} rows")

    # Overwrite file
    df_clean.to_csv(f, index=False)

print("Cleanup complete. Original files overwritten.")
