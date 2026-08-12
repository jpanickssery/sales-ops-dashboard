"""Renames raw workbook columns to stable snake_case fields and fixes dtypes.

Downstream code (aggregate.py, the /ask tool) reads only these normalized
column names, never the raw Excel headers — so a header wording change in
a future workbook version only requires an edit here.
"""

import html
import re

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


def empty_workbook_sheets() -> dict[str, pd.DataFrame]:
    """Placeholder tabs for pipeline.process_hubspot() when no workbook file
    is present (e.g. a code-only clone with no 01-Docs/ -- see
    app/README.md's "Known limitations"). Each frame carries the real raw
    header names so normalize_open_deals/normalize_line_items/
    normalize_sellers/normalize_hygiene rename them into the usual output
    columns with zero rows, rather than crashing on a missing column --
    aggregate.py then needs no special-casing for the no-workbook path.
    """
    return {
        "Open Deals (Data)": pd.DataFrame(columns=list(_OPEN_DEALS_RENAME.keys())),
        "Line Items (Data)": pd.DataFrame(columns=list(_LINE_ITEMS_RENAME.keys())),
        "Seller Performance": pd.DataFrame(columns=list(_SELLER_RENAME.keys())),
        "Sales Hygiene": pd.DataFrame(columns=list(_HYGIENE_RENAME.keys())),
    }


# ---------------------------------------------------------------------------
# HubSpot raw-pull normalization (app/hubspot-data/, see its README.md).
#
# HubSpot is the authoritative source for open deals and FY27 closed deals.
# Output columns match _OPEN_DEALS_RENAME / _CLOSED_DEALS_RENAME above so
# aggregate.py's rollups work unchanged regardless of source. Probability and
# weighted revenue aren't raw HubSpot fields -- they're computed here from
# forecast_cat using the same model the workbook used (Methodology tab):
# Pipeline 0% / Developing 30% / Upside·Pre-Commit 70% / Committed 100%.
# ---------------------------------------------------------------------------

# HubSpot's hs_manual_forecast_category option labels use "Pre-Commit"; the
# spreadsheet's (and the rest of this app's -- see forecastBadge in app.js)
# vocabulary is "Upside". Remapped to "Upside" right after resolving the
# option label so forecast_cat reads identically regardless of source.
_FORECAST_CAT_SYNONYMS = {
    "Pre-Commit": "Upside",
    "Not forecasted": "Pipeline",
    "Closed won": "Committed",
}

FORECAST_PROBABILITY = {
    "Pipeline": 0.0,
    "Developing": 0.3,
    "Upside": 0.7,
    "Committed": 1.0,
}

_HUBSPOT_MONTH_PROPS = [
    ("rev_apr_fy27", "Apr"), ("rev_may_fy27", "May"), ("rev_jun_fy27", "Jun"),
    ("rev_jul_fy27", "Jul"), ("rev_aug_fy27", "Aug"), ("rev_sep_fy27", "Sep"),
    ("rev_oct_fy27", "Oct"), ("rev_nov_fy27", "Nov"), ("rev_dec_fy27", "Dec"),
    ("rev_jan_fy27", "Jan"), ("rev_feb_fy27", "Feb"), ("rev_mar_fy27", "Mar"),
]

_QUARTER_MONTHS = {
    "q1": ["Apr", "May", "Jun"],
    "q2": ["Jul", "Aug", "Sep"],
    "q3": ["Oct", "Nov", "Dec"],
    "q4": ["Jan", "Feb", "Mar"],
}

# New deal-detail-page attribute groups sourced only from the HubSpot pull
# (not present in the spreadsheet). Maps raw HubSpot property -> normalized
# column name.
_HUBSPOT_EXTRA_RENAME = {
    "hs_next_step": "next_step",
    "notes_last_contacted": "last_contacted",
    "notes_last_updated": "last_activity_date",
    "notes_next_activity_date": "next_activity_date",
    "num_notes": "num_activities",
    "num_contacted_notes": "num_contacts_touched",
    "hs_is_stalled": "is_stalled",
    "hs_deal_score": "deal_score",
    "primary_competitor__c": "competitor",
    "who_did_we_lose_to_competitor__c": "lost_to_competitor",
    "win_remarks__c": "win_remarks",
    "win_probability__c": "win_probability_pct",
    "closed_lost_reason": "closed_lost_reason",
    "approval_tier": "approval_tier",
    "contract_duration_months__c": "contract_duration_months",
    "start_date__c": "contract_start_date",
    "end_date__c": "contract_end_date",
    "first_invoice_date__c": "first_invoice_date",
    "go_live_date__c": "go_live_date",
    "lead_source": "lead_source",
    "industry_vertical__c": "industry_vertical",
    "solution_veritical": "solution_vertical",
    "functional_area__c": "functional_area",
    "technology__c": "technology",
}

_HUBSPOT_DATE_COLS = [
    "close_date", "last_contacted", "last_activity_date", "next_activity_date",
    "contract_start_date", "contract_end_date", "first_invoice_date", "go_live_date",
]

_HUBSPOT_NUMERIC_COLS = [
    "deal_score", "win_probability_pct", "num_activities",
    "num_contacts_touched", "contract_duration_months",
]


def _hubspot_num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _hubspot_bool(v) -> bool:
    return str(v).strip().lower() == "true"


_HTML_TAG_RE = re.compile(r"<[^>]+>")

# hs_next_step (and occasionally other free-text notes fields) is a rich-text
# HubSpot field -- some deals carry literal <p>/<br> markup in it, which
# would otherwise render as visible tag soup on the deal detail page.
_HUBSPOT_RICH_TEXT_COLS = ["next_step", "win_remarks", "closed_lost_reason"]


def _strip_html(v):
    # A column that's 100% None across every row in this pull (e.g.
    # closed_lost_reason on open deals) gets cast to float NaN by pandas,
    # not left as None -- pd.isna() is what actually catches that, `is None`
    # doesn't, and str(nan) -> "nan" would otherwise render as literal text.
    if pd.isna(v):
        return None
    text = _HTML_TAG_RE.sub(" ", str(v))
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip() or None


def _normalize_hubspot_common(records: list[dict]) -> pd.DataFrame:
    """Fields and derived columns shared by open and closed HubSpot pulls."""
    rows = []
    for r in records:
        row = {
            "hs_object_id": str(r.get("hs_object_id")),
            "company": r.get("company_name"),
            "deal_name": r.get("dealname"),
            "target_deal_raw": r.get("target_deal"),
            "owner": r.get("owner_name"),
            "region": r.get("region"),
            "obu": r.get("obu"),
            "deal_type": r.get("dealtype"),
            "stage": r.get("dealstage_name"),
            "forecast_cat": r.get("forecast_category"),
            "close_date": r.get("closedate"),
            "tcv": _hubspot_num(r.get("hs_tcv")) or 0.0,
            "acv": _hubspot_num(r.get("hs_acv")) or 0.0,
            "service_line": r.get("service_line"),
            "partner": r.get("partner_account__c"),
            "solution_accelerator": r.get("accelerators"),
            "portfolio": r.get("portfolio"),
            "source": r.get("deal_source"),
        }
        for raw_col, short_name in _HUBSPOT_MONTH_PROPS:
            row[f"m_{short_name}"] = _hubspot_num(r.get(raw_col)) or 0.0
        for raw_col, out_col in _HUBSPOT_EXTRA_RENAME.items():
            row[out_col] = _hubspot_bool(r.get(raw_col)) if out_col == "is_stalled" else r.get(raw_col)
        rows.append(row)

    df = pd.DataFrame(rows)
    df["region"] = df["region"].fillna("NA")
    df["forecast_cat"] = df["forecast_cat"].replace(_FORECAST_CAT_SYNONYMS)
    for col in _HUBSPOT_RICH_TEXT_COLS:
        df[col] = df[col].apply(_strip_html)
    for col in _HUBSPOT_DATE_COLS:
        df[col] = pd.to_datetime(df[col], errors="coerce", utc=True).dt.tz_localize(None)
    for col in _HUBSPOT_NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col].apply(_hubspot_num), errors="coerce")

    for q, months in _QUARTER_MONTHS.items():
        df[f"{q}_rev"] = sum(df[f"m_{m}"] for m in months)
    df["fy27_revenue"] = df["q1_rev"] + df["q2_rev"] + df["q3_rev"] + df["q4_rev"]

    df["probability"] = df["forecast_cat"].map(FORECAST_PROBABILITY).fillna(0.0)
    for q in _QUARTER_MONTHS:
        df[f"{q}_weighted"] = df[f"{q}_rev"] * df["probability"]
    df["weighted_fy27"] = df["fy27_revenue"] * df["probability"]

    df["segment"] = df["tcv"].apply(lambda v: "Large" if v >= LARGE_DEAL_THRESHOLD else "Standard")
    return df


def normalize_open_deals_hubspot(records: list[dict]) -> pd.DataFrame:
    df = _normalize_hubspot_common(records)
    df["target_deal"] = df["target_deal_raw"].astype(str).str.strip().str.lower().eq("yes")
    df = df.drop(columns=["target_deal_raw"])
    # Filled in by merge_spreadsheet_extras() if a spreadsheet is available;
    # HubSpot has no equivalent property for this (see hubspot-data/README.md).
    df["del_org"] = None
    return df


def normalize_closed_deals_hubspot(records: list[dict]) -> pd.DataFrame:
    df = _normalize_hubspot_common(records)
    df = df.drop(columns=["target_deal_raw"])
    df["won"] = df["stage"] == "Stage 5 - Won"
    df["outcome"] = df["won"].map({True: "Won", False: "Lost"})
    return df


def normalize_companies_hubspot(records: list[dict]) -> pd.DataFrame:
    """Normalizes the "master customer" company pull (see
    app/hubspot-data/README.md) -- companies where lifecyclestage=customer OR
    previous_client_date_added__c is set. total_revenue/revenue_fy2027/
    revenue_fy2028/num_open_deals/num_won_deals are HubSpot-computed rollups,
    not calculated here. service_lines is derived (FY27-scoped, see README's
    "Known gaps" section) and already resolved in the raw pull.
    """
    rows = []
    for r in records:
        num_deals = _hubspot_num(r.get("num_associated_deals")) or 0.0
        # HubSpot's actual property names, not the guessed snake_case below --
        # confirmed against a raw pull on 2026-08-12 (see hubspot-data/README.md).
        num_open = _hubspot_num(r.get("hs_num_open_deals")) or 0.0
        num_won = _hubspot_num(r.get("number_of_won_deals")) or 0.0
        num_lost = max(num_deals - num_open - num_won, 0.0)
        account_sales_tier = r.get("account_sales_tier__c")
        is_previous = bool(r.get("previous_client_date_added__c")) or account_sales_tier == "Previous Client"
        rows.append({
            "hs_object_id": r.get("hs_object_id"),
            "company": r.get("name"),
            "owner": r.get("owner_name"),
            "country": r.get("country"),
            "industry": r.get("industry"),
            "icp_tier": r.get("hs_ideal_customer_profile"),
            "account_sales_tier": account_sales_tier,
            "business_unit": r.get("originating_business_unit__c"),
            "is_current": r.get("lifecyclestage") == "customer",
            "is_previous": is_previous,
            "num_contacts": _hubspot_num(r.get("num_associated_contacts")),
            "num_open_deals": num_open,
            "num_deals": num_deals,
            "num_won_deals": num_won,
            "num_lost_deals": num_lost,
            "total_revenue": _hubspot_num(r.get("total_revenue")) or 0.0,
            "revenue_fy27": _hubspot_num(r.get("revenue_fy2027")) or 0.0,
            "revenue_fy28": _hubspot_num(r.get("revenue_fy2028")) or 0.0,
            "annual_revenue": _hubspot_num(r.get("annualrevenue")),
            "service_lines": r.get("service_lines") or [],
        })
    df = pd.DataFrame(rows)
    df["country"] = df["country"].fillna("Unknown")
    df["industry"] = df["industry"].fillna("Unknown")
    return df


def merge_spreadsheet_extras(
    hubspot_open_deals: pd.DataFrame,
    spreadsheet_open_deals: pd.DataFrame,
    extra_cols: list[str] = ["del_org", "obu"],
) -> tuple[pd.DataFrame, dict]:
    """Best-effort enriches the HubSpot-primary open_deals table with columns
    that only exist in the spreadsheet (Del Org has no HubSpot property at
    all; OBU exists as a HubSpot property but is populated on ~0% of deals
    there vs. consistently in the spreadsheet, so it's treated the same way).
    Matched on (company, deal_name) since the spreadsheet carries no HubSpot
    deal ID -- HubSpot data and row order are otherwise untouched. Returns the
    merged frame plus match-rate stats for the "extras" panel in meta.
    """

    def _key(df: pd.DataFrame) -> pd.Series:
        return (
            df["company"].astype(str).str.strip().str.lower()
            + "||"
            + df["deal_name"].astype(str).str.strip().str.lower()
        )

    donor = spreadsheet_open_deals.copy()
    donor["_match_key"] = _key(donor)
    donor = donor.drop_duplicates(subset="_match_key", keep="first")
    donor_cols = donor.set_index("_match_key")[extra_cols]

    out = hubspot_open_deals.copy()
    out["_match_key"] = _key(out)
    matched = out["_match_key"].isin(donor_cols.index)
    for col in extra_cols:
        out[col] = out["_match_key"].map(donor_cols[col])
    out = out.drop(columns=["_match_key"])

    stats = {
        "matchedRows": int(matched.sum()),
        "unmatchedRows": int((~matched).sum()),
        "totalRows": int(len(out)),
        "matchedPct": float(matched.mean()) if len(out) else 0.0,
        "extraColumns": extra_cols,
    }
    return out, stats
