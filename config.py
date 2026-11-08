"""
config.py
Central place for file paths and project-wide settings.
Every other file imports from here, so a path is changed in ONE place only.
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# ---- Data files ----
RAW_CSV = BASE_DIR / "data" / "raw" / "kc_house_data.csv"             # input
PROCESSED_CSV = BASE_DIR / "data" / "processed" / "cleaned_house_prices.csv"
REJECTED_CSV = BASE_DIR / "data" / "processed" / "rejected_records.csv"
DB_PATH = BASE_DIR / "data" / "house_prices.db"                        # SQLite database
DB_TABLE = "houses"
REJECTED_TABLE = "rejected_records"

# ---- Output folders ----
VIS_DIR = BASE_DIR / "visualizations"     # EDA charts (PNG)
OUTPUT_DIR = BASE_DIR / "outputs"         # JSON reports read by the frontend
ETL_REPORT = OUTPUT_DIR / "etl_report.json"
EDA_REPORT = OUTPUT_DIR / "eda_report.json"
FRONTEND_DIR = BASE_DIR / "frontend"

# ---- Dataset settings (taken from the real CSV, not assumed) ----
TARGET = "price"          # the column we want to understand / predict later
