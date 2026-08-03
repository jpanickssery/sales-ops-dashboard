# HGS Pipeline Analytics App — Build Plan (v1)

## 1. Purpose

Turn `HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx` into a locally-run web app that:

- Shows the dashboard views already designed in `Spreadsheet analytics app design-v1` (Executive Summary, Coverage vs. Quota, Trends, Target/Large Deals, Forecast & Stage, Deal Health & Risk, Regional Performance, Seller Leaderboard, Win/Loss, Account 360, Deal Explorer).
- Lets the user upload a new version of the spreadsheet whenever it's refreshed, and re-derives every view from it.
- Adds a real "Ask a Question" chat that answers open-ended questions about the pipeline with a generated chart or table, backed by the Claude API — not the keyword matcher in the design mockup.
- Keeps a history of past uploads so the Trends view has real data to show, not a single hardcoded snapshot.

## 2. Scope & constraints (confirmed with user)

| Decision | Choice |
|---|---|
| Spreadsheet ingestion | Manual upload through an in-app UI (drag/drop or file picker). No folder-watching or email ingestion. |
| Hosting | Runs locally on the user's machine only. Single user. No deployment/IT dependency for v1. |
| NL question answering | Real LLM (Claude API), not a rule-based matcher — needs to generalize to questions not anticipated in advance. |
| Data sensitivity | Deal/account/owner-level data is OK to send to the Anthropic API. |

Non-goals for v1: multi-user auth, hosted deployment, automated ingestion (folder watch / email), editing data from the UI (read-only analytics).

## 3. Source data

`HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx` has ~38 tabs. The app should parse from the **raw data tabs** and recompute all aggregates in code, rather than reading Excel's pre-built pivot tabs (fragile to depend on, and duplicates logic that's easier to own directly):

- `Open Deals (Data)` — 699 rows, the core open-pipeline table.
- `Closed Deals (Data)` — 515 rows, won/lost history for win-rate analysis.
- `Line Items (Data)` — 801 rows, product/service-line level detail.
- `Seller Performance` — per-rep rollups (used for Leaderboard, Coverage vs Quota).
- `Sales Hygiene` — flags per deal (used for Deal Health & Risk).
- `_SnapWeekly`, `_SnapMonthly`, `_SnapArchive` — existing point-in-time snapshots, useful as seed history for Trends on first load.

Everything else (Executive Summary, Regional Performance, Forecast & Stage, Revenue Coverage, etc.) are Excel-side pivots of the above and will be **recomputed by the app**, not parsed directly, so the logic is transparent and testable.

## 4. Architecture

```
app/
  backend/
    main.py                 # FastAPI app, route registration
    ingest/
      parse_workbook.py     # openpyxl/pandas parsing of the raw tabs
      normalize.py           # raw rows -> typed records (deals, line items, sellers, hygiene flags)
      aggregate.py           # recomputes KPIs, segments, stages, region/deal-type rollups, coverage, forecast categories
      snapshot.py            # writes/reads versioned snapshots, manages "current" pointer
    ask/
      tools.py               # pandas/DuckDB query tool(s) exposed to Claude
      claude_client.py       # Anthropic SDK wrapper, tool-calling loop
      response_schema.py     # maps Claude's tool output into {hasBars,bars}/{hasTable,tableRows} shapes
    api/
      routes_data.py         # GET endpoints the frontend reads for each dashboard view
      routes_upload.py       # POST /upload — accept .xlsx, run ingest pipeline, create new snapshot
      routes_ask.py          # POST /ask — question in, chart/table spec out
    data/
      snapshots/             # one folder or file per upload, timestamped
      current -> snapshots/<latest>   # pointer/symlink or a small current.json
    requirements.txt
  frontend/
    (adapted from the design mockup's HTML/CSS/JS — same visual language,
     wired to the backend endpoints instead of the static data.js file
     and the keyword-based chat handler)
  README.md                  # how to run locally
```

### Backend: FastAPI, run via `uvicorn` on localhost

Chosen because the heavy lifting is data wrangling (pandas/openpyxl) and the app is single-user/local — no need for a separate services layer. FastAPI gives typed request/response models and automatic docs, which helps keep the `/ask` response contract enforced.

### Storage: versioned files, no database

Each upload produces a timestamped snapshot (parsed + aggregated JSON, plus the normalized deal-level tables as parquet for the `/ask` query tool to load quickly). A single `current` pointer tells the app which snapshot to serve. This is enough for one user uploading periodically — a database would be overhead without a real concurrency or query-scale need.

### Frontend: adapt the existing design mockup

The mockup in `Spreadsheet analytics app design-v1` is already a complete, on-brand UI (HGS colors, Kanit font, sidebar nav, all 12 views). Reuse its layout and component structure; replace:
- the static `import('./data.js')` with a fetch to the backend's data endpoints
- the `answerFor()` keyword matcher with a call to `POST /ask`
- the hardcoded upload-free flow with a real upload control (e.g., in the sidebar or a dedicated "Data" page) that posts to `/upload` and reloads the current snapshot

### Ask-a-Question design

Rather than asking Claude to freehand a chart, give it a **tool** that runs a constrained query against the normalized dataframes (open deals, closed deals, line items, sellers, hygiene flags) — e.g. `run_query(dataframe: str, filter: ..., group_by: ..., metric: ...)` or a small safe pandas-query executor. Claude:
1. Interprets the natural-language question.
2. Calls the tool one or more times to fetch the numbers it needs.
3. Returns a structured response (bars, table, or plain text) matching the schema the frontend already renders (`hasBars/bars`, `hasTable/tableRows`, `answer` text).

This generalizes to genuinely open-ended questions instead of only the ~6 patterns the mockup's keyword matcher recognizes.

## 5. Milestones

1. **Data pipeline** — parse the raw tabs, normalize into typed records, recompute the aggregates the Executive Summary view needs. Verify numbers match the current workbook's Executive Summary tab exactly.
2. **Upload + snapshot versioning** — `/upload` endpoint, snapshot storage, `current` pointer, seed initial history from `_SnapWeekly`/`_SnapMonthly`/`_SnapArchive`.
3. **Wire the static dashboard views** — Executive Summary, Regional Performance, Forecast & Stage, Target/Large Deals, Deal Health & Risk, Seller Leaderboard, Win/Loss, Account 360, Deal Explorer, Coverage vs Quota, Trends — each reading from the backend instead of `data.js`.
4. **Ask a Question** — tool-calling loop against the normalized data, response-schema mapping, wire into the existing chat UI.
5. **Local run experience** — one-command local start (`uvicorn` + static frontend), README with setup steps.

## 6. Open questions to confirm before/while building

- Any fields in the raw data tabs that need cleaning/exclusion (e.g., test deals, blank owner rows) before aggregation?
- Should uploaded snapshots be kept indefinitely, or pruned after some retention window?
- Any specific chart types beyond bars/tables the Ask feature should be able to produce (e.g., a real time-series line chart for Trends once more snapshots accumulate)?
