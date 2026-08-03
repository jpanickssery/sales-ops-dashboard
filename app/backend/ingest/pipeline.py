"""Orchestrates one spreadsheet upload end-to-end: parse -> normalize ->
aggregate -> merge into trend history -> persist as a new snapshot.
"""

from datetime import datetime, timezone

from . import aggregate, normalize, snapshot
from .parse_workbook import load_workbook_sheets


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
