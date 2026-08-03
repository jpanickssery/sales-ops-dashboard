# HGS Pipeline Analytics App

A locally-run dashboard over the HGS FY27 Pipeline workbook, with an "Ask a
Question" chat backed by Claude. See `01-Docs/HGS Pipeline Analytics App -
Build Plan-v1.md` for the design/architecture behind this.

## Setup

```powershell
cd app/backend
python -m pip install -r requirements.txt
```

The "Ask a Question" feature calls the Claude API. Set an API key before
starting the server:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

(Or run `ant auth login` once, if you have the Anthropic CLI — the backend
picks up that credential automatically with no env var needed.) Without
either, every other view works fine; only Ask a Question will show an
error telling you to set this up.

## Run

```powershell
cd app/backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000/` in a browser.

On first run there's no data loaded — go to **Data → Upload Spreadsheet**
in the sidebar and upload the `.xlsx` workbook. Every dashboard view and
the Ask feature switch to the uploaded data immediately, and the Trends
view gains one more data point on the timeline.

To load a new version of the spreadsheet later (e.g. after a fresh HubSpot
export), just upload it again the same way — it becomes the new "current"
snapshot and the previous one is retained for history under
`backend/data/snapshots/`.

## How it's put together

- **`backend/ingest/`** — parses the workbook's raw data tabs (`Open Deals
  (Data)`, `Closed Deals (Data)`, `Line Items (Data)`, `Seller
  Performance`, `Sales Hygiene`), normalizes them to stable column names,
  and recomputes every dashboard number from those raw rows (rather than
  reading the workbook's own pivot tabs). `pipeline.py` ties this together
  and also seeds/extends `data/trend_history.json` from the workbook's
  `_SnapWeekly` / `_SnapMonthly` / `_SnapArchive` tabs plus one point per
  upload going forward.
- **`backend/api/`** — FastAPI routes: `GET /api/current` (the active
  snapshot), `POST /api/upload` (ingest a new workbook), `POST /api/ask`
  (the chat endpoint).
- **`backend/ask/`** — the Claude tool-calling loop for Ask a Question.
  Claude can only see the data through a constrained `query_data` tool
  (filter/group/aggregate over the normalized tables) and answers by
  calling a `final_answer` tool with a structured chart/table shape, so
  answers are always backed by a real query rather than a guess.
- **`backend/data/`** — `snapshots/<timestamp>/` holds each upload's
  computed summary (`summary.json`) and normalized tables (parquet, for
  the Ask tool to query); `current.json` points at the active one;
  `trend_history.json` accumulates the Trends view's data points.
- **`frontend/`** — a plain HTML/CSS/JS single-page app (no build step),
  adapted from the original design mockup. `app.js` fetches
  `/api/current`, renders each dashboard view, and posts to `/api/ask` for
  the chat.

## Known limitations / possible follow-ups

- Single user, no auth — anyone who can reach the port can upload data or
  ask questions.
- No automatic ingestion (folder watch, email) — uploads are manual by
  design (see the build plan).
- The Ask feature's chart types are limited to bars and simple tables; no
  line/time-series chart yet even though Trends data would support one.
