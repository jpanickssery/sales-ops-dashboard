import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from ingest import hubspot_source
from ingest.pipeline import process_hubspot, process_workbook

router = APIRouter()

# openpyxl/pandas can leave a file handle open on Windows past the point a
# context-managed TemporaryDirectory tries to delete it, so uploads land in
# a plain scratch folder we clean up ourselves (best-effort).
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "data" / "_uploads"


@router.post("/upload")
async def upload_workbook(file: UploadFile):
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx file.")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = UPLOADS_DIR / f"{uuid.uuid4().hex}_{file.filename}"
    contents = await file.read()
    tmp_path.write_bytes(contents)

    try:
        # If a HubSpot pull exists, HubSpot stays authoritative for open/
        # closed deals -- this upload only refreshes Sellers, Line Items,
        # Sales Hygiene, and the Del Org/OBU backfill (see process_hubspot).
        # Only fall back to workbook-only mode if no pull has ever been made.
        if hubspot_source.latest_snapshot_id() is not None:
            summary = process_hubspot(str(tmp_path))
        else:
            summary = process_workbook(str(tmp_path))
    except Exception as exc:  # noqa: BLE001 - surface parse errors to the uploader
        raise HTTPException(status_code=422, detail=f"Could not process workbook: {exc}") from exc
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass  # best-effort cleanup; a lingering temp file is harmless

    return summary
