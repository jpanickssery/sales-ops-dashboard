"""Versioned storage for parsed workbook snapshots.

Each upload gets a timestamped folder under data/snapshots/ holding the
computed dashboard summary (summary.json) and the normalized per-record
tables (parquet, read by the /ask tool). data/current.json points at the
snapshot currently served to the dashboard. data/trend_history.json
accumulates one point per upload over time, seeded on first run from the
workbook's own snapshot-archive tabs.
"""

import json
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
CURRENT_POINTER = DATA_DIR / "current.json"
TREND_HISTORY = DATA_DIR / "trend_history.json"

TABLE_NAMES = ["open_deals", "closed_deals", "line_items", "sellers", "hygiene"]


def ensure_dirs() -> None:
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def load_trend_history() -> list[dict]:
    if not TREND_HISTORY.exists():
        return []
    return json.loads(TREND_HISTORY.read_text(encoding="utf-8"))


def save_trend_history(points: list[dict]) -> None:
    TREND_HISTORY.write_text(json.dumps(points, indent=2), encoding="utf-8")


def merge_trend_point(history: list[dict], point: dict) -> list[dict]:
    merged = [p for p in history if p["label"] != point["label"]]
    merged.append(point)
    merged.sort(key=lambda p: p["label"])
    return merged


def save_snapshot(snapshot_id: str, summary: dict, tables: dict[str, pd.DataFrame]) -> Path:
    ensure_dirs()
    snap_dir = SNAPSHOTS_DIR / snapshot_id
    snap_dir.mkdir(parents=True, exist_ok=True)
    (snap_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    for name, df in tables.items():
        df.to_parquet(snap_dir / f"{name}.parquet", index=False)
    CURRENT_POINTER.write_text(json.dumps({"snapshot_id": snapshot_id}), encoding="utf-8")
    return snap_dir


def current_snapshot_id() -> str | None:
    if not CURRENT_POINTER.exists():
        return None
    return json.loads(CURRENT_POINTER.read_text(encoding="utf-8"))["snapshot_id"]


def load_current_summary() -> dict | None:
    snapshot_id = current_snapshot_id()
    if snapshot_id is None:
        return None
    summary_path = SNAPSHOTS_DIR / snapshot_id / "summary.json"
    if not summary_path.exists():
        return None
    return json.loads(summary_path.read_text(encoding="utf-8"))


def load_current_tables() -> dict[str, pd.DataFrame] | None:
    snapshot_id = current_snapshot_id()
    if snapshot_id is None:
        return None
    snap_dir = SNAPSHOTS_DIR / snapshot_id
    tables = {}
    for name in TABLE_NAMES:
        path = snap_dir / f"{name}.parquet"
        if path.exists():
            tables[name] = pd.read_parquet(path)
    return tables


def list_snapshots() -> list[str]:
    ensure_dirs()
    return sorted(p.name for p in SNAPSHOTS_DIR.iterdir() if p.is_dir())
