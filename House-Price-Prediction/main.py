"""
main.py  -  run the whole Phase-01 pipeline from one place.

Usage:
    python main.py          -> ETL + EDA
    python main.py etl      -> only ETL
    python main.py eda      -> only EDA (needs the ETL output)
    python main.py serve    -> start the dashboard at http://127.0.0.1:5000
"""
import json
import sys
import time

from config import ETL_REPORT, EDA_REPORT, OUTPUT_DIR
from backend.etl.extract import extract
from backend.etl.transform import transform
from backend.etl.validate import validate
from backend.etl.load import load
from backend.eda.analysis import run_eda


def run_etl():
    """Raw CSV -> Extract -> Transform -> Validate -> Load."""
    start = time.time()
    raw_df, extract_report = extract()
    clean_df, transform_report = transform(raw_df)
    valid_df, rejected_df, validate_report = validate(clean_df)
    load_report = load(valid_df, rejected_df)

    report = {"extract": extract_report, "transform": transform_report,
              "validate": validate_report, "load": load_report,
              "seconds": round(time.time() - start, 2)}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(ETL_REPORT, "w") as fh:
        json.dump(report, fh, indent=2)
    return report


def run_all():
    run_etl()
    run_eda()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "all"
    if command == "etl":
        run_etl()
    elif command == "eda":
        run_eda()
    elif command == "serve":
        from backend.app import app
        if not (ETL_REPORT.exists() and EDA_REPORT.exists()):
            print("No results yet - running ETL + EDA first...")
            run_all()
        print("Open http://127.0.0.1:5000 in your browser")
        app.run(host="127.0.0.1", port=5000, debug=False)
    else:
        run_all()
