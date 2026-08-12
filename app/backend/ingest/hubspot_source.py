"""Reads the raw HubSpot pulls dropped under app/hubspot-data/ (see that
folder's README.md for how a pull is produced). This is a manual, on-request
refresh -- not a live API call -- so this module only ever reads files
already on disk.
"""

import json
from pathlib import Path

HUBSPOT_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "hubspot-data"
LATEST_POINTER = HUBSPOT_DATA_DIR / "latest.json"


def latest_snapshot_id() -> str | None:
    if not LATEST_POINTER.exists():
        return None
    return json.loads(LATEST_POINTER.read_text(encoding="utf-8")).get("latest_snapshot")


def load_latest_pull() -> dict | None:
    """Returns {"open_deals": [...], "closed_deals": [...], "companies": [...],
    "meta": {...}, "snapshot_id": "..."} for the most recent HubSpot pull, or
    None if no pull has ever been made. "companies" is [] on an older
    snapshot taken before the company pull existed.
    """
    snapshot_id = latest_snapshot_id()
    if snapshot_id is None:
        return None
    snap_dir = HUBSPOT_DATA_DIR / snapshot_id
    open_path = snap_dir / "open_deals.json"
    closed_path = snap_dir / "closed_deals.json"
    companies_path = snap_dir / "companies.json"
    meta_path = snap_dir / "meta.json"
    if not (open_path.exists() and closed_path.exists()):
        return None
    return {
        "open_deals": json.loads(open_path.read_text(encoding="utf-8")),
        "closed_deals": json.loads(closed_path.read_text(encoding="utf-8")),
        "companies": json.loads(companies_path.read_text(encoding="utf-8")) if companies_path.exists() else [],
        "meta": json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {},
        "snapshot_id": snapshot_id,
    }
