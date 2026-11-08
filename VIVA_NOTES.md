# Viva notes (simple language)

**ETL** = Extract, Transform, Load: get data, clean it, store it.
- **Extract**: read the CSV with pandas and check size, columns, missing values, duplicates.
- **Transform**: fix data types, remove duplicates, handle missing values, add useful columns (house_age, price_per_sqft, log_price), flag outliers.
- **Validate**: Pydantic checks every row against rules (price > 0, bedrooms >= 1...). Bad rows are separated, not silently lost.
- **Load**: save the good data to a CSV and a SQLite database.

**EDA** (Exploratory Data Analysis) = looking at the clean data with statistics and charts to understand patterns before modelling.

**Why pandas**: tables (DataFrames), reading CSV, grouping, cleaning.
**Why NumPy**: fast maths: quartiles for the IQR rule (np.percentile), np.log1p for log price, np.where / np.clip for safe calculations, np.corrcoef for correlation, np.nanmedian for filling gaps.
**Why Pydantic**: describes a valid record once and gives clear error messages for invalid ones.

**Frontend to backend**: the page (JavaScript) calls Flask URLs such as /api/eda and /api/preview with fetch(); Flask reads the JSON reports and the SQLite database and returns JSON; JavaScript draws cards and tables; charts are PNG files served from /visualizations.

**Files**: config.py (paths) | main.py (runs everything) | extract/transform/validate/load.py (ETL steps) | schemas.py (Pydantic rules) | analysis.py (EDA) | app.py (Flask) | index.html, style.css, script.js (dashboard).
