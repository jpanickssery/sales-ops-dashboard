"""Renames raw workbook columns to stable snake_case fields and fixes dtypes.

Downstream code (aggregate.py, the /ask tool) reads only these normalized
column names, never the raw Excel headers — so a header wording change in
a future workbook version only requires an edit here.
"""

import pandas as pd

LARGE_DEAL_THRESHOLD = 10_000_000

_OPEN_DEALS_RENAME = {
    "Company": "company",
    "Deal Name": "deal_name",
    "Target Deal": "target_deal",
    "Owner": "owner",
    "Region": "region",
    "OBU": "obu",
    "Deal Type": "deal_type",
    "Stage": "stage",
    "Forecast Cat.": "forecast_cat",
    "Probability": "probability",
    "Close Date": "close_date",
    "TCV": "tcv",
    "ACV": "acv",
    "Q1 Revenue": "q1_rev",
    "Q2 Revenue": "q2_rev",
    "Q3 Revenue": "q3_rev",
    "Q4 Revenue": "q4_rev",
    "FY27 Revenue": "fy27_revenue",
    "Q1 Weighted": "q1_weighted",
    "Q2 Weighted": "q2_weighted",
    "Q3 Weighted": "q3_weighted",
    "Q4 Weighted": "q4_weighted",
    "Weighted FY27": "weighted_fy27",
    "Portfolio": "portfolio",
    "Service Line": "service_line",
    "Partner": "partner",
    "Solution_Accelerator": "solution_accelerator",
    "Del Org": "del_org",
    "Source": "source",
}

# FY27 runs Apr'26 -> Mar'27; these map to the monthly revenue columns.
MONTH_COLUMNS = [
    ("Apr '26", "Apr"), ("May '26", "May"), ("Jun '26", "Jun"),
    ("Jul '26", "Jul"), ("Aug '26", "Aug"), ("Sep '26", "Sep"),
    ("Oct '26", "Oct"), ("Nov '26", "Nov"), ("Dec '26", "Dec"),
    ("Jan '27", "Jan"), ("Feb '27", "Feb"), ("Mar '27", "Mar"),
]

_CLOSED_DEALS_RENAME = {
    "Company": "company",
    "Deal Name": "deal_name",
    "Owner": "owner",
    "Region": "region",
    "Outcome": "outcome",
    "Deal Type": "deal_type",
    "Stage": "stage",
    "Service Line": "service_line",
    "Portfolio": "portfolio",
    "Close Date": "close_date",
    "TCV": "tcv",
    "FY27 Rev": "fy27_revenue",
    "Source": "source",
    "Solution_Accelerator": "solution_accelerator",
    "OBU": "obu",
}

_LINE_ITEMS_RENAME = {
    "Deal ID": "deal_id",
    "SKU / Product": "sku",
    "Quantity": "quantity",
    "Price": "price",
    "TCV": "tcv",
    "ACV": "acv",
    "Term (mo)": "term_months",
    "Billing Freq": "billing_freq",
    "Created": "created",
    "Currency": "currency",
}

_SELLER_RENAME = {
    "Seller": "seller",
    "Role": "role",
    "Annual Quota": "annual_quota",
    "YTD Attainment": "ytd_attainment",
    "Committed Attainment": "committed_attainment",
    "Region": "region",
    "Total TCV": "total_tcv",
    "FY27 Revenue": "fy27_revenue",
    "1H Rev": "h1_rev",
    "2H Rev": "h2_rev",
    "Weighted FY27": "weighted_fy27",
    "Commit %": "commit_pct",
    "# Deals": "deals",
    "ECEB": "eceb",
    "ECNB": "ecnb",
    "NCNB": "ncnb",
    "# Large Deals": "large_deals",
    "Large FY27 $": "large_fy27",
    "FY27 Won Ytd": "fy27_won_ytd",
    "FY27 Win Rate": "fy27_win_rate",
    "FY27 Deals Won": "fy27_deals_won",
    "FY26 Deals Won": "fy26_deals_won",
    "FY26 Won (FY27 Rev)": "fy26_won_fy27rev",
    "Deal Count": "deal_count",
    "FY26 Win Rate": "fy26_win_rate",
    "FY27 Carry-Forward": "fy27_carry_forward",
}

_HYGIENE_RENAME = {
    "Issues": "issues",
    "Deal Name": "deal_name",
    "Owner": "owner",
    "Stage": "stage",
    "Forecast Cat.": "forecast_cat",
    "TCV": "tcv",
    "Close Date": "close_date",
    "Notes Updated": "notes_updated",
    "Days Stale": "days_stale",
}

_SNAPSHOT_RENAME = {
    "Deal Name": "deal_name",
    "Owner": "owner",
    "Stage": "stage",
    "Forecast Cat.": "forecast_cat",
    "TCV": "tcv",
    "FY27 Rev": "fy27_revenue",
    "Snapshot Label": "snapshot_label",
    "Snapshot Date": "snapshot_label",
}


def _select_rename(df: pd.DataFrame, rename_map: dict[str, str]) -> pd.DataFrame:
    cols = [c for c in rename_map if c in df.columns]
    return df[cols].rename(columns=rename_map)


def normalize_open_deals(df: pd.DataFrame) -> pd.DataFrame:
    out = _select_rename(df, _OPEN_DEALS_RENAME)
    # Region is only populated in the source for non-NA deals — a blank
    # region means NA, not "unknown" (a literal "Unspecified" string is the
    # true data-quality bucket and is left as-is).
    out["region"] = out["region"].fillna("NA")
    out["target_deal"] = out["target_deal"].astype(str).str.lower().eq("yes")
    out["close_date"] = pd.to_datetime(out["close_date"], errors="coerce")
    for col in [
        "tcv", "acv", "fy27_revenue", "weighted_fy27", "probability",
        "q1_rev", "q2_rev", "q3_rev", "q4_rev",
        "q1_weighted", "q2_weighted", "q3_weighted", "q4_weighted",
    ]:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)
    out["segment"] = out["tcv"].apply(
        lambda v: "Large" if v >= LARGE_DEAL_THRESHOLD else "Standard"
    )
    for raw_col, short_name in MONTH_COLUMNS:
        if raw_col in df.columns:
            out[f"m_{short_name}"] = pd.to_numeric(df[raw_col], errors="coerce").fillna(0)
    return out


def normalize_closed_deals(df: pd.DataFrame) -> pd.DataFrame:
    out = _select_rename(df, _CLOSED_DEALS_RENAME)
    # Region is only populated in the source for non-NA deals — a blank
    # region means NA, not "unknown" (a literal "Unspecified" string is the
    # true data-quality bucket and is left as-is).
    out["region"] = out["region"].fillna("NA")
    out["close_date"] = pd.to_datetime(out["close_date"], errors="coerce")
    for col in ["tcv", "fy27_revenue"]:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)
    out["won"] = out["outcome"].astype(str).str.lower().eq("won")
    return out


def normalize_line_items(df: pd.DataFrame) -> pd.DataFrame:
    out = _select_rename(df, _LINE_ITEMS_RENAME)
    for col in ["quantity", "price", "tcv", "acv", "term_months"]:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)
    return out


def normalize_sellers(df: pd.DataFrame) -> pd.DataFrame:
    out = _select_rename(df, _SELLER_RENAME)
    # Region is only populated in the source for non-NA deals — a blank
    # region means NA, not "unknown" (a literal "Unspecified" string is the
    # true data-quality bucket and is left as-is).
    out["region"] = out["region"].fillna("NA")
    numeric_cols = [
        "annual_quota", "ytd_attainment", "committed_attainment", "total_tcv",
        "fy27_revenue", "h1_rev", "h2_rev", "weighted_fy27", "commit_pct",
        "deals", "eceb", "ecnb", "ncnb", "large_deals", "large_fy27",
        "fy27_won_ytd", "fy27_win_rate", "fy27_deals_won", "fy26_deals_won",
        "fy26_won_fy27rev", "deal_count", "fy26_win_rate", "fy27_carry_forward",
    ]
    for col in numeric_cols:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def normalize_hygiene(df: pd.DataFrame) -> pd.DataFrame:
    out = _select_rename(df, _HYGIENE_RENAME)
    out["issues"] = pd.to_numeric(out["issues"], errors="coerce").fillna(0).astype(int)
    out["tcv"] = pd.to_numeric(out["tcv"], errors="coerce").fillna(0)
    out["days_stale"] = pd.to_numeric(out["days_stale"], errors="coerce")
    out["close_date"] = pd.to_datetime(out["close_date"], errors="coerce")
    return out


def normalize_snapshot(df: pd.DataFrame) -> pd.DataFrame:
    out = _select_rename(df, _SNAPSHOT_RENAME)
    out["tcv"] = pd.to_numeric(out["tcv"], errors="coerce").fillna(0)
    out["fy27_revenue"] = pd.to_numeric(out["fy27_revenue"], errors="coerce").fillna(0)
    out["snapshot_label"] = out["snapshot_label"].astype(str)
    return out
