# HGS Pipeline Analytics — Docs

Reference material for the HGS FY27 Pipeline Dashboard analytics app. The
working app itself lives in `../app` (see `../app/README.md` for setup and
run instructions).

## Contents

- **`HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx`** — a HubSpot pipeline
  export. **No longer the primary source for open/closed deals** — the app
  now pulls those live from HubSpot (see `../app/hubspot-data/README.md`).
  This workbook still supplies Sellers/quota, Line Items, Sales Hygiene, FY26
  closed-deal history, and a Del Org/OBU backfill onto the HubSpot data —
  upload a newer version here (via **Data → Upload Spreadsheet**) whenever
  those need refreshing.
- **`Spreadsheet analytics app design-v1.zip`** — the original design
  mockup (Claude Design Canvas export) the app's frontend was built from:
  sidebar nav, all dashboard views, and the "Ask a Question" chat concept.
- **`HGS Pipeline Analytics App - Build Plan-v1.md`** — the architecture
  and build plan the app was originally implemented against (data pipeline
  design, snapshot versioning, the Ask-a-Question tool-calling approach,
  milestone sequence). Predates the HubSpot-primary ingest — see
  `../app/README.md`'s "How it's put together" for the current architecture.

## Quick start

1. Read the build plan above if you want the "why" behind the original
   architecture, then `../app/README.md` for how it works now.
2. Follow `../app/README.md` to install dependencies, set
   `ANTHROPIC_API_KEY`, and run the app locally.
3. If a HubSpot pull already exists under `../app/hubspot-data/`, the
   dashboard populates automatically on startup. Otherwise, upload
   `HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx` (or a newer export) through
   the app's Upload Spreadsheet page — every view except the HubSpot-only
   Deal Detail fields works from the workbook alone.
