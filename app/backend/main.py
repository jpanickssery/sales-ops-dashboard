import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api import routes_ask, routes_data, routes_upload
from ingest import hubspot_source, pipeline

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="HGS Pipeline Analytics")

app.include_router(routes_data.router, prefix="/api")
app.include_router(routes_upload.router, prefix="/api")
app.include_router(routes_ask.router, prefix="/api")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


@app.on_event("startup")
def load_hubspot_snapshot_on_boot() -> None:
    """If a HubSpot pull is available under app/hubspot-data/, (re)build the
    snapshot from it so the dashboard serves live HubSpot-primary data
    without requiring a manual workbook upload first. See
    app/hubspot-data/README.md for how a pull is produced/refreshed; falls
    back to whatever snapshot already exists (from a prior run or upload) if
    no pull is present or it fails to process.
    """
    if hubspot_source.latest_snapshot_id() is None:
        logger.info("No HubSpot pull found under app/hubspot-data/ -- skipping startup ingest.")
        return
    try:
        summary = pipeline.process_hubspot()
        logger.info(
            "Loaded HubSpot snapshot %s on startup (%d open, %d closed FY27 deals).",
            summary["meta"]["hubspotSnapshotId"],
            summary["meta"]["openDeals"],
            summary["meta"]["closedFY27"],
        )
    except Exception:
        logger.exception("Failed to process HubSpot pull on startup; serving last snapshot instead.")
