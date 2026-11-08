"""
analysis.py  -  Exploratory Data Analysis (EDA)
Reads the cleaned data FROM THE DATABASE (as in the proposal), computes
statistics, draws charts into /visualizations and saves a JSON report
that the frontend dashboard displays.
"""
import json
import sqlite3
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")                      # draw to files, no window needed
import matplotlib.pyplot as plt
import seaborn as sns

from config import DB_PATH, DB_TABLE, VIS_DIR, EDA_REPORT, OUTPUT_DIR, TARGET
from backend.utils import iqr_bounds

BLUE = "#1d4f7a"
sns.set_theme(style="whitegrid")

# Columns used in the charts (only those that exist in the data are used)
KEY_NUMERIC = ["price", "log_price", "sqft_living", "sqft_lot", "house_age", "price_per_sqft"]
DISCRETE = ["bedrooms", "floors", "waterfront", "view", "condition", "grade"]
BOX_COLS = ["price", "sqft_living", "sqft_lot", "bedrooms", "bathrooms", "house_age"]
LOG_AXIS = {"price", "sqft_lot"}           # very skewed -> log scale makes them readable
# Columns calculated FROM price (would give a fake correlation) or just labels/ids
NOT_FOR_CORR = {"id", "zipcode_code", "price_outlier", "sale_year", "sale_month",
                "log_price", "price_per_sqft"}


def _num(x):
    """Convert NumPy numbers to plain Python numbers (NaN -> None) for JSON."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return x.item() if hasattr(x, "item") else x


def _save(fig, charts, name, title, caption, section):
    fig.tight_layout()
    fig.savefig(VIS_DIR / name, dpi=110)
    plt.close(fig)
    charts.append({"file": name, "title": title, "caption": caption, "section": section})


def load_clean_data():
    """Read the cleaned table from SQLite."""
    if not DB_PATH.exists():
        raise FileNotFoundError("Database not found. Run the ETL first: python main.py etl")
    with sqlite3.connect(DB_PATH) as conn:
        return pd.read_sql(f'SELECT * FROM "{DB_TABLE}"', conn, parse_dates=["sale_date"],
                           dtype={"zipcode": str})


# ---------------------------------------------------------------- tables
def overview_tables(df):
    columns = [{"column": c, "dtype": str(df[c].dtype), "non_null": int(df[c].notna().sum()),
                "unique": int(df[c].nunique())} for c in df.columns]
    desc = df.describe(include="number").T                         # count, mean, std, min, 25%, 50%, 75%, max
    stats = [{"column": c, "mean": _num(r["mean"]), "median": _num(r["50%"]), "std": _num(r["std"]),
              "min": _num(r["min"]), "max": _num(r["max"])} for c, r in desc.iterrows()]
    return columns, stats


def missing_analysis(df):
    counts = df.isnull().sum().to_numpy()
    percent = np.round(counts / len(df) * 100, 2)
    return [{"column": c, "missing": int(n), "percent": float(p), "significant": bool(p > 5)}
            for c, n, p in zip(df.columns, counts, percent)]


def duplicate_analysis(df):
    full = int(df.duplicated().sum())
    ids = int(df.duplicated("id").sum()) if "id" in df else 0
    return {"full_row_duplicates": full, "full_row_percent": round(full / len(df) * 100, 2),
            "repeated_ids": ids, "repeated_ids_percent": round(ids / len(df) * 100, 2)}


def categorical_summary(df):
    rows = []
    for col in [c for c in DISCRETE + ["zipcode"] if c in df]:
        vc = df[col].value_counts()
        rows.append({"column": col, "unique": int(vc.size), "most_common": str(vc.index[0]),
                     "count": int(vc.iloc[0]), "percent": round(float(vc.iloc[0] / len(df) * 100), 1)})
    return rows


def outlier_table(df):
    rows = []
    for col in [c for c in ["price", "sqft_living", "sqft_lot", "bedrooms", "bathrooms", "sqft_above",
                            "sqft_basement", "sqft_living15", "sqft_lot15", "house_age"] if c in df]:
        lower, upper = iqr_bounds(df[col].to_numpy())
        mask = (df[col] < lower) | (df[col] > upper)
        rows.append({"column": col, "lower": round(float(lower), 2), "upper": round(float(upper), 2),
                     "count": int(mask.sum()), "percent": round(float(mask.mean() * 100), 2),
                     "max": _num(df[col].max())})
    return rows


def correlation_with_target(df):
    cols = [c for c in df.select_dtypes("number").columns if c not in NOT_FOR_CORR]
    corr = pd.DataFrame(np.corrcoef(df[cols].to_numpy().T), index=cols, columns=cols)   # NumPy
    return corr, corr[TARGET].drop(TARGET).sort_values(ascending=False)


# ---------------------------------------------------------------- charts
def chart_distributions(df, charts):
    cols = [c for c in KEY_NUMERIC if c in df]
    fig, axes = plt.subplots(2, 3, figsize=(13, 7))
    for ax, col in zip(axes.ravel(), cols):
        sns.histplot(df[col], bins=40, ax=ax, color=BLUE, log_scale=(col == "sqft_lot"))
        ax.set_title(col)
        ax.set_xlabel("")
    for ax in axes.ravel()[len(cols):]:
        ax.axis("off")
    _save(fig, charts, "distributions.png", "Distribution of key numeric variables",
          "Price and price_per_sqft are right-skewed (a few very expensive homes); log_price is closer to "
          "symmetric. sqft_lot is drawn on a log axis because a few lots are huge.", "distribution")


def chart_categories(df, charts):
    cols = [c for c in DISCRETE if c in df]
    fig, axes = plt.subplots(2, 3, figsize=(13, 7))
    for ax, col in zip(axes.ravel(), cols):
        vc = df[col].value_counts().sort_index()
        ax.bar(vc.index.astype(str), vc.values, color=BLUE)
        ax.set_title(col)
        ax.tick_params(axis="x", labelsize=8)
    for ax in axes.ravel()[len(cols):]:
        ax.axis("off")
    _save(fig, charts, "category_counts.png", "Frequency of discrete features",
          "These columns hold a small set of values (counts, ratings), so they are analysed like categories.",
          "categorical")

    top = df["zipcode"].value_counts().head(15).sort_values()
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(top.index, top.values, color=BLUE)
    ax.set_xlabel("Number of sales")
    _save(fig, charts, "zipcode_counts.png", "15 most common zipcodes",
          "Zipcode is the only text-type category in this dataset.", "categorical")


def chart_correlation(df, charts):
    corr, with_target = correlation_with_target(df)
    fig, ax = plt.subplots(figsize=(11, 9))
    sns.heatmap(corr, cmap="vlag", center=0, annot=True, fmt=".2f", annot_kws={"size": 6.5},
                linewidths=0.4, ax=ax, cbar_kws={"shrink": 0.8})
    _save(fig, charts, "correlation_heatmap.png", "Correlation heatmap",
          "Pearson correlation between numeric columns (computed with NumPy). "
          "Columns derived from price are left out.", "correlation")

    fig, ax = plt.subplots(figsize=(8, 6))
    s = with_target.sort_values()
    ax.barh(s.index, s.values, color=[BLUE if v >= 0 else "#a8641b" for v in s.values])
    ax.set_xlabel(f"Correlation with {TARGET}")
    _save(fig, charts, "correlation_with_price.png", f"Correlation of each feature with {TARGET}",
          "Longer bars mean a stronger linear relationship with price.", "correlation")
    return with_target


def chart_outliers(df, charts):
    cols = [c for c in BOX_COLS if c in df]
    fig, axes = plt.subplots(2, 3, figsize=(13, 6))
    for ax, col in zip(axes.ravel(), cols):
        sns.boxplot(x=df[col], ax=ax, color="#9db8d0", fliersize=2)
        if col in LOG_AXIS:
            ax.set_xscale("log")
        ax.set_title(col)
        ax.set_xlabel("")
    _save(fig, charts, "boxplots.png", "Box plots for outlier detection",
          "Points beyond the whiskers are IQR outliers. Price and sqft_lot use a log axis.", "outliers")


def chart_relationships(df, charts):
    fig, ax = plt.subplots(figsize=(8, 5.5))
    ax.scatter(df["sqft_living"], df["price"], s=5, alpha=0.25, color=BLUE)
    ax.set_xlabel("sqft_living")
    ax.set_ylabel("price")
    _save(fig, charts, "price_vs_sqft_living.png", "Price vs living area",
          "Price rises with living area, and the spread widens for larger homes.", "relationships")

    fig, ax = plt.subplots(figsize=(8, 5))
    g = df.groupby("grade")["price"].median()
    ax.bar(g.index.astype(str), g.values, color=BLUE)
    ax.set_xlabel("grade")
    ax.set_ylabel("median price")
    _save(fig, charts, "price_by_grade.png", "Median price by grade",
          "Better construction grade goes with higher prices.", "relationships")

    g = df.groupby("zipcode")["price"].agg(["median", "count"])
    g = g[g["count"] >= 30].sort_values("median", ascending=False).head(10).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(g.index, g["median"], color=BLUE)
    ax.set_xlabel("median price")
    _save(fig, charts, "price_by_zipcode.png", "Top 10 zipcodes by median price",
          "Only zipcodes with at least 30 sales are compared. Location strongly affects price.", "relationships")

    fig, ax = plt.subplots(figsize=(6, 5))
    sns.boxplot(x="waterfront", y="price", data=df, ax=ax, color="#9db8d0")
    ax.set_yscale("log")
    _save(fig, charts, "price_by_waterfront.png", "Price by waterfront (0 = no, 1 = yes)",
          "Log price axis. Waterfront homes are priced higher.", "relationships")


def chart_missing(df, charts):
    m = df.isnull().sum()
    m = m[m > 0]
    if m.empty:
        return          # nothing to draw: no missing values in the cleaned data
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(m.index, m.values, color=BLUE)
    ax.set_ylabel("missing values")
    _save(fig, charts, "missing_values.png", "Missing values per column", "", "quality")


# ---------------------------------------------------------------- findings
def build_findings(df, with_target, outliers):
    f = []
    top = with_target.head(3)
    f.append("Strongest positive correlations with price: " +
             ", ".join(f"{k} ({v:.2f})" for k, v in top.items()) + ".")

    mean, median, skew = df["price"].mean(), df["price"].median(), df["price"].skew()
    f.append(f"Price is right-skewed (skewness {skew:.2f}): mean ${mean:,.0f} is above median ${median:,.0f}, "
             "so log_price was created.")

    p = next((o for o in outliers if o["column"] == "price"), None)
    if p:
        f.append(f"{p['count']} houses ({p['percent']}%) are price outliers by the IQR rule. They are kept "
                 "because they are real expensive homes, not data errors.")

    g = df.groupby("zipcode")["price"].agg(["median", "count"])
    g = g[g["count"] >= 30]
    if not g.empty:
        best, worst = g["median"].idxmax(), g["median"].idxmin()
        f.append(f"Zipcode {best} has the highest median price (${g.loc[best, 'median']:,.0f}); "
                 f"zipcode {worst} has the lowest (${g.loc[worst, 'median']:,.0f}).")

    wf = df.groupby("waterfront")["price"].median()
    if 0 in wf.index and 1 in wf.index:
        f.append(f"Waterfront homes have a median price {wf[1] / wf[0]:.1f} times that of other homes.")

    gr = df.groupby("grade")["price"].median()
    f.append(f"Median price rises from ${gr.iloc[0]:,.0f} at grade {gr.index[0]} "
             f"to ${gr.iloc[-1]:,.0f} at grade {gr.index[-1]}.")

    ids = int(df.duplicated("id").sum())
    if ids:
        f.append(f"{ids} rows are repeat sales of a house already in the data (same id, different date).")
    return f


# ---------------------------------------------------------------- main
def run_eda():
    """Run the whole EDA and write outputs/eda_report.json"""
    VIS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    df = load_clean_data()
    charts = []

    columns, stats = overview_tables(df)
    missing = missing_analysis(df)
    duplicates = duplicate_analysis(df)
    outliers = outlier_table(df)

    chart_missing(df, charts)
    chart_distributions(df, charts)
    chart_categories(df, charts)
    with_target = chart_correlation(df, charts)
    chart_outliers(df, charts)
    chart_relationships(df, charts)

    report = {
        "overview": {"rows": int(df.shape[0]), "columns": int(df.shape[1]),
                     "missing_values": int(df.isnull().sum().sum()),
                     "duplicate_rows": duplicates["full_row_duplicates"],
                     "memory_mb": round(float(df.memory_usage(deep=True).sum() / 1024 ** 2), 2),
                     "target": TARGET},
        "columns": columns, "statistics": stats, "missing": missing, "duplicates": duplicates,
        "categorical": categorical_summary(df),
        "correlation_with_price": [{"column": k, "corr": round(float(v), 3)} for k, v in with_target.items()],
        "outliers": outliers,
        "findings": build_findings(df, with_target, outliers),
        "charts": charts,
    }
    with open(EDA_REPORT, "w") as fh:
        json.dump(report, fh, indent=2)
    print(f"[EDA] {len(charts)} charts saved in {VIS_DIR.name}/, report -> {EDA_REPORT.name}")
    return report
