# House Price Prediction System - Phase-01

**Phase-01: ETL + Exploratory Data Analysis + Dashboard**

## 1. Project objective
Turn the raw King County housing CSV into a clean, validated dataset stored in a database,
then explore it with statistics and charts. The clean data prepares for a price prediction model in a later phase.

## 2. Phase-01 scope
Included: Extract, Transform, Validate (Pydantic), Load (CSV + SQLite), EDA, Flask backend, HTML/CSS/JS dashboard.
Not included: machine learning, prediction, deployment, authentication.

## 3. Technologies
Python, pandas, NumPy, Pydantic, SQLite (built into Python), Matplotlib, Seaborn, Flask, HTML5, CSS3, JavaScript.

## 4. Project structure
```
House-Price-Prediction/
├── config.py                  paths and settings
├── main.py                    runs ETL, EDA and the server
├── requirements.txt
├── data/
│   ├── raw/kc_house_data.csv  input
│   ├── processed/             cleaned_house_prices.csv, rejected_records.csv
│   └── house_prices.db        SQLite database (tables: houses, rejected_records)
├── backend/
│   ├── utils.py               NumPy IQR helpers
│   ├── etl/   extract.py  transform.py  validate.py  load.py
│   ├── eda/   analysis.py
│   ├── models/schemas.py      Pydantic HouseRecord
│   └── app.py                 Flask API + serves the dashboard
├── frontend/                  index.html  style.css  script.js
├── visualizations/            EDA charts (PNG)
└── outputs/                   etl_report.json, eda_report.json (read by the dashboard)
```
To add ML later: create `backend/ml/` and read from the `houses` table or the cleaned CSV.

## 5. How ETL works
Raw CSV -> **Extract** (read, count rows/columns, find missing and duplicates)
-> **Transform** (fix types, remove duplicates, handle missing, add features, flag outliers, encode zipcode;
every step is logged with its reason) -> **Validate** (each row checked by Pydantic; failures go to
`rejected_records.csv` with the reason) -> **Load** (cleaned CSV + SQLite table).

## 6. How EDA works
`analysis.py` reads the cleaned table from the database and produces: overview and statistics, missing values,
duplicates, distributions, category counts, correlation matrix/heatmap, IQR outlier table and box plots,
price relationships, and written key findings. Results go to `outputs/eda_report.json` and `visualizations/`.

## 7. Install
```bash
pip install -r requirements.txt
```

## 8. Run
```bash
python main.py          # ETL + EDA
python main.py etl      # only ETL
python main.py eda      # only EDA (after ETL)
python main.py serve    # start the dashboard
```
Then open **http://127.0.0.1:5000** in your browser. The "Run pipeline" button on the dashboard re-runs ETL + EDA.

## 9. Outputs
- `data/processed/cleaned_house_prices.csv` and table `houses` in `data/house_prices.db`
- `data/processed/rejected_records.csv` and table `rejected_records`
- `visualizations/*.png`
- `outputs/etl_report.json`, `outputs/eda_report.json`

## 10. Future phases
Feature selection and model training (scikit-learn), evaluation, prediction interface, deployment.
