from pathlib import Path

# Root directory of the repository
ROOT_DIR = Path(__file__).resolve().parents[1]

# Data directories
BEEF_STATS_DIR = ROOT_DIR / "beef_stats"
RAW_DIR = BEEF_STATS_DIR / "raw"
PROCESSED_DIR = BEEF_STATS_DIR / "processed"
LINKS_DIR = ROOT_DIR / "links"
