# HGS Pipeline Analytics App

A locally-run pipeline dashboard, with an "Ask a Question" chat backed by
Claude. See `01-Docs/HGS Pipeline Analytics App - Build Plan-v1.md` for the
original design/architecture behind this.

**HubSpot is the authoritative source** for open deals and FY27 closed
deals — see `../hubspot-data/README.md` for how a pull is produced/refreshed
(it's a manual, on-request pull through the Claude HubSpot connector, not a
live API call). The workbook (`01-Docs/HGS_FY27_Pipeline_Dashboard_Current-v1.xlsx`)
still supplies Sellers/quota, Line Items, Sales Hygiene, and trend history —
nothing in this app pulls those from HubSpot yet — plus a couple of
open-deal columns (Del Org, OBU) that HubSpot doesn't reliably carry, backfilled
onto the HubSpot data by best-effort Company + Deal Name match.

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

**On startup**, if `../hubspot-data/latest.json` points at a pull, the
backend automatically rebuilds the snapshot from it (HubSpot-primary open +
FY27 closed deals, merged with the workbook's Sellers/Line Items/Hygiene/
Del Org/OBU) — no manual upload needed. Check the terminal log for
`Loaded HubSpot snapshot ... on startup`; if it logs a failure instead, the
last snapshot on disk (from a prior run or upload) keeps being served.

To refresh with newer HubSpot data, ask Claude in this project to "refresh
the HubSpot data" (see `../hubspot-data/README.md`), then restart the
server — or just upload the workbook again via **Data → Upload Spreadsheet**
if you only need to refresh the Sellers/Line Items/Hygiene side without a
new HubSpot pull. Either path becomes the new "current" snapshot; previous
ones are retained for history under `backend/data/snapshots/`.

If no HubSpot pull exists yet, the app falls back to workbook-only mode —
upload the `.xlsx` via **Data → Upload Spreadsheet** and every view (except
the HubSpot-only Deal Detail fields, which show blank) works from that
alone.

## How it's put together

- **`backend/ingest/normalize.py`** — renames raw columns to stable
  snake_case fields and fixes dtypes, from two different sources feeding the
  same schema:
  - `normalize_open_deals` / `normalize_closed_deals` / `normalize_line_items`
    / `normalize_sellers` / `normalize_hygiene` — parse the workbook's raw
    data tabs (`Open Deals (Data)`, `Closed Deals (Data)`, `Line Items
    (Data)`, `Seller Performance`, `Sales Hygiene`).
  - `normalize_open_deals_hubspot` / `normalize_closed_deals_hubspot` — parse
    the raw HubSpot pull (see `hubspot_source.py` below) into the *same*
    normalized columns, so every downstream computation works unchanged
    regardless of source. Probability and weighted revenue aren't raw
    HubSpot fields — they're computed here from `forecast_cat` using the
    same model the workbook used (Pipeline 0% / Developing 30% / Upside
    70% / Committed 100%, see the Methodology tab).
  - `merge_spreadsheet_extras` — best-effort backfills Del Org / OBU from
    the workbook onto the HubSpot-primary open deals table, matched by
    (company, deal_name) since the spreadsheet carries no HubSpot deal ID.
    Match-rate stats land in `summary.meta.extrasMatch`.
  - `normalize_companies_hubspot` — parses the "master customer" company
    pull (companies where `lifecyclestage=customer` OR
    `previous_client_date_added__c` is set — HubSpot has no exact "Current/
    Previous Client" flag, see hubspot-data/README.md's "Known gaps"
    section). Revenue/deal-count fields are HubSpot-computed rollups, not
    calculated here; `service_lines` is derived from this pull's own
    open+FY27-closed deals (not an all-time history — same caveat as above).
- **`backend/ingest/hubspot_source.py`** — reads whatever pull
  `../hubspot-data/latest.json` points at; returns `None` if no pull has
  ever been made (the app falls back to workbook-only mode in that case).
- **`backend/ingest/aggregate.py`** — recomputes every dashboard number from
  the normalized tables (rather than reading either source's own pivot
  tabs). Column-name-driven, not source-driven, so it works identically
  whichever normalize path fed it. Also builds the deal-detail JSON
  (`build_deal_detail` / `build_closed_deal_detail`), including the 4
  HubSpot-only attribute groups (Engagement & Activity, Win/Loss Detail,
  Contract & Approval, Deal Classification) that show blank on a
  workbook-only snapshot.
- **`backend/ingest/pipeline.py`** — ties the above together two ways:
  `process_workbook()` (workbook alone, the original path) and
  `process_hubspot()` (HubSpot-primary + workbook extras, see above). Both
  seed/extend `data/trend_history.json` from the workbook's `_SnapWeekly` /
  `_SnapMonthly` / `_SnapArchive` tabs plus one point per snapshot going
  forward.
- **`backend/api/`** — FastAPI routes: `GET /api/current` (the active
  snapshot), `GET /api/deal/{id}` / `GET /api/closed-deal/{id}` /
  `GET /api/customer/{id}` (detail views), `POST /api/upload` (ingest a new
  workbook), `POST /api/ask` (the chat endpoint).
- **`backend/main.py`** — mounts the routes above and, on startup, calls
  `pipeline.process_hubspot()` if a HubSpot pull is available (see Run).
- **`backend/ask/`** — the Claude tool-calling loop for Ask a Question.
  Claude can only see the data through a constrained `query_data` tool
  (filter/group/aggregate over the normalized tables) and answers by
  calling a `final_answer` tool with a structured chart/table shape, so
  answers are always backed by a real query rather than a guess.
- **`backend/data/`** — `snapshots/<timestamp>/` holds each snapshot's
  computed summary (`summary.json`) and normalized tables (parquet, for
  the Ask tool to query); `current.json` points at the active one;
  `trend_history.json` accumulates the Trends view's data points.
- **`../hubspot-data/`** — raw HubSpot pulls (open + FY27 closed deals, plus
  "master customer" companies), one timestamped folder per pull,
  `latest.json` pointing at the current one. See its README for the exact
  pull procedure — it's manual/on-request, not an automated backend job (no
  HubSpot Private App token is configured; see that README's "Known gaps"
  section for why).
- **`frontend/`** — a plain HTML/CSS/JS single-page app (no build step),
  adapted from the original design mockup. `app.js` fetches
  `/api/current`, renders each dashboard view (including **Performance →
  Closed Deals**: Won/Lost/All filter, the same 9-dimension filter row as
  Target Deals, and click-through detail; and **Customers → Master
  Customer**: 8 filter dimensions — status, country, industry, business
  unit, ICP tier, account sales tier, owner, service line — plus free-text
  search and click-through detail), and posts to `/api/ask` for the chat.

## Known limitations / possible follow-ups

- Single user, no auth — anyone who can reach the port can upload data or
  ask questions.
- HubSpot refresh is manual/on-request through the Claude connector, not a
  scheduled job — the account currently used for pulls doesn't have HubSpot
  Super Admin / App Marketplace permission, which a Private-App-token-based
  headless refresh would need. See `../hubspot-data/README.md`.
- Sellers/quota, Line Items, Sales Hygiene, and FY26 closed-deal history
  still come only from the workbook — no HubSpot equivalent has been pulled
  for these yet (Sellers/quota in particular has no HubSpot object to pull
  from at all).
- Del Org / OBU backfill onto HubSpot data is best-effort (name match, no
  shared ID) — check `summary.meta.extrasMatch` after a refresh for the
  current match rate.
- Master Customer's "Service Lines" only reflects this pull's open+FY27-closed
  deals, not all-time history — most companies' service-line history predates
  FY27, so coverage is low (187/744 companies as of the 2026-08-04 pull). A
  true all-time rollup would need a full-portal DEAL query that currently
  hits a 1000-row cap with no working way to narrow it further.
- "Current vs. Previous Client" status (both deals and customers) is a
  proxy (`lifecyclestage`/`previous_client_date_added__c`), not an exact
  HubSpot field — see hubspot-data/README.md.
- The Ask feature's chart types are limited to bars and simple tables; no
  line/time-series chart yet even though Trends data would support one.
