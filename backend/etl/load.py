"""
load.py  -  L of ETL
Saves the validated data to (1) a cleaned CSV and (2) a SQLite database.
Rejected rows are saved separately for review.
"""
import sqlite3
import pandas as pd
from config import (PROCESSED_CSV, REJECTED_CSV, DB_PATH, DB_TABLE, REJECTED_TABLE)


def _prepare(df):
    """Make columns SQLite/CSV friendly (dates as text)."""
    out = df.copy()
    if "sale_date" in out:
        out["sale_date"] = pd.to_datetime(out["sale_date"]).dt.strftime("%Y-%m-%d")
    return out


def _create_table(conn, table, df):
    """Create the table with an explicit structure built from the column types."""
    sql_types = []
    for col, dtype in df.dtypes.items():
        if pd.api.types.is_integer_dtype(dtype):
            kind = "INTEGER"
        elif pd.api.types.is_float_dtype(dtype):
            kind = "REAL"
        else:
            kind = "TEXT"
        sql_types.append(f'"{col}" {kind}')
    conn.execute(f'DROP TABLE IF EXISTS "{table}"')
    conn.execute(f'CREATE TABLE "{table}" ({", ".join(sql_types)})')


def load(valid_df, rejected_df):
    """Write CSV files and database tables. Returns a report dict."""
    PROCESSED_CSV.parent.mkdir(parents=True, exist_ok=True)
    valid_out, rejected_out = _prepare(valid_df), _prepare(rejected_df)

    # 1. CSV files
    valid_out.to_csv(PROCESSED_CSV, index=False)
    rejected_out.to_csv(REJECTED_CSV, index=False)

    # 2. SQLite database
    with sqlite3.connect(DB_PATH) as conn:
        _create_table(conn, DB_TABLE, valid_out)
        valid_out.to_sql(DB_TABLE, conn, if_exists="append", index=False)
        _create_table(conn, REJECTED_TABLE, rejected_out)
        rejected_out.to_sql(REJECTED_TABLE, conn, if_exists="append", index=False)
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_zip ON "{DB_TABLE}"(zipcode)')

    print(f"[LOAD] {len(valid_out)} rows -> {PROCESSED_CSV.name} and table '{DB_TABLE}' in {DB_PATH.name}")
    return {
        "rows_loaded": int(len(valid_out)),
        "rows_rejected": int(len(rejected_out)),
        "csv_file": str(PROCESSED_CSV.name),
        "database_file": str(DB_PATH.name),
        "table": DB_TABLE,
    }
