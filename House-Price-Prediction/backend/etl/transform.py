"""
transform.py  -  T of ETL
Cleans the data and creates new features.
Every step adds a line to `log` explaining WHAT was done and WHY.
"""
import numpy as np
import pandas as pd
from backend.utils import iqr_outlier_mask


def _note(log, step, action, reason, rows=0):
    log.append({"step": step, "action": action, "reason": reason, "rows_affected": int(rows)})


# ---------------------------------------------------------------- step 1
def fix_data_types(df, log):
    # 'date' is text like 20141013T000000 -> convert to a real date
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%dT%H%M%S", errors="coerce")
    df = df.rename(columns={"date": "sale_date"})

    # zipcode is a LOCATION LABEL, not a number to do maths on -> text
    df["zipcode"] = df["zipcode"].astype(str).str.zfill(5)

    # Every other column must be numeric; bad values become NaN (handled later)
    for col in df.columns:
        if col not in ("sale_date", "zipcode"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

    _note(log, "Fix data types",
          "date -> datetime (renamed sale_date), zipcode -> text, other columns checked as numeric",
          "Dates must be real dates for time features; zipcode is a category, so averaging it makes no sense.")
    return df


# ---------------------------------------------------------------- step 2
def remove_duplicates(df, log):
    before = len(df)
    df = df.drop_duplicates()
    removed = before - len(df)
    repeated_ids = int(df.duplicated("id").sum())

    _note(log, "Remove duplicates", f"Removed {removed} identical rows",
          "Exact copies add no information and would bias statistics.", removed)
    _note(log, "Keep repeated house ids", f"Kept {repeated_ids} rows whose id appears more than once",
          "The same house sold on different dates is a genuine second sale, not a duplicate record.")
    return df


# ---------------------------------------------------------------- step 3
def handle_missing_values(df, log):
    total_missing = int(df.isnull().sum().sum())

    # Rows without id / price / date are useless -> drop
    before = len(df)
    df = df.dropna(subset=["id", "price", "sale_date"])
    dropped = before - len(df)

    # Other gaps: median for numbers (NumPy nanmedian), mode for text
    filled = 0
    for col in df.columns:
        n_missing = int(df[col].isnull().sum())
        if n_missing == 0:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            df[col] = df[col].fillna(np.nanmedian(df[col].to_numpy(dtype=float)))
        else:
            df[col] = df[col].fillna(df[col].mode()[0])
        filled += n_missing

    if total_missing == 0:
        _note(log, "Missing values", "No missing values found - nothing to fill or drop",
              "The check is still run so the pipeline works on other versions of the data.")
    else:
        _note(log, "Missing values", f"Dropped {dropped} rows, filled {filled} cells (median / mode)",
              "Critical fields cannot be guessed; other gaps are filled with a robust typical value.",
              dropped + filled)
    return df


# ---------------------------------------------------------------- step 4
def add_features(df, log):
    df["sale_year"] = df["sale_date"].dt.year
    df["sale_month"] = df["sale_date"].dt.month

    # Age at sale. np.clip stops negative ages (house sold before it was finished)
    raw_age = df["sale_year"] - df["yr_built"]
    negative = int((raw_age < 0).sum())
    df["house_age"] = np.clip(raw_age, 0, None)

    df["is_renovated"] = (df["yr_renovated"] > 0).astype(int)   # 0 in the file = never renovated
    df["has_basement"] = (df["sqft_basement"] > 0).astype(int)

    # np.where avoids dividing by zero
    df["price_per_sqft"] = np.round(np.where(df["sqft_living"] > 0, df["price"] / df["sqft_living"], np.nan), 2)

    # Price is strongly right-skewed; log makes it closer to a normal shape
    df["log_price"] = np.round(np.log1p(df["price"]), 4)

    _note(log, "Feature engineering",
          "Added sale_year, sale_month, house_age, is_renovated, has_basement, price_per_sqft, log_price",
          "These make patterns easier to see in EDA and are useful inputs for a later prediction model.")
    if negative:
        _note(log, "Fix negative house age", f"house_age set to 0 for {negative} rows",
              "yr_built is later than the sale year (house sold before completion); age cannot be negative.", negative)
    return df


# ---------------------------------------------------------------- step 5
def flag_outliers(df, log):
    df["price_outlier"] = iqr_outlier_mask(df["price"]).astype(int)
    n = int(df["price_outlier"].sum())
    _note(log, "Flag price outliers (IQR)", f"{n} rows flagged in column price_outlier, NOT removed",
          "Expensive houses are real sales (large, waterfront, luxury). Flagging keeps the information; "
          "only impossible values are removed in the validation step.", n)
    return df


# ---------------------------------------------------------------- step 6
def encode_location(df, log):
    df["zipcode_code"] = df["zipcode"].astype("category").cat.codes.astype(int)
    _note(log, "Encode zipcode", "Added zipcode_code (integer label for each zipcode)",
          "Gives a numeric form of the location for later modelling; the original zipcode is kept.")
    return df


# ---------------------------------------------------------------- main
def transform(df):
    """Run all cleaning steps. Returns (clean_df, report_dict)."""
    log = []
    rows_in, cols_in = df.shape
    df = df.copy()

    df = fix_data_types(df, log)
    df = remove_duplicates(df, log)
    df = handle_missing_values(df, log)
    df = add_features(df, log)
    df = flag_outliers(df, log)
    df = encode_location(df, log)
    df = df.reset_index(drop=True)

    print(f"[TRANSFORM] {rows_in} -> {len(df)} rows, {cols_in} -> {df.shape[1]} columns")
    report = {"rows_in": int(rows_in), "rows_out": int(len(df)),
              "columns_in": int(cols_in), "columns_out": int(df.shape[1]), "log": log}
    return df, report
