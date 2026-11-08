"""
extract.py  -  E of ETL
Reads the raw CSV with pandas and runs the first quality checks.
"""
from pathlib import Path
import pandas as pd
from config import RAW_CSV


def extract(path=RAW_CSV):
    """Load the CSV and return (dataframe, report_dict)."""
    path = Path(path)

    # 1. Check the file exists before reading
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    # 2. Read the CSV (nothing is hard-coded: columns come from the file)
    df = pd.read_csv(path)

    # 3. Basic inspection
    report = {
        "source_file": path.name,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "column_names": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "missing_values": int(df.isnull().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),                       # identical rows
        "duplicate_ids": int(df.duplicated("id").sum()) if "id" in df else 0,  # same house sold again
    }

    print(f"[EXTRACT] {path.name}: {report['rows']} rows x {report['columns']} columns")
    print(f"[EXTRACT] Missing values: {report['missing_values']} | "
          f"Duplicate rows: {report['duplicate_rows']} | Repeated ids: {report['duplicate_ids']}")
    return df, report
