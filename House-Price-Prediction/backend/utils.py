"""
utils.py
Small NumPy helpers shared by the ETL (transform) and the EDA code.
"""
import numpy as np


def iqr_bounds(values, k=1.5):
    """Return (lower, upper) outlier limits using the IQR rule.

    IQR = Q3 - Q1.  A value is an outlier if it is below Q1 - 1.5*IQR
    or above Q3 + 1.5*IQR.
    """
    arr = np.asarray(values, dtype=float)
    arr = arr[~np.isnan(arr)]                  # ignore missing values
    q1, q3 = np.percentile(arr, [25, 75])      # NumPy computes the quartiles
    iqr = q3 - q1
    return q1 - k * iqr, q3 + k * iqr


def iqr_outlier_mask(series):
    """True for every row of a pandas Series that is an IQR outlier."""
    lower, upper = iqr_bounds(series.to_numpy())
    return (series < lower) | (series > upper)
