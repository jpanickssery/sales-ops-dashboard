"""Recomputes every dashboard view's numbers from the normalized tables.

Deliberately mirrors the field names used by the design mockup's data.js so
the frontend can be pointed at this output with minimal changes.
"""

from datetime import datetime, timezone

import pandas as pd

from .normalize import MONTH_COLUMNS


def _num(x) -> float:
    if pd.isna(x):
        return 0.0
    return float(x)


def _int(x) -> int:
    if pd.isna(x):
        return 0
    return int(x)


def build_snapshot(
    open_deals: pd.DataFrame,
    closed_deals: pd.DataFrame,
    line_items: pd.DataFrame,
    sellers: pd.DataFrame,
    hygiene: pd.DataFrame,
    snapshot_history: list[dict],
    refreshed_label: str,
    customers: pd.DataFrame | None = None,
) -> dict:
    return {
        "meta": {
            "refreshed": refreshed_label,
            "source": "HubSpot Integration",
            "openDeals": int(len(open_deals)),
            "closedFY27": int(len(closed_deals)),
            "lineItems": int(len(line_items)),
            "customers": int(len(customers)) if customers is not None else 0,
        },
        "kpis": _build_kpis(open_deals),
        "segments": _build_segments(open_deals),
        "forecastCategories": _build_forecast_categories(open_deals),
        "stages": _build_stages(open_deals),
        "revenueByRegion": _build_group_sum(
            open_deals[open_deals["segment"] == "Standard"], "region", "fy27_revenue"
        ),
        "revenueByDealType": _build_group_sum(
            open_deals[open_deals["segment"] == "Standard"], "deal_type", "fy27_revenue"
        ),
        "monthlyRevenue": _build_monthly_revenue(open_deals),
        "regionalPerformance": _build_regional_performance(
            open_deals[open_deals["segment"] == "Standard"]
        ),
        "salesHygiene": _build_sales_hygiene(hygiene, open_deals),
        "targetDeals": _build_deal_rows(open_deals[open_deals["target_deal"]]),
        "largeDeals": _build_deal_rows(open_deals[open_deals["segment"] == "Large"]),
        "sellers": _build_sellers(sellers, open_deals),
        "quotaTotals": _build_quota_totals(sellers),
        "quotaByRegion": _build_quota_by_region(sellers),
        "closedFY27": _build_closed_fy27(closed_deals),
        "accounts": _build_accounts(open_deals),
        # Same row shape as targetDeals/largeDeals (see _build_deal_rows) so
        # the frontend can present identical columns/filters on all three.
        "dealExplorer": _build_deal_rows(open_deals),
        "closedDealExplorer": _build_closed_deal_rows(closed_deals),
        "customers": build_customers_list(customers) if customers is not None else [],
        "trendSnapshots": snapshot_history,
    }


def _build_kpis(open_deals: pd.DataFrame) -> dict:
    committed = open_deals.loc[open_deals["forecast_cat"] == "Committed", "fy27_revenue"].sum()
    return {
        "openDeals": int(len(open_deals)),
        "totalTCV": _num(open_deals["tcv"].sum()),
        "fy27Revenue": _num(open_deals["fy27_revenue"].sum()),
        "weightedFY27": _num(open_deals["weighted_fy27"].sum()),
        "committed": _num(committed),
        "largeDeals": int((open_deals["segment"] == "Large").sum()),
    }


def _segment_row(name: str, df: pd.DataFrame) -> dict:
    fy27rev = df["fy27_revenue"].sum()
    committed = df.loc[df["forecast_cat"] == "Committed", "fy27_revenue"].sum()
    return {
        "name": name,
        "deals": int(len(df)),
        "tcv": _num(df["tcv"].sum()),
        "fy27rev": _num(fy27rev),
        "weighted": _num(df["weighted_fy27"].sum()),
        "committed": _num(committed),
        "wtdPct": _num(df["weighted_fy27"].sum() / fy27rev) if fy27rev else 0.0,
    }


def _build_segments(open_deals: pd.DataFrame) -> list[dict]:
    standard = open_deals[open_deals["segment"] == "Standard"]
    large = open_deals[open_deals["segment"] == "Large"]
    return [
        _segment_row("Standard (<$10M TCV)", standard),
        _segment_row("Large (≥$10M TCV)", large),
        _segment_row("TOTAL", open_deals),
    ]


def _build_forecast_categories(open_deals: pd.DataFrame) -> list[dict]:
    standard = open_deals[open_deals["segment"] == "Standard"]
    grouped = standard.groupby("forecast_cat", dropna=False)
    rows = []
    for name, g in grouped:
        rows.append({
            "name": str(name),
            "deals": int(len(g)),
            "tcv": _num(g["tcv"].sum()),
            "fy27rev": _num(g["fy27_revenue"].sum()),
            "weighted": _num(g["weighted_fy27"].sum()),
        })
    rows.sort(key=lambda r: r["tcv"], reverse=True)
    return rows


def _build_stages(open_deals: pd.DataFrame) -> list[dict]:
    standard = open_deals[open_deals["segment"] == "Standard"]
    grouped = standard.groupby("stage", dropna=False)
    rows = []
    for name, g in grouped:
        fy27rev = g["fy27_revenue"].sum()
        rows.append({
            "name": str(name),
            "deals": int(len(g)),
            "tcv": _num(g["tcv"].sum()),
            "fy27rev": _num(fy27rev),
            "weighted": _num(g["weighted_fy27"].sum()),
            "avgProb": _num(g["probability"].mean()) if len(g) else 0.0,
        })
    rows.sort(key=lambda r: str(r["name"]))
    return rows


def _build_group_sum(df: pd.DataFrame, key: str, value: str) -> list[dict]:
    grouped = df.groupby(key, dropna=False)[value].sum().sort_values(ascending=False)
    return [{"name": str(name), "value": _num(v)} for name, v in grouped.items()]


def _build_monthly_revenue(open_deals: pd.DataFrame) -> list[dict]:
    standard = open_deals[open_deals["segment"] == "Standard"]
    rows = []
    for _, short_name in MONTH_COLUMNS:
        col = f"m_{short_name}"
        value = _num(standard[col].sum()) if col in standard.columns else 0.0
        rows.append({"month": short_name, "value": value})
    return rows


def _build_regional_performance(open_deals: pd.DataFrame) -> list[dict]:
    grouped = open_deals.groupby("region", dropna=False)
    rows = []
    for name, g in grouped:
        fy27rev = g["fy27_revenue"].sum()
        weighted = g["weighted_fy27"].sum()
        rows.append({
            "region": str(name),
            "deals": int(len(g)),
            "tcv": _num(g["tcv"].sum()),
            "fy27rev": _num(fy27rev),
            "weighted": _num(weighted),
            "wtdPct": _num(weighted / fy27rev) if fy27rev else 0.0,
        })
    rows.sort(key=lambda r: r["fy27rev"], reverse=True)
    return rows


def _build_sales_hygiene(hygiene: pd.DataFrame, open_deals: pd.DataFrame) -> dict:
    # Sales Hygiene is parsed from its own sheet (not row-aligned with Open
    # Deals), so match back to a deal's row position by name to link to the
    # deal detail page. Best-effort: first match wins on duplicate names.
    name_to_id: dict[str, int] = {}
    for idx, name in open_deals["deal_name"].items():
        name_to_id.setdefault(name, int(idx))

    clean = int((hygiene["issues"] == 0).sum())
    minor = int(hygiene["issues"].between(1, 2).sum())
    critical = int((hygiene["issues"] >= 3).sum())
    flags = hygiene.sort_values(["issues", "days_stale"], ascending=[False, False])
    flag_rows = []
    for _, r in flags.iterrows():
        days_stale = r["days_stale"]
        flag_rows.append({
            "dealId": name_to_id.get(r["deal_name"]),
            "issues": int(r["issues"]),
            "deal": str(r["deal_name"]),
            "owner": "" if pd.isna(r["owner"]) else str(r["owner"]),
            "stage": "" if pd.isna(r["stage"]) else str(r["stage"]),
            "tcv": _num(r["tcv"]),
            "closeDate": None if pd.isna(r["close_date"]) else r["close_date"].date().isoformat(),
            "daysStale": None if pd.isna(days_stale) else int(days_stale),
        })
    return {
        "totalEvaluated": int(len(hygiene)),
        "clean": clean,
        "minor": minor,
        "critical": critical,
        "flags": flag_rows,
    }


def _build_deal_rows(df: pd.DataFrame) -> list[dict]:
    rows = []
    for idx, r in df.iterrows():
        rows.append({
            "id": int(idx),
            "company": str(r["company"]),
            "deal": str(r["deal_name"]),
            "owner": "" if pd.isna(r["owner"]) else str(r["owner"]),
            "region": str(r["region"]),
            "dealType": "" if pd.isna(r["deal_type"]) else str(r["deal_type"]),
            "serviceLine": "" if pd.isna(r["service_line"]) else str(r["service_line"]),
            "portfolio": "" if pd.isna(r["portfolio"]) else str(r["portfolio"]),
            "partner": "" if pd.isna(r["partner"]) else str(r["partner"]),
            "solutionAccelerator": "" if pd.isna(r["solution_accelerator"]) else str(r["solution_accelerator"]),
            "stage": "" if pd.isna(r["stage"]) else str(r["stage"]),
            "forecastCat": "" if pd.isna(r["forecast_cat"]) else str(r["forecast_cat"]),
            "tcv": _num(r["tcv"]),
            "acv": _num(r["acv"]),
            "fy27rev": _num(r["fy27_revenue"]),
            "q2rev": _num(r["q2_rev"]),
            "q3rev": _num(r["q3_rev"]),
            "q4rev": _num(r["q4_rev"]),
            "closeDate": None if pd.isna(r["close_date"]) else r["close_date"].date().isoformat(),
        })
    return rows


def _build_closed_deal_rows(df: pd.DataFrame) -> list[dict]:
    # Same shape as _build_deal_rows (region/quarter/forecast/dealType/owner/
    # portfolio/serviceLine/partner/solutionAccelerator filters + sortable
    # tcv/acv/fy27rev/q2-4rev columns work identically on the Closed Deals
    # page), plus outcome/won for the Won-vs-Lost filter. forecastCat/acv/
    # quarterly revenue only exist when this table came from the HubSpot
    # pull (see normalize.normalize_closed_deals_hubspot) -- on a
    # workbook-only snapshot these columns are absent and .get() returns None.
    rows = []
    for idx, r in df.iterrows():
        rows.append({
            "id": int(idx),
            "company": str(r["company"]),
            "deal": str(r["deal_name"]),
            "owner": "" if pd.isna(r["owner"]) else str(r["owner"]),
            "region": str(r["region"]),
            "outcome": str(r["outcome"]),
            "won": bool(r["won"]),
            "dealType": "" if pd.isna(r["deal_type"]) else str(r["deal_type"]),
            "serviceLine": "" if pd.isna(r["service_line"]) else str(r["service_line"]),
            "portfolio": "" if pd.isna(r["portfolio"]) else str(r["portfolio"]),
            "partner": "" if pd.isna(r.get("partner")) else str(r.get("partner")),
            "solutionAccelerator": "" if pd.isna(r["solution_accelerator"]) else str(r["solution_accelerator"]),
            "stage": "" if pd.isna(r["stage"]) else str(r["stage"]),
            "forecastCat": "" if pd.isna(r.get("forecast_cat")) else str(r.get("forecast_cat")),
            "tcv": _num(r["tcv"]),
            "acv": _num(r.get("acv")),
            "fy27rev": _num(r["fy27_revenue"]),
            "q2rev": _num(r.get("q2_rev")),
            "q3rev": _num(r.get("q3_rev")),
            "q4rev": _num(r.get("q4_rev")),
            "closeDate": None if pd.isna(r["close_date"]) else r["close_date"].date().isoformat(),
        })
    return rows


def _build_sellers(sellers: pd.DataFrame, open_deals: pd.DataFrame) -> list[dict]:
    # Total ACV isn't a column the workbook's Seller Performance tab carries
    # -- computed here the same way the tab itself derives Total TCV: summed
    # from that seller's rows in Open Deals (Data).
    acv_by_owner = open_deals.groupby("owner")["acv"].sum()

    rows = []
    for idx, r in sellers.iterrows():
        rows.append({
            "id": int(idx),
            "name": str(r["seller"]),
            "role": "" if pd.isna(r["role"]) else str(r["role"]),
            "region": str(r["region"]),
            "annualQuota": None if pd.isna(r["annual_quota"]) else _num(r["annual_quota"]),
            "ytdAttainment": None if pd.isna(r["ytd_attainment"]) else _num(r["ytd_attainment"]),
            "committedAttainment": None if pd.isna(r["committed_attainment"]) else _num(r["committed_attainment"]),
            "commitPct": _num(r["commit_pct"]),
            "deals": _int(r["deals"]),
            "eceb": _int(r["eceb"]),
            "ecnb": _int(r["ecnb"]),
            "ncnb": _int(r["ncnb"]),
            "largeDeals": _int(r["large_deals"]),
            "largeFy27": _num(r["large_fy27"]),
            "totalAcv": _num(acv_by_owner.get(r["seller"], 0.0)),
            "totalTcv": _num(r["total_tcv"]),
            "fy27rev": _num(r["fy27_revenue"]),
            "h1Rev": _num(r["h1_rev"]),
            "h2Rev": _num(r["h2_rev"]),
            "weighted": _num(r["weighted_fy27"]),
            "fy27WonYtd": _num(r["fy27_won_ytd"]),
            "winRate": _num(r["fy27_win_rate"]),
            "fy27DealsWon": _int(r["fy27_deals_won"]),
            "fy26DealsWon": _int(r["fy26_deals_won"]),
            "fy26WonFy27Rev": _num(r["fy26_won_fy27rev"]),
            "fy26WinRate": _num(r["fy26_win_rate"]),
            "fy27CarryForward": _num(r["fy27_carry_forward"]),
        })
    return rows


def _build_quota_totals(sellers: pd.DataFrame) -> dict:
    quota_sellers = sellers[sellers["annual_quota"].notna()]
    total_quota = quota_sellers["annual_quota"].sum()
    total_weighted = quota_sellers["weighted_fy27"].sum()
    return {
        "totalQuota": _num(total_quota),
        "totalWeighted": _num(total_weighted),
        "coveragePct": _num(total_weighted / total_quota) if total_quota else 0.0,
        "repsWithQuota": int(len(quota_sellers)),
    }


def _build_quota_by_region(sellers: pd.DataFrame) -> list[dict]:
    quota_sellers = sellers[sellers["annual_quota"].notna()]
    grouped = quota_sellers.groupby("region", dropna=False)
    rows = []
    for name, g in grouped:
        quota = g["annual_quota"].sum()
        weighted = g["weighted_fy27"].sum()
        rows.append({
            "region": str(name),
            "quota": _num(quota),
            "weighted": _num(weighted),
            "pct": _num(weighted / quota) if quota else 0.0,
        })
    rows.sort(key=lambda r: r["quota"], reverse=True)
    return rows


def _build_closed_fy27(closed_deals: pd.DataFrame) -> dict:
    won = closed_deals[closed_deals["won"]]
    lost = closed_deals[~closed_deals["won"]]
    by_region = []
    for name, g in closed_deals.groupby("region", dropna=False):
        w = int(g["won"].sum())
        l = int((~g["won"]).sum())
        total = w + l
        by_region.append({
            "region": str(name),
            "won": w,
            "lost": l,
            "winRate": _num(w / total) if total else 0.0,
        })
    by_region.sort(key=lambda r: (r["won"] + r["lost"]), reverse=True)
    total = len(closed_deals)
    return {
        "won": int(len(won)),
        "lost": int(len(lost)),
        "winRate": _num(len(won) / total) if total else 0.0,
        "wonTCV": _num(won["tcv"].sum()),
        "lostTCV": _num(lost["tcv"].sum()),
        "wonFY27Revenue": _num(won["fy27_revenue"].sum()),
        "byRegion": by_region,
    }


def _build_accounts(open_deals: pd.DataFrame) -> list[dict]:
    rows = []
    for name, g in open_deals.groupby("company", dropna=False):
        fy27rev = g["fy27_revenue"].sum()
        tcv = g["tcv"].sum()
        deal_types = sorted(set(str(d) for d in g["deal_type"].dropna().unique()))
        service_lines = sorted(set(str(s) for s in g["service_line"].dropna().unique()))
        rows.append({
            "company": str(name),
            "deals": f"{len(g)} open deal{'s' if len(g) != 1 else ''}",
            "dealType": ", ".join(deal_types) if deal_types else "",
            "serviceLine": ", ".join(service_lines) if service_lines else "",
            "tcv": _num(tcv),
            "fy27rev": _num(fy27rev),
            "pctFY27": _num(fy27rev / tcv) if tcv else 0.0,
        })
    rows.sort(key=lambda r: r["tcv"], reverse=True)
    return rows


def _customer_status(is_current: bool, is_previous: bool) -> str:
    if is_current and is_previous:
        return "Current & Previous"
    if is_current:
        return "Current"
    if is_previous:
        return "Previous"
    return "Unknown"


def build_customers_list(df: pd.DataFrame) -> list[dict]:
    """One row per "master customer" company (see
    normalize.normalize_companies_hubspot) for the Master Customer page."""
    rows = []
    for idx, r in df.iterrows():
        rows.append({
            "id": int(idx),
            "company": str(r["company"]),
            "owner": "" if pd.isna(r["owner"]) else str(r["owner"]),
            "country": str(r["country"]),
            "industry": str(r["industry"]),
            "businessUnit": "" if pd.isna(r["business_unit"]) else str(r["business_unit"]),
            "icpTier": "" if pd.isna(r["icp_tier"]) else str(r["icp_tier"]),
            "accountSalesTier": "" if pd.isna(r["account_sales_tier"]) else str(r["account_sales_tier"]),
            "status": _customer_status(bool(r["is_current"]), bool(r["is_previous"])),
            "isCurrent": bool(r["is_current"]),
            "isPrevious": bool(r["is_previous"]),
            "numContacts": None if pd.isna(r["num_contacts"]) else _num(r["num_contacts"]),
            "numOpenDeals": _int(r["num_open_deals"]),
            "numWonDeals": _int(r["num_won_deals"]),
            "numLostDeals": _int(r["num_lost_deals"]),
            "numDeals": _int(r["num_deals"]),
            "totalRevenue": _num(r["total_revenue"]),
            "revenueFY27": _num(r["revenue_fy27"]),
            "revenueFY28": _num(r["revenue_fy28"]),
            "annualRevenue": None if pd.isna(r["annual_revenue"]) else _num(r["annual_revenue"]),
            "serviceLines": list(r["service_lines"]) if isinstance(r["service_lines"], (list, tuple)) else [],
        })
    return rows


def build_customer_detail(row: pd.Series) -> dict:
    """Every column for one master-customer company, grouped into sections
    for the customer detail page -- the click-through target from the
    Master Customer list.
    """
    g = lambda col: _json_val(row.get(col))
    service_lines = row.get("service_lines")
    return {
        "company": g("company"),
        "overview": {
            "owner": g("owner"),
            "country": g("country"),
            "industry": g("industry"),
            "businessUnit": g("business_unit"),
            "icpTier": g("icp_tier"),
            "accountSalesTier": g("account_sales_tier"),
            "status": _customer_status(bool(row.get("is_current")), bool(row.get("is_previous"))),
        },
        "revenue": {
            "totalRevenue": g("total_revenue"),
            "revenueFY27": g("revenue_fy27"),
            "revenueFY28": g("revenue_fy28"),
            "annualRevenue": g("annual_revenue"),
        },
        "dealActivity": {
            "numOpenDeals": g("num_open_deals"),
            "numWonDeals": g("num_won_deals"),
            "numLostDeals": g("num_lost_deals"),
            "numDeals": g("num_deals"),
        },
        "engagement": {
            "numContacts": g("num_contacts"),
        },
        "serviceLines": list(service_lines) if isinstance(service_lines, (list, tuple)) else [],
    }


def _json_val(v):
    if pd.isna(v):
        return None
    if isinstance(v, pd.Timestamp):
        return v.date().isoformat()
    if hasattr(v, "item"):
        return v.item()
    return v


def _build_extra_groups(row: pd.Series) -> dict:
    """The 4 HubSpot-only attribute groups added to deal detail pages.
    Fields are all-or-nothing sourced from the app/hubspot-data/ pull -- on a
    snapshot built from the workbook alone (no HubSpot pull processed yet)
    these columns won't exist and every field here comes back None, which
    the frontend renders as blank rather than erroring.
    """
    g = lambda col: _json_val(row.get(col))
    return {
        "engagement": {
            "nextStep": g("next_step"),
            "lastContacted": g("last_contacted"),
            "lastActivityDate": g("last_activity_date"),
            "nextActivityDate": g("next_activity_date"),
            "numActivities": g("num_activities"),
            "numContactsTouched": g("num_contacts_touched"),
            "isStalled": bool(row.get("is_stalled")) if row.get("is_stalled") is not None else None,
            "dealScore": g("deal_score"),
        },
        "winLoss": {
            "competitor": g("competitor"),
            "lostToCompetitor": g("lost_to_competitor"),
            "winRemarks": g("win_remarks"),
            "winProbabilityPct": g("win_probability_pct"),
            "closedLostReason": g("closed_lost_reason"),
        },
        "contract": {
            "approvalTier": g("approval_tier"),
            "contractDurationMonths": g("contract_duration_months"),
            "contractStartDate": g("contract_start_date"),
            "contractEndDate": g("contract_end_date"),
            "firstInvoiceDate": g("first_invoice_date"),
            "goLiveDate": g("go_live_date"),
        },
        "classificationExtra": {
            "leadSource": g("lead_source"),
            "industryVertical": g("industry_vertical"),
            "solutionVertical": g("solution_vertical"),
            "functionalArea": g("functional_area"),
            "technology": g("technology"),
        },
    }


def build_deal_detail(row: pd.Series) -> dict:
    """Every column for one Open Deals row, organized into sections for the
    deal detail page — the click-through target from Target/Large Deals,
    Deal Explorer, and Deal Health & Risk.
    """
    g = lambda col: _json_val(row.get(col))
    months = [{"month": short, "value": g(f"m_{short}") or 0} for _, short in MONTH_COLUMNS]
    detail = {
        "company": g("company"),
        "deal": g("deal_name"),
        "overview": {
            "owner": g("owner"),
            "region": g("region"),
            "obu": g("obu"),
            "dealType": g("deal_type"),
            "stage": g("stage"),
            "forecastCat": g("forecast_cat"),
            "probability": g("probability"),
            "closeDate": g("close_date"),
            "targetDeal": bool(row.get("target_deal")),
            "segment": g("segment"),
        },
        "financials": {
            "tcv": g("tcv"),
            "acv": g("acv"),
            "fy27Revenue": g("fy27_revenue"),
            "weightedFY27": g("weighted_fy27"),
        },
        "quarterly": [
            {"quarter": "Q1", "revenue": g("q1_rev") or 0, "weighted": g("q1_weighted") or 0},
            {"quarter": "Q2", "revenue": g("q2_rev") or 0, "weighted": g("q2_weighted") or 0},
            {"quarter": "Q3", "revenue": g("q3_rev") or 0, "weighted": g("q3_weighted") or 0},
            {"quarter": "Q4", "revenue": g("q4_rev") or 0, "weighted": g("q4_weighted") or 0},
        ],
        "monthlyRevenue": months,
        "classification": {
            "portfolio": g("portfolio"),
            "serviceLine": g("service_line"),
            "partner": g("partner"),
            "solutionAccelerator": g("solution_accelerator"),
            "delOrg": g("del_org"),
            "source": g("source"),
        },
    }
    detail.update(_build_extra_groups(row))
    return detail


def build_closed_deal_detail(row: pd.Series) -> dict:
    """Every column for one Closed Deals row -- the click-through target
    from the Closed Deals performance page. Mirrors build_deal_detail's
    layout minus the fields that don't apply to closed deals (ACV, forecast
    category/probability, target-deal flag, quarterly weighted revenue).
    """
    g = lambda col: _json_val(row.get(col))
    months = [{"month": short, "value": g(f"m_{short}") or 0} for _, short in MONTH_COLUMNS]
    detail = {
        "company": g("company"),
        "deal": g("deal_name"),
        "overview": {
            "owner": g("owner"),
            "region": g("region"),
            "obu": g("obu"),
            "dealType": g("deal_type"),
            "stage": g("stage"),
            "outcome": g("outcome"),
            "won": bool(row.get("won")),
            "closeDate": g("close_date"),
        },
        "financials": {
            "tcv": g("tcv"),
            "fy27Revenue": g("fy27_revenue"),
        },
        "quarterly": [
            {"quarter": "Q1", "revenue": g("q1_rev") or 0},
            {"quarter": "Q2", "revenue": g("q2_rev") or 0},
            {"quarter": "Q3", "revenue": g("q3_rev") or 0},
            {"quarter": "Q4", "revenue": g("q4_rev") or 0},
        ],
        "monthlyRevenue": months,
        "classification": {
            "portfolio": g("portfolio"),
            "serviceLine": g("service_line"),
            "partner": g("partner"),
            "solutionAccelerator": g("solution_accelerator"),
            "source": g("source"),
        },
    }
    detail.update(_build_extra_groups(row))
    return detail


def build_seller_detail(row: pd.Series, open_deals: pd.DataFrame) -> dict:
    """Every Seller Performance column for one seller, grouped into sections
    for the seller detail page, plus their open deals (same row shape as
    _build_deal_rows so the frontend can reuse its deal-table/click-through).
    """
    g = lambda col: _json_val(row.get(col))
    their_deals = open_deals[open_deals["owner"] == row["seller"]]
    return {
        "name": g("seller"),
        "role": g("role"),
        "region": g("region"),
        "quota": {
            "annualQuota": g("annual_quota"),
            "ytdAttainment": g("ytd_attainment"),
            "committedAttainment": g("committed_attainment"),
            "commitPct": g("commit_pct") or 0,
        },
        "dealMix": {
            "deals": g("deals") or 0,
            "eceb": g("eceb") or 0,
            "ecnb": g("ecnb") or 0,
            "ncnb": g("ncnb") or 0,
            "largeDeals": g("large_deals") or 0,
            "largeFy27": g("large_fy27") or 0,
        },
        "revenue": {
            "totalAcv": _num(open_deals.loc[open_deals["owner"] == row["seller"], "acv"].sum()),
            "totalTcv": g("total_tcv") or 0,
            "fy27Revenue": g("fy27_revenue") or 0,
            "h1Rev": g("h1_rev") or 0,
            "h2Rev": g("h2_rev") or 0,
            "weightedFY27": g("weighted_fy27") or 0,
            "fy27CarryForward": g("fy27_carry_forward") or 0,
        },
        "winLoss": {
            "fy27WonYtd": g("fy27_won_ytd") or 0,
            "fy27WinRate": g("fy27_win_rate") or 0,
            "fy27DealsWon": g("fy27_deals_won") or 0,
            "fy26DealsWon": g("fy26_deals_won") or 0,
            "fy26WonFy27Rev": g("fy26_won_fy27rev") or 0,
            "fy26WinRate": g("fy26_win_rate") or 0,
        },
        "deals": _build_deal_rows(their_deals),
    }


def build_trend_point(label: str, deals: int, fy27_revenue: float) -> dict:
    return {"label": label, "deals": int(deals), "fy27rev": _num(fy27_revenue)}


def summarize_snapshot_sheet(df: pd.DataFrame) -> dict:
    """Collapses one _Snap* sheet (deal-level rows for one date) to a trend point."""
    label = str(df["snapshot_label"].iloc[0]) if len(df) else "unknown"
    return build_trend_point(label, len(df), df["fy27_revenue"].sum())
