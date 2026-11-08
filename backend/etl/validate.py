"""
validate.py  -  Validation step between Transform and Load
Each row is checked with the Pydantic model. Valid rows continue;
invalid rows are separated with the reason(s) written next to them.
"""
from collections import Counter
import pandas as pd
from pydantic import ValidationError
from backend.models.schemas import HouseRecord, RULE_SUMMARY


def validate(df):
    """Return (valid_df, rejected_df, report_dict)."""
    rejected_index, reasons = [], {}
    errors_by_field = Counter()

    # Go through the table row by row
    for idx, record in zip(df.index, df.to_dict("records")):
        try:
            HouseRecord.model_validate(record)
        except ValidationError as exc:
            messages = []
            for err in exc.errors():
                field = err["loc"][0] if err["loc"] else "record"
                errors_by_field[str(field)] += 1
                messages.append(f"{field}: {err['msg']}")
            rejected_index.append(idx)
            reasons[idx] = "; ".join(messages)

    rejected_df = df.loc[rejected_index].copy()
    rejected_df["error_reason"] = rejected_df.index.map(reasons)
    valid_df = df.drop(index=rejected_index).reset_index(drop=True)
    rejected_df = rejected_df.reset_index(drop=True)

    print(f"[VALIDATE] {len(valid_df)} valid, {len(rejected_df)} rejected")
    report = {
        "checked": int(len(df)),
        "passed": int(len(valid_df)),
        "failed": int(len(rejected_df)),
        "errors_by_field": dict(errors_by_field),
        "rules": RULE_SUMMARY,
    }
    return valid_df, rejected_df, report
