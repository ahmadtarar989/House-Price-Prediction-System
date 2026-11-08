"""
app.py  -  small Flask backend
Serves the dashboard (frontend/) and a few JSON endpoints that read the
REAL results produced by the ETL and EDA code.
"""
import json
import sqlite3
from flask import Flask, jsonify, request, send_from_directory

from config import (FRONTEND_DIR, VIS_DIR, ETL_REPORT, EDA_REPORT,
                    DB_PATH, DB_TABLE, REJECTED_TABLE)

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
NOT_READY = {"error": "Results not found. Click 'Run pipeline' or run: python main.py"}


def read_json(path):
    if not path.exists():
        return None
    with open(path) as fh:
        return json.load(fh)


def query(sql, params=()):
    """Run a SELECT on the SQLite database -> (column_names, rows)."""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute(sql, params)
        return [d[0] for d in cur.description], cur.fetchall()


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/api/etl")
def api_etl():
    data = read_json(ETL_REPORT)
    return (jsonify(data), 200) if data else (jsonify(NOT_READY), 404)


@app.get("/api/eda")
def api_eda():
    data = read_json(EDA_REPORT)
    return (jsonify(data), 200) if data else (jsonify(NOT_READY), 404)


@app.get("/api/preview")
def api_preview():
    """Sample rows of the cleaned table, with simple paging."""
    if not DB_PATH.exists():
        return jsonify(NOT_READY), 404
    limit = min(max(request.args.get("limit", 10, type=int), 1), 100)
    offset = max(request.args.get("offset", 0, type=int), 0)
    columns, rows = query(f'SELECT * FROM "{DB_TABLE}" LIMIT ? OFFSET ?', (limit, offset))
    total = query(f'SELECT COUNT(*) FROM "{DB_TABLE}"')[1][0][0]
    return jsonify({"columns": columns, "rows": rows, "total": total})


@app.get("/api/rejected")
def api_rejected():
    """Records that failed Pydantic validation, with the reason."""
    if not DB_PATH.exists():
        return jsonify(NOT_READY), 404
    columns, rows = query(
        f'SELECT id, price, bedrooms, bathrooms, sqft_living, error_reason FROM "{REJECTED_TABLE}" LIMIT 100')
    return jsonify({"columns": columns, "rows": rows})


@app.post("/api/run")
def api_run():
    """Run ETL + EDA again from the dashboard button."""
    from main import run_all
    run_all()
    return jsonify({"status": "done"})


EXPLORER_COLS = ["id", "sale_date", "price", "bedrooms", "bathrooms", "sqft_living", "sqft_lot",
                 "floors", "waterfront", "view", "condition", "grade", "sqft_above",
                 "sqft_basement", "yr_built", "yr_renovated", "zipcode", "lat", "long",
                 "sale_year", "sale_month", "house_age", "price_per_sqft"]


@app.get("/explorer")
def explorer_page():
    """Interactive dashboard (Plotly) - works on the cleaned table."""
    return send_from_directory(FRONTEND_DIR, "explorer.html")


@app.get("/api/explorer-data")
def api_explorer_data():
    """Cleaned table in column-wise JSON (small and fast); the browser filters it live."""
    if not DB_PATH.exists():
        return jsonify(NOT_READY), 404
    cols = ", ".join(f'"{c}"' for c in EXPLORER_COLS)
    names, rows = query(f'SELECT {cols} FROM "{DB_TABLE}"')
    data = {n: [r[i] for r in rows] for i, n in enumerate(names)}
    return jsonify({"columns": names, "n": len(rows), "data": data})


@app.get("/visualizations/<path:name>")
def visualization(name):
    return send_from_directory(VIS_DIR, name)
