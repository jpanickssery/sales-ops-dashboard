# HGS Pipeline Analytics — Docs

Reference material for the HGS FY27 Pipeline Dashboard analytics app. The
working app itself lives in `../app` (see `../app/README.md` for setup and
run instructions).

## Contents

- **`HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx`** — the source workbook
  (HubSpot pipeline export). This is the file you upload into the app via
  **Data → Upload Spreadsheet**; upload a newer version here whenever the
  export refreshes.
- **`Spreadsheet analytics app design-v1.zip`** — the original design
  mockup (Claude Design Canvas export) the app's frontend was built from:
  sidebar nav, all dashboard views, and the "Ask a Question" chat concept.
- **`HGS Pipeline Analytics App - Build Plan-v1.md`** — the architecture
  and build plan the app was implemented against (data pipeline design,
  snapshot versioning, the Ask-a-Question tool-calling approach, milestone
  sequence).

## Quick start

1. Read the build plan above if you want the "why" behind the
   architecture.
2. Follow `../app/README.md` to install dependencies, set
   `ANTHROPIC_API_KEY`, and run the app locally.
3. Upload `HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx` (or a newer export)
   through the app's Upload Spreadsheet page to see the dashboards
   populate.
