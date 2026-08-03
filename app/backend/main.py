from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api import routes_ask, routes_data, routes_upload

app = FastAPI(title="HGS Pipeline Analytics")

app.include_router(routes_data.router, prefix="/api")
app.include_router(routes_upload.router, prefix="/api")
app.include_router(routes_ask.router, prefix="/api")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
