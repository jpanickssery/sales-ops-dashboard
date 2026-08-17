# Rearchitect HGS Pipeline Analytics onto SQLite + Auth, new repo, Railway deploy

## Context

The current app (`app/backend` + `app/frontend` in this repo) stores every ingest run
(workbook upload or HubSpot pull) as a timestamped folder of parquet files + a
`summary.json` blob under `app/backend/data/snapshots/<ts>/`, has zero auth, and only
runs locally via `uvicorn`. The user wants to:

1. Move to a **relational SQLite backend** that can store snapshot history properly.
2. Deploy on **Railway**, updating only a clean **new GitHub repo ("sales-ops-new")**
   going forward — this repo's git history has real HubSpot company/deal data
   committed to it and should not be reused/pushed publicly.
3. Add **real (if lightweight) multi-user auth** — login required on every page/route,
   an admin role, an admin panel for user management, and move data-refresh controls
   behind that admin gate.
4. Keep the manual, two-step refresh workflow: pull HubSpot data locally via the
   Claude connector (unchanged), then upload the result **through the browser to the
   live app**, which ingests it straight into the SQLite file on a Railway volume. No
   redeploy-to-refresh-data, ever.

Investigation (two Explore agents + one Plan-agent design review, full findings folded
in below) surfaced that today's "slow search" is **not a data-layer problem** — dataset
sizes are tiny (47–801 rows per table) and the real cause is `app.js`'s `render()`
doing a full DOM rebuild on every keystroke of the 3 live-search inputs with zero
debounce. Decision: **keep client-side filtering as-is**; only fix the debounce bug.
The Ask feature's pandas-based `query_data` tool also stays as-is architecturally —
just re-pointed at SQLite-loaded tables instead of parquet.

Investigation also surfaced a real existing bug worth fixing as part of this move:
detail-page IDs (`/api/deal/{id}`, `/api/closed-deal/{id}`, `/api/customer/{id}`,
`/api/seller/{id}`) are today the **positional row index** into that snapshot's
dataframe (`df.iloc[id]`), not a stable key — so old links silently point at the
wrong row after any re-ingest. Moving to SQL autoincrement primary keys fixes this,
but requires a specific insert→re-select sequencing (see below) or the bug just
reappears in a new form.

## New repo / folder

- Scaffold everything under `newapp/` in this working directory.
- `git init` inside `newapp/` as its own standalone repo (separate history from the
  current repo, which has committed HubSpot data). Ready for `gh repo create
  sales-ops-new` and a push once the user approves.
- `newapp/` is code + schema only — no business data files, no `01-Docs`, no
  `hubspot-data/` pull folders committed. `.gitignore`: `*.db`, `/data/`, `.env`.

## Data model (SQLite, plain `sqlite3` + pandas `to_sql`/`read_sql` — no ORM)

No ORM/Alembic: dataset is tiny, existing code is already pandas-idiomatic, and a
single-file SQLite DB with hand-written `CREATE TABLE IF NOT EXISTS` DDL is simplest
to reason about and matches the codebase's existing style.

**Critical: define one canonical, nullable superset of columns per table up front**,
because `normalize.py`'s HubSpot-sourced path (`normalize_open_deals_hubspot`, etc.)
produces ~25 columns (`next_step`, `competitor`, `contract_start_date`, `deal_score`,
...) that the workbook-only path (`normalize_open_deals`) never produces, and
`to_sql(if_exists="append")` does not reconcile a DataFrame's columns against an
existing table's schema. Every ingest path must `df.reindex(columns=FULL_COLUMNS)`
(fill missing with `None`) immediately before `to_sql`, regardless of source. Put this
column-union list and the reindex helper in `db.py`, derived once from reading both
`normalize.py` code paths.

Tables:
- `snapshots(id TEXT PK, created_at TEXT, source TEXT, hubspot_pulled_at TEXT,
  hubspot_snapshot_id TEXT, workbook_available INTEGER, extras_match_json TEXT,
  summary_json TEXT)` — `summary_json` is the same precomputed `build_snapshot()` dict
  as today's `summary.json`, just a column instead of a file.
- `app_state(key TEXT PK, value TEXT)` — key-value singleton table holding
  `current_snapshot_id` (replaces `current.json`) **and** `last_hubspot_snapshot_id`
  (a second, independent pointer — see "workbook-after-HubSpot" note below; replaces
  today's `hubspot_source.latest_snapshot_id()`).
- One table per normalized dataframe — `open_deals, closed_deals, line_items,
  sellers, hygiene, customers` — each `id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT REFERENCES snapshots(id), <canonical superset columns>`. Index on
  `snapshot_id`; index `hs_object_id` where the column exists. This `id` becomes the
  new stable key for all detail routes.
- `trend_points(label TEXT PK, deals INTEGER, fy27rev REAL, updated_at TEXT)` —
  replaces `trend_history.json`, same upsert-by-label semantics as today's
  `snapshot.merge_trend_point`.
- `users(id INTEGER PK AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT,
  role TEXT CHECK(role IN ('admin','viewer')), is_active INTEGER DEFAULT 1,
  created_at TEXT, last_login_at TEXT)`.

On connect, set `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` — smooths
over concurrent access from admin uploads + normal dashboard requests within one
process.

## Ingest pipeline changes

Reuse unchanged: `ingest/parse_workbook.py`, `ingest/normalize.py` (logic as-is, only
add the reindex-to-canonical-columns step before persistence), `ask/tools.py`,
`ask/claude_client.py`.

Rework `ingest/pipeline.py` (`process_workbook`, `process_hubspot`) and replace
`ingest/snapshot.py` with a new `db.py`:

1. **Insert-then-reselect sequencing (required, not optional):** `pandas.to_sql`
   doesn't return inserted rowids. So: normalize → reindex to canonical columns →
   `to_sql(if_exists="append", index=False)` with `snapshot_id` stamped on every row
   → **re-select back** (`SELECT * FROM open_deals WHERE snapshot_id=? ORDER BY id`)
   to get id-bearing DataFrames → *then* run `aggregate.build_snapshot()` on those →
   write `summary_json`. Building the summary before the reselect would silently
   resurrect the positional-id bug in a new form.

2. **Stable-ID fix — 7 call sites**, not just the 4 detail routes (confirmed by
   reading `aggregate.py` in full):
   - `routes_data.py`'s `get_deal`, `get_closed_deal`, `get_customer`, `get_seller` —
     switch from `df.iloc[id]` (positional) to a SQL lookup by the real `id` column,
     scoped to the current snapshot: `WHERE id=? AND snapshot_id=?` (keeps today's
     "only the current snapshot is servable" behavior — a stale link from before a
     re-ingest should 404, not silently resolve to old data).
   - `aggregate._build_deal_rows` / `_build_closed_deal_rows` — use the row's real
     `id` column, not `df.index`.
   - `aggregate._build_sales_hygiene` (builds `dealId` links for Sales Hygiene rows,
     used by `app.js`'s `data-deal-id` on that page) — same fix.
   - `aggregate._build_sellers` (Seller Leaderboard/Performance `data-seller-id`) —
     same fix.
   - `aggregate.build_customers_list` (Master Customer `data-customer-id`) — same fix.
   - (`_build_accounts` is fine as-is — keyed by company name, no detail route.)

3. **Workbook-only re-upload after a prior HubSpot ingest.** Today, once any HubSpot
   pull exists, every subsequent workbook upload still routes through
   `process_hubspot()`, which re-reads the **raw HubSpot pull JSON from disk** to
   re-merge Del Org/OBU. Once raw pull JSON isn't retained after ingest (see below),
   there's nothing to re-read. Fix: change the merge step to source the latest
   HubSpot-derived open/closed/customer rows from **already-normalized SQL**
   (`SELECT * FROM open_deals WHERE snapshot_id = <last_hubspot_snapshot_id>`) and run
   `normalize.merge_spreadsheet_extras` against those directly — no raw-JSON
   re-normalization needed. This is why `app_state.last_hubspot_snapshot_id` must be
   tracked independently of `current_snapshot_id`.

4. **`hubspot_source.py`**: rework to read from the just-uploaded multi-file set for
   the ingest currently in progress (passed in from `routes_upload.py`), rather than a
   fixed local `app/hubspot-data/` directory (Railway has no such pre-populated
   folder). Keep the same tolerance as today's `load_latest_pull()`: `open_deals.json`
   + `closed_deals.json` required, `companies.json`/`meta.json` optional.

## Auth

- `bcrypt` for password hashing. `itsdangerous.TimestampSigner` for a signed session
  cookie, `SECRET_KEY` env var.
- **Cookie holds only `user_id`** (not role/status) — on every authenticated request,
  do one indexed `SELECT is_active, role FROM users WHERE id=?` and treat the DB as
  the source of truth. This makes deactivating a user or changing their role take
  effect on their very next request, without needing a server-side session table.
  ~7-day expiry, `httponly`, `samesite=lax`, `secure` gated behind a `COOKIE_SECURE`
  env var (off for local `http://` dev, on for Railway's HTTPS).
- **Don't gate the `StaticFiles(html=True)` mount with middleware** — with only 3-4
  frontend files total, explicit routes are simpler and remove all ambiguity about
  which paths are public:
  - `GET /login` — public, serves a new standalone `frontend/login.html` (no `app.js`
    dependency).
  - `POST /api/login`, `POST /api/logout`, `GET /api/me` — login/logout + "who am I"
    (frontend needs this at boot to know whether to render the Admin nav/logout
    button).
  - `GET /` and `GET /admin` — both `require_login` (`/admin` additionally
    `require_admin`, returning a small HTML 403 for a blocked browser navigation, not
    a bare JSON error); both serve the *same* `index.html`/`app.js` SPA bundle — no
    duplicate frontend. Boot script reads `window.location.pathname` to default
    `state.page = "admin"` when appropriate.
  - `GET /app.js`, `GET /assets/{path:path}` — `require_login`.
  - A thin `require_login`/`require_admin` FastAPI dependency pair in `auth.py`,
    applied per-route — not a blanket middleware.
- **First-boot bootstrap**: if `users` table is empty, auto-create one admin user from
  an `ADMIN_BOOTSTRAP_PASSWORD` env var (username `admin`), logged once to stdout.
- Enforce `require_admin` independently on **both** halves of every admin feature:
  the `/admin` page route *and* every `/api/admin/*` + upload POST route. Don't rely
  on hiding the nav button client-side.
- Optionally set `docs_url=None, redoc_url=None, openapi_url=None` on the FastAPI app
  for the deployed instance — a deliberate choice, not required.

## Data refresh (admin-only)

- **Workbook upload** — same shape as today's `routes_upload.py` (`.xlsx`, scratch
  temp file, `process_workbook`/`process_hubspot`), now `require_admin`-gated and
  living under the Admin page instead of a general "Data" nav group.
- **HubSpot pull upload** — new endpoint, `require_admin`-gated. Use
  `<input type="file" multiple accept=".json">` + a `files: list[UploadFile]`
  FastAPI param — **not a zip**. All 4 filenames are fixed/flat (no folder structure
  worth preserving), so a zip only adds path-traversal/zip-bomb concerns and an extra
  manual step (zip it first) for no benefit. Match uploaded files by filename
  (`open_deals.json`/`closed_deals.json` required, others optional, same tolerance as
  today), and return a clear error listing what's missing if the required files aren't
  present.

## Frontend changes

- `login.html` (new, public, standalone) — username/password form, posts to
  `/api/login`, redirects to `/` on success.
- `app.js`: call `GET /api/me` at boot (`init()`) to know the current user's
  role/username; render a logout button + username in the sidebar; on any `401`
  from a fetch, redirect to `/login`.
- New `renderAdmin()` page (role-gated, only reachable via the server-enforced
  `/admin` route): user list with last-login, add/deactivate/reset-password actions,
  plus the workbook-upload and HubSpot-pull-upload controls (moved off the general
  nav into here).
- **Debounce fix** (independent bug fix, not part of the DB migration): wrap the
  `render()` calls triggered by the 3 live-search inputs (`explorer-search`,
  `account-search`, `customer-search`, app.js's `addEventListener("input", ...)`
  handlers) in a ~150-200ms debounce, so a full DOM rebuild fires once typing pauses
  instead of on every keystroke. Preserve the existing focus/cursor-restore logic
  each handler already does after `render()`.
- Everything else (client-side filter/sort logic, chart rendering, view structure)
  stays as-is — only the one-time `/api/current` fetch's backing store changes.

## Ask feature adaptation

- `routes_ask.py`: load tables via `db.py` (`pd.read_sql` per table, scoped to the
  current snapshot) instead of `snapshot.load_current_tables()` reading parquet.
- After the read, drop the `snapshot_id` column before handing tables to
  `ask/tools.py::execute_query` (pure noise — constant across an already-scoped
  query). Keep the `id` column (harmless, could help Claude reference a row).
- No change to `ask/tools.py`'s `QUERY_DATA_TOOL` table enum — `customers` stays
  excluded from Ask, same as today.
- `ask/tools.py` and `ask/claude_client.py` copied verbatim, no logic changes.

## Deployment (Railway)

- `Dockerfile`: `python:3.12-slim`, `pip install -r requirements.txt`, run
  `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Railway persistent volume mounted at `/data`; `DB_PATH` env var (default a local
  `./data/app.db` path for dev); `mkdir -p` its parent dir defensively at startup in
  case the volume is empty on first deploy.
- **Pin the service to a single replica.** Railway volumes are per-instance, not
  shared — if this is ever scaled to >1 instance, each gets its own volume/file and
  they silently diverge. Document this as a hard operational constraint.
- **Backup**: no automatic volume snapshotting on Railway. Add an admin-only "download
  backup" action using SQLite's `VACUUM INTO` (a consistent point-in-time copy,
  safer than copying the live `.db` file mid-write) — separate from the manual
  data-refresh flow, purely a safety net.
- Env vars: `ANTHROPIC_API_KEY`, `SECRET_KEY`, `ADMIN_BOOTSTRAP_PASSWORD`, `DB_PATH`,
  `COOKIE_SECURE`.
- `requirements.txt`: drop `pyarrow` (parquet is gone); add `bcrypt`, `itsdangerous`;
  keep `fastapi`, `uvicorn[standard]`, `pandas`, `openpyxl`, `anthropic`,
  `python-multipart`.

## File structure (`newapp/`)

```
newapp/
├── Dockerfile
├── railway.toml                 # volume mount config (/data)
├── requirements.txt
├── .gitignore                   # *.db, /data/, .env
├── backend/
│   ├── main.py                  # explicit routes (no StaticFiles(html=True) mount
│   │                             #   at "/"); startup: db.init_db() + bootstrap admin
│   ├── db.py                    # NEW: connection/pragmas, DDL, canonical column
│   │                             #   lists + reindex helper, snapshot read/write,
│   │                             #   app_state get/set, trend_points upsert
│   ├── auth.py                  # NEW: bcrypt hash/verify, cookie sign/verify,
│   │                             #   require_login/require_admin deps, bootstrap
│   ├── api/
│   │   ├── routes_auth.py       # NEW: POST /api/login, /api/logout, GET /api/me
│   │   ├── routes_admin.py      # NEW: user CRUD, reset password, last-login list
│   │   ├── routes_upload.py     # require_admin; workbook upload (mostly unchanged)
│   │   │                        #   + new multi-file HubSpot pull upload endpoint
│   │   ├── routes_data.py       # id-based SQL lookups (WHERE id=? AND
│   │   │                        #   snapshot_id=?) instead of df.iloc[...]
│   │   └── routes_ask.py        # loads tables via db.py per-request
│   ├── ask/                     # tools.py, claude_client.py — copied verbatim
│   └── ingest/
│       ├── parse_workbook.py    # copied verbatim
│       ├── normalize.py         # unchanged logic + canonical-column reindex hook
│       ├── hubspot_source.py    # reads from the uploaded multi-file set, not a
│       │                        #   fixed local directory
│       ├── aggregate.py         # 7 id-producing call sites use real SQL id, not
│       │                        #   positional index
│       └── pipeline.py          # insert → re-select-with-id → aggregate → save;
│                                 #   workbook-after-HubSpot merge sources from SQL
└── frontend/
    ├── index.html               # + Admin nav item, logout button
    ├── app.js                   # + debounce fix, renderAdmin(), GET /api/me at boot
    ├── login.html                # NEW: standalone public login form
    └── assets/                  # hgs-logo.svg, hgs-logo-white.svg — copied verbatim
```

## Implementation order

1. Scaffold `newapp/`, git init, copy over unchanged modules (`ask/`,
   `parse_workbook.py`), `requirements.txt`.
2. `db.py`: DDL (canonical superset columns per table), pragmas, snapshot
   read/write helpers, `app_state` get/set, `trend_points` upsert.
3. `auth.py`: hashing, cookie sign/verify, `require_login`/`require_admin`,
   bootstrap-admin-on-empty-users-table.
4. Adapt `ingest/normalize.py` (reindex hook), `hubspot_source.py` (multi-file
   input), `pipeline.py` (insert→reselect→aggregate sequencing, workbook-after-
   HubSpot merge fix), `aggregate.py` (7 id call sites).
5. `api/`: `routes_data.py` (SQL id-based lookups), `routes_upload.py`
   (require_admin + multi-file HubSpot endpoint), `routes_ask.py` (db.py-backed
   table loading), `routes_auth.py`, `routes_admin.py`.
6. `main.py`: explicit routes replacing the `StaticFiles` mount, startup hooks.
7. Frontend: `login.html`, logout/username UI, `renderAdmin()` (user mgmt + both
   upload controls), `GET /api/me` at boot, 401→redirect handling, debounce fix
   for the 3 search inputs.
8. `Dockerfile`, `railway.toml`, README covering env vars + the two-step manual
   refresh flow (local pull via connector → admin-page upload).
9. Local smoke test end-to-end (see Verification below).
10. `gh repo create sales-ops-new`, push, connect Railway, set env vars + volume,
    deploy, verify against the live URL.

## Verification

- Local: run the new `uvicorn` app, confirm `/` and `/app.js` redirect to `/login`
  when logged out; log in as the bootstrap admin; confirm dashboard views render
  from a freshly-ingested SQLite DB.
- Ingest: upload a workbook (workbook-only mode), then upload a HubSpot pull
  (multi-file), then upload another workbook — confirm the third step still
  correctly merges Del Org/OBU onto the HubSpot-primary data (validates the
  workbook-after-HubSpot fix).
- Stable IDs: click into a deal/customer/seller/hygiene-flag detail view, note its
  URL id, trigger a second ingest, confirm the same id either still resolves to the
  same record (if still in the current snapshot) or 404s cleanly — never silently
  shows a different record.
- Auth: confirm a `viewer` account cannot reach `/admin` (server-side 403, not just
  a hidden nav item) or call the upload endpoints directly; confirm deactivating a
  user blocks their very next request without waiting for cookie expiry.
- Ask a Question: ask a question that requires `query_data`, confirm results match
  what the dashboard shows (spot-check one number against a manually-run SQL query).
- Railway: deploy, confirm the volume persists the DB across a redeploy, confirm
  single-replica setting, run one admin backup download.
