"""Orchestrates one spreadsheet upload end-to-end: parse -> normalize ->
aggregate -> merge into trend history -> persist as a new snapshot.

process_hubspot() is the HubSpot-primary counterpart: open deals and FY27
closed deals come from the latest app/hubspot-data/ pull instead of the
workbook. See app/hubspot-data/README.md for how that pull is produced, and
normalize.merge_spreadsheet_extras for why the spreadsheet is still consulted
for a couple of open-deal columns HubSpot doesn't reliably carry.
"""

from datetime import datetime, timezone
from pathlib import Path

from . import aggregate, hubspot_source, normalize, snapshot
from .parse_workbook import load_workbook_sheets

DEFAULT_WORKBOOK_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "01-Docs" / "HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx"
)


def process_workbook(path: str) -> dict:
    sheets = load_workbook_sheets(path)

    open_deals = normalize.normalize_open_deals(sheets["Open Deals (Data)"])
    closed_deals = normalize.normalize_closed_deals(sheets["Closed Deals (Data)"])
    line_items = normalize.normalize_line_items(sheets["Line Items (Data)"])
    sellers = normalize.normalize_sellers(sheets["Seller Performance"])
    hygiene = normalize.normalize_hygiene(sheets["Sales Hygiene"])

    now = datetime.now(timezone.utc)
    refreshed_label = f"{now.strftime('%b')} {now.day}, {now.strftime('%Y')}"
    snapshot_id = now.strftime("%Y%m%dT%H%M%SZ")

    summary = aggregate.build_snapshot(
        open_deals, closed_deals, line_items, sellers, hygiene,
        snapshot_history=[],
        refreshed_label=refreshed_label,
    )

    history = snapshot.load_trend_history()
    if not history:
        history = _seed_history_from_archive(sheets)
    this_point = aggregate.build_trend_point(
        now.strftime("%Y-%m-%d"),
        summary["kpis"]["openDeals"],
        summary["kpis"]["fy27Revenue"],
    )
    history = snapshot.merge_trend_point(history, this_point)
    summary["trendSnapshots"] = history

    tables = {
        "open_deals": open_deals,
        "closed_deals": closed_deals,
        "line_items": line_items,
        "sellers": sellers,
        "hygiene": hygiene,
    }
    snapshot.save_snapshot(snapshot_id, summary, tables)
    snapshot.save_trend_history(history)
    return summary


def process_hubspot(workbook_path: str | None = None) -> dict:
    """HubSpot is authoritative for open deals and FY27 closed deals. The
    spreadsheet still supplies Sellers, Line Items, Sales Hygiene, and trend
    history (no HubSpot equivalent has been pulled for these), plus a
    best-effort backfill of Del Org / OBU onto the open deals table.
    """
    pull = hubspot_source.load_latest_pull()
    if pull is None:
        raise RuntimeError(
            "No HubSpot pull found under app/hubspot-data/ -- see its README.md "
            "for how to produce one."
        )

    open_deals = normalize.normalize_open_deals_hubspot(pull["open_deals"])
    closed_deals = normalize.normalize_closed_deals_hubspot(pull["closed_deals"])
    customers = normalize.normalize_companies_hubspot(pull["companies"])

    # Sellers/quota, Line Items, Sales Hygiene, and the Del Org/OBU backfill
    # only exist in the workbook -- optional. A code-only clone (see
    # app/README.md's "Known limitations") won't have 01-Docs/ at all, so
    # fall back to empty placeholders instead of crashing the whole HubSpot
    # ingest over a missing file that upload-a-workbook-later can fill in.
    wb_path = workbook_path or str(DEFAULT_WORKBOOK_PATH)
    workbook_available = Path(wb_path).exists()
    sheets = load_workbook_sheets(wb_path) if workbook_available else normalize.empty_workbook_sheets()

    spreadsheet_open_deals = normalize.normalize_open_deals(sheets["Open Deals (Data)"])
    open_deals, extras_match_stats = normalize.merge_spreadsheet_extras(open_deals, spreadsheet_open_deals)

    line_items = normalize.normalize_line_items(sheets["Line Items (Data)"])
    sellers = normalize.normalize_sellers(sheets["Seller Performance"])
    hygiene = normalize.normalize_hygiene(sheets["Sales Hygiene"])

    now = datetime.now(timezone.utc)
    refreshed_label = f"{now.strftime('%b')} {now.day}, {now.strftime('%Y')}"
    snapshot_id = now.strftime("%Y%m%dT%H%M%SZ")

    summary = aggregate.build_snapshot(
        open_deals, closed_deals, line_items, sellers, hygiene,
        snapshot_history=[],
        refreshed_label=refreshed_label,
        customers=customers,
    )
    summary["meta"]["source"] = (
        "HubSpot (live pull) + spreadsheet (Sellers, Line Items, Hygiene)" if workbook_available
        else "HubSpot (live pull) only -- no workbook found, upload one for Sellers/Line Items/Hygiene"
    )
    summary["meta"]["workbookAvailable"] = workbook_available
    summary["meta"]["hubspotPulledAt"] = pull["meta"].get("pulled_at_utc")
    summary["meta"]["hubspotSnapshotId"] = pull["snapshot_id"]
    summary["meta"]["extrasMatch"] = extras_match_stats

    history = snapshot.load_trend_history()
    if not history:
        history = _seed_history_from_archive(sheets)
    this_point = aggregate.build_trend_point(
        now.strftime("%Y-%m-%d"),
        summary["kpis"]["openDeals"],
        summary["kpis"]["fy27Revenue"],
    )
    history = snapshot.merge_trend_point(history, this_point)
    summary["trendSnapshots"] = history

    tables = {
        "open_deals": open_deals,
        "closed_deals": closed_deals,
        "line_items": line_items,
        "sellers": sellers,
        "hygiene": hygiene,
        "customers": customers,
    }
    snapshot.save_snapshot(snapshot_id, summary, tables)
    snapshot.save_trend_history(history)
    return summary


def _seed_history_from_archive(sheets: dict) -> list[dict]:
    points = []
    for sheet_name in ["_SnapArchive", "_SnapMonthly", "_SnapWeekly"]:
        df = sheets.get(sheet_name)
        if df is None or df.empty:
            continue
        snap = normalize.normalize_snapshot(df)
        for label, g in snap.groupby("snapshot_label"):
            points.append(aggregate.build_trend_point(str(label), len(g), g["fy27_revenue"].sum()))
    deduped: dict[str, dict] = {}
    for p in points:
        deduped[p["label"]] = p
    return sorted(deduped.values(), key=lambda p: p["label"])
