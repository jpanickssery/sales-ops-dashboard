# Cross-Sell Account Pitch Playbook

**Status:** Draft v1 — worked example using **Second Nature Brands** (a mid-market CPG/food & beverage manufacturer) as a stand-in for "an account that scores Hot on the Cross-Sell Fit Score." Nothing here asserts real facts about the actual Second Nature Brands — where the doc needs company-specific detail (names, org chart, trigger events), it shows the *shape* of the research to do, not invented answers. Second Nature Brands does not currently appear in this app's HubSpot extract; substitute any real Hot-tier account from the Master Customer page when running this for real.

**Relationship to other docs:** [`cross-sell-prospect-criteria.md`](cross-sell-prospect-criteria.md) answers *which* accounts to target (the Cross-Sell Fit Score, still proposed/not yet built into this app). This doc picks up from there and answers *what happens next* — how to prepare and run the actual pitch once an account is selected — and how that preparation work should live inside this app rather than in someone's inbox and a slide deck nobody else can find. [`win-back-prospect-criteria.md`](win-back-prospect-criteria.md) is the analogous doc for the separate win-back motion (lapsed accounts); much of §2–§6 below applies there too, with "re-engage" swapped for "expand."

---

## 1. Purpose & Scope

A Hot-tier score tells a seller *who* is worth pursuing. It says nothing about *how* to walk into that account and land a second service line. That gap — between "this account is a good target" and "we have a scheduled meeting with the right person and a deck that speaks to their actual situation" — is where cross-sell motions stall in practice. This doc breaks that gap into six concrete questions, in the order a rep actually needs to answer them:

1. What factors decide whether (and when) to pitch, and which play to lead with?
2. Who, specifically, do we pitch?
3. How do we get in front of them — what introduction actually works?
4. What research do we need before that first conversation, and how is it organized?
5. What collateral has to exist before the pitch can happen?
6. How does all of this live inside the FY27 Pipeline Analytics app instead of a one-off effort per account?

A seventh section covers a specific ask: designing a real-time LLM Q&A feature scoped to a single account, built on top of this app's existing Ask feature.

---

## 2. Factors to Consider Before Pitching

### 2.1 Fit factors (recap — see the Cross-Sell doc for the full model)

Whitespace (service lines not yet bought), ICP size tier, relationship health (won deals, open deals, contact count), and industry/vertical play fit. These decide *whether an account is worth prioritizing at all* — don't re-litigate them here, just confirm the account still scores Hot/Warm before investing pitch-prep time, since scores decay (§7 of the Cross-Sell doc).

For Second Nature Brands as a worked example: a CPG/food manufacturer maps to HGS's **Retail & CPG** named vertical play inside Industry Managed Services, and — if they already buy, say, Voice/Contact Center or Staff Augmentation from HGS — a natural next play is **Data & AI Foundation** (demand forecasting, supply-chain analytics) or **Enterprise Planning** (S&OP, finance systems), not another CX play.

### 2.2 Timing factors

| Signal | Why it matters | Where it comes from |
|---|---|---|
| Current SOW/delivery health | Don't pitch expansion during an active escalation or at-risk renewal — it reads as tone-deaf and burns the relationship you're trying to expand. | Deal Health & Risk page hygiene flags (proxy today; see Cross-Sell doc §6.6) |
| Contract/renewal windows | A cross-sell conversation lands better bundled into a renewal or MSA-rider discussion than as a cold ask mid-contract. | Deal `closedate`/`contract_start_date` on existing deals |
| Client fiscal year / budget cycle | Pitching a new spend line after the client's budget is already locked means a 6–12 month wait no matter how good the fit is. | Not in HubSpot today — account team knowledge or public filings |
| Trigger events | A new exec hire, funding round, M&A, plant opening/closing, competitor's contract expiring, or a support-ticket spike converts "whitespace" into "intent." This is the single biggest thing separating a good cross-sell pitch from a well-timed one. | Not in HubSpot today (Cross-Sell doc §7, gap #4) — see §5.C below |

### 2.3 Play-selection factors

- **Adjacency to what they already buy** — the fastest sell is the one closest to a service line where HGS has already proven delivery (e.g., an account happy with HGS Voice/CX is a warmer lead for Marketing Transformation than for SAP/ERP consulting, which requires a completely different buying center and trust chain).
- **Platform adjacency** — if the account already runs a partner platform HGS integrates with (Genesys, Twilio, Snowflake, SAP, Anaplan, etc.), lead with the play built on that platform; it lowers perceived integration risk for the buyer.
- **Vertical play availability** — lead with a named Industry Managed Services play (BFSI, Insurance, Healthcare, Retail & CPG, Telecom) when the account's industry has one; there's productized delivery pattern and reference customers to point to. Outside those five, lean on the industry-agnostic Intelligent Interactions/Platforms plays instead.

### 2.4 Commercial factors

- Does this fit under the **existing MSA as a rider/SOW amendment**, or does it require a **new procurement and legal cycle**? The former is dramatically faster — check before promising a timeline.
- Is the **budget owner different from the current buyer**? Almost always yes for a genuine cross-sell (that's what makes it cross-*sell* rather than expansion of the same deal) — treat it as a fresh sales cycle with its own economic buyer, not an upsell email to an existing contact.
- Pricing-model consistency: does the new play's typical commercial model (FTE-based, outcome-based, subscription) fit how this client already prefers to buy from HGS, or will procurement see it as a new vendor category?

### 2.5 Risk / disqualifying factors

Open escalations, an at-risk renewal, a known incumbent with a long contract runway in the target function, or a procurement/security review burden disproportionate to the deal size. Any of these should downgrade urgency even for an account that scores Hot on fit alone — expansion conversations land from a position of proven success, not while damage control is underway elsewhere in the account.

---

## 3. Stakeholder Types to Pitch

### 3.1 By portfolio (who owns the budget for the target play)

| Portfolio | Buyer | CPG example (Second Nature Brands-style account) |
|---|---|---|
| Intelligent Interactions (Grow Customers) | CMO, VP CX, VP Sales | VP eCommerce/DTC, Head of Customer Experience |
| Intelligent Platforms (Build Digital Foundations) | CIO, CTO, CDO | VP IT, Head of Data & Analytics, Director of Supply Chain Systems |
| Intelligent Operations (Run AI-Native Operations) | COO, CFO, Shared Services/vertical Ops heads | VP Manufacturing Ops, VP Supply Chain, CFO/Shared Services (F&A, HR ops) |

### 3.2 By role in the buying process (fill in specific names during research, §5.D)

| Role | What they need from the pitch | Note |
|---|---|---|
| **Economic buyer** | ROI case, risk mitigation, peer proof points | Almost certainly *not* someone HGS already has a relationship with — that's the point of cross-sell |
| **Champion / internal sponsor** | To look good for bringing HGS in; wants a low-effort, low-risk intro | Best found via a warm handoff from the current HGS relationship (§4) |
| **Technical/operational evaluator** | Proof the solution actually works day-to-day; wants a demo, not a deck | Often the person who will live with the outcome |
| **Procurement / legal gatekeeper** | Contract shape, pricing structure, vendor-risk paperwork | Engage *after* the champion and economic buyer are bought in, not before |
| **Delivery-side end users** (existing HGS contacts) | Nothing — but they're a reference asset | Existing contacts captured as `numContacts` on the Master Customer page are almost always tied to the *current* service line, not the new buying center — don't mistake relationship breadth in one function for access in another |

---

## 4. Introductions Needed

A cross-sell pitch to a stakeholder HGS has never met should almost never start cold. In priority order:

1. **Internal handoff** — the existing account owner/CSM formally hands the pursuit to whoever is running the new play, with context (delivery history, relationship notes, any land mines). This needs to be an explicit step, not assumed — see the pursuit-stage tracker in §7.4.
2. **Client-side warm intro** — the existing internal champion introduces the target buying-center contact. This is the highest-conversion path and the one worth investing the most relationship capital in before going further.
3. **Executive-to-executive** — for Large/Strategic-tier accounts, an HGS regional or BU leader reaches out directly to the client's function head. Matches the Cross-Sell doc's note that Large accounts "need executive-sponsor mapping before they'll convert" — this is what that mapping produces.
4. **Partner co-sell intro** — where platform adjacency exists (§2.3), loop in that partner's account team (Genesys, Snowflake, SAP, etc.) for a joint intro; a partner-vouched intro to their own customer carries real weight.
5. **Reference-customer intro** — an existing HGS client in the same industry who has already made the same journey (bought the current service line, then added the target play) is strong social proof: "come talk to a peer who did exactly this."

---

## 5. Structuring the Background Research

Organize research into sections a rep can work through in order — each section either comes free from data already in this app, or is a real research task with a named source:

| Section | Content | Source today |
|---|---|---|
| **A. Company snapshot** | Industry, HQ, revenue, employee count, ownership (public/PE-backed/family-owned — materially changes the sales cycle and who the real economic buyer is), brand portfolio, recent M&A | External — company site, ZoomInfo, news |
| **B. HGS relationship history** | Owner, tenure, total revenue, service lines bought, deal history, existing contacts | **Already native to this app** — the Master Customer detail page (`/customer/{id}`) |
| **C. Trigger events & news** | Leadership changes, funding/M&A, plant openings/closures, product recalls, ESG initiatives, layoffs, competitor moves | **Gap today** (Cross-Sell doc §7, item 4) — needs an external feed; see §8 below for how to bring this into the app |
| **D. Buying-committee map** | Names, titles, LinkedIn, reporting lines for the target function, mapped to the roles in §3.2 | External — ZoomInfo/LinkedIn (a ZoomInfo connector is already available to this workspace) |
| **E. Competitive landscape** | Incumbent vendor in the target function, contract expiry timing if knowable | External — account team knowledge, public filings, news |
| **F. Whitespace & play fit** | Which specific play to lead with and why, per §2.3 | Derived from the Cross-Sell Fit Score model once built |
| **G. Reference & proof points** | Similar HGS clients in the same industry/play, relevant case studies | HGS Plays Portfolio site (hgs-portfolio-static.vercel.app) |

Sections B and F are pure data pulls this app already has (or will have once the Cross-Sell doc's scoring model ships). Sections A, C, D, and E are genuine research tasks requiring an external source — §8 proposes wiring the LLM Q&A feature to do the first pass on these automatically.

---

## 6. Resources, Campaign Material, and Demos to Prepare

| Asset | Purpose | Notes |
|---|---|---|
| **Account brief / one-pager** | Single-page summary combining §5's sections A, B, F | Should be generatable, not hand-built each time — see §7.5 |
| **Tailored pitch deck** | Customized version of the relevant Strategic Play deck from the Plays Portfolio | Swap in this account's own whitespace numbers and proof points rather than presenting a generic deck |
| **ROI / business-case model** | Quantified value case for the specific play | Needed before the economic-buyer conversation, not after |
| **Case studies / reference customers** | Same-industry, same-play proof points | Pull from the Plays Portfolio; pair with an actual reference call if the relationship allows |
| **Demo** | Live or recorded walkthrough of the specific offering (e.g., a CX platform demo, a data/AI proof of concept) | Tailor to the account's actual stack/scale, not a generic canned demo |
| **Executive briefing leave-behind** | Short document for the economic buyer to circulate internally after the meeting | Written to be forwarded without you in the room |
| **Competitive battlecard** | Positioning vs. the likely incumbent in that function | Only needed once §5.E identifies who that incumbent is |
| **Meeting/cadence plan** | Discovery → exec briefing → solution workshop → proposal → close | Mirrors the land-and-expand cadence in the Cross-Sell doc §6.4 |
| **Commercial paper ready to move** | MSA rider or new SOW template pre-drafted | So a verbal yes doesn't stall for weeks in legal drafting |

---

## 7. Designing This Into the App

Everything above is currently a manual, per-account, per-seller effort living in email threads and local slide decks. Here's how to fold it into the FY27 Pipeline Analytics app, building on structures that already exist (Master Customer detail page, snapshot-based ingest, the Ask feature) and the SQLite rearchitecture already planned in `newapp/` (see `sales-ops-new-plan.md`).

### 7.1 A new "Account Plan" tab on the Customer Detail page

The Customer Detail page (`/customer/{id}` today, backed by `build_customer_detail()` in `ingest/aggregate.py`) is currently read-only and re-derived from each HubSpot snapshot. Add a second tab, **Pitch Prep**, that is a persistent workspace rather than snapshot-derived data:

- Sections A–G from §5, laid out as editable panels. B and F auto-populate from existing snapshot data (no manual entry). A, C, D, E start empty and are filled in by the account team or by the LLM research assistant in §8.
- This must **not** live in the snapshot-scoped tables (`customers`, `open_deals`, etc.) — an account plan should survive a HubSpot re-ingest, since it's account-level planning, not deal data tied to one pull. It needs its own table, keyed by company name (or HubSpot company ID once available), independent of `snapshot_id`.

### 7.2 Data model addition

A new `account_plans` table, a natural fit alongside the `snapshots`/`app_state`/`users` tables already planned for the SQLite rearchitecture:

```
account_plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  target_play TEXT,                 -- which of the 10 strategic plays this pursuit targets
  pursuit_stage TEXT,               -- Research / Warm Intro / Discovery / Exec Briefing / Proposal / Closed
  trigger_events_md TEXT,           -- free-text research notes, §5.C
  competitive_notes_md TEXT,        -- §5.E
  research_notes_md TEXT,           -- §5.A catch-all
  status TEXT DEFAULT 'active',     -- active / parked / converted-to-deal / abandoned
  created_by INTEGER REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
)
stakeholders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_plan_id INTEGER REFERENCES account_plans(id),
  name TEXT, title TEXT, linkedin_url TEXT,
  role TEXT,                        -- Economic Buyer / Champion / Evaluator / Gatekeeper / Reference
  intro_status TEXT,                -- Not yet introduced / Warm intro requested / Met / Engaged
  notes TEXT
)
```

Reasoning for keeping this out of HubSpot's own contact schema: HubSpot contacts are keyed to the company overall, not to "this contact's role in *this* pursuit." Adding that as a HubSpot contact property would mean a schema change requiring Super Admin access this workspace doesn't currently have (see the HubSpot access notes this app's ingest already works around) — tracking it locally ships faster and avoids a cross-team schema negotiation. Revisit syncing back to HubSpot as a v2 if account teams want it visible outside this app.

### 7.3 A "Play Collateral" registry

A small static lookup — not user-editable data, just a config table or JSON file — mapping each of the 10 strategic plays to its deck link, case-study links, and battlecard link (most of this can point directly at the HGS Plays Portfolio site). This is what powers §6's "tailored pitch deck" and "case studies" rows: once an account plan picks a `target_play`, the Pitch Prep tab can surface the right collateral automatically instead of the seller hunting for it.

### 7.4 Pursuit-stage tracker

`pursuit_stage` on `account_plans` bridges a real gap: HubSpot only has a deal object once a deal exists (Stage 1–Qualify onward), but a cross-sell pursuit has real work — research, warm intro, discovery — happening *before* that deal is created. Track that pre-deal stage locally, and add a one-click "convert to deal" action once the pursuit reaches Proposal, which creates the actual HubSpot deal (this app already has read/write access to Deals via the HubSpot connector) pre-filled with `dealtype = ECNB` and the target play as the service line.

### 7.5 Generate Account Brief

A "Generate Brief" button on the Pitch Prep tab that assembles the account's HubSpot data (§5.B) plus whatever's been filled into the plan (§5.A/C/D/E/F) into a single printable page — server-rendered HTML with print-friendly CSS is enough; no need for a PDF library. This turns §6's "account brief / one-pager" from a manual slide into something that's always current with the latest snapshot data.

### 7.6 Where this fits Hot/Warm/Monitor

Only accounts scoring Hot (and, selectively, Warm) on the Cross-Sell Fit Score should get an Account Plan created — this keeps pitch-prep effort matched to the prioritization the scoring model already does, rather than every account in the book accumulating an empty plan.

---

## 8. Real-Time LLM Q&A About the Account

This app already has an "Ask" feature (`ask/claude_client.py` + `ask/tools.py`): a Claude tool-calling loop where the model calls a constrained `query_data` tool against the current snapshot's pandas tables, then returns a `final_answer` with an optional chart or table. Every number it returns is traceable to a real row in the snapshot. Extending this to answer account-specific pitch-prep questions — "what does this account already buy," but also "who's the VP of Supply Chain here" or "has this company been in the news lately" — needs two things layered on top of what exists.

### 8.1 Account-scoped Ask (reuses the existing architecture, no new tools)

Add an "Ask about this account" box directly on the Pitch Prep tab, pre-seeded with the company name. Implementation is a thin wrapper: inject the company into the system prompt ("You are answering questions about {company}; scope all query_data calls to this company unless the user asks for a peer comparison") rather than adding a new tool. This alone answers section B/F-type questions ("what have we sold them," "how many open deals," "which service lines are they missing") with zero new infrastructure.

### 8.2 A new external-research tool (this is the actual gap)

CRM data can't answer "who is the VP of Supply Chain" or "did they just have a product recall" — that needs a live external lookup, which `query_data` deliberately can't do (it's scoped to the snapshot on purpose, to keep every CRM answer provable). Add one or two new tools to the same tool-calling loop:

- **`company_lookup`** — backed by the ZoomInfo connector already available to this workspace: org chart, firmographics, technographics, contact details. This directly serves §5.D (buying-committee mapping) and part of §5.A (company snapshot).
- **`web_search`** — for trigger events and news (§5.C): leadership changes, M&A, funding, recalls, competitor moves. A server-side web search tool (no scraping infrastructure to build or maintain) is the simplest path; treat results as needing a human glance before they go in a pitch, since news search can surface stale or wrong hits.

### 8.3 Combined pitch-prep agent loop

Extend `answer_question()` to accept an optional `company` argument. When present:

- Add `company_lookup` and `web_search` to the tool list alongside `query_data`.
- Update the system prompt to route CRM-shaped questions ("what do we sell them," "have we sold them X") to `query_data`, and external-shaped questions ("who's the decision maker," "what's happening at this company") to the new tools — the model can generally infer this from the question itself once told both tools exist.
- Add a lightweight `sources` field to the final answer, since this loop now mixes provably-CRM-sourced claims with time-sensitive external claims that need to be labeled differently in the UI (a CRM number should look and read differently from a ZoomInfo/news claim that could be stale).

### 8.4 Where it lives, and how it feeds §7

Embed this as a chat widget inside the Pitch Prep tab (§7.1), scoped to that account, rather than as a separate global page — the value here is answering questions *while preparing this specific pitch*, not a general-purpose chatbot. Add a "save to account plan" action on any answer, so a good answer about the buying committee or a trigger event gets written straight into the relevant `account_plans`/`stakeholders` field instead of getting lost in chat scrollback — this is what actually closes the loop between "asked a question" and "the research is organized somewhere the whole account team can see" (§5's real goal).

### 8.5 Guardrails

- Label external-sourced answers distinctly from CRM-sourced ones, and show the "as of" timestamp on external lookups (cache these — see below — rather than re-fetching on every question).
- Cache `company_lookup`/`web_search` results per company for ~24–48h. External facts change slowly relative to CRM data, and this avoids hammering ZoomInfo/search APIs and keeps answers reproducible within one prep session.
- Don't let the model auto-assign a stakeholder's `role` (Economic Buyer / Champion / etc.) into the `stakeholders` table on its own — that's a judgment call the account team should make deliberately, even if the model's guess is a reasonable starting suggestion in the chat.

### 8.6 Fit with the SQLite rearchitecture already underway

`newapp/`'s planned move of the Ask feature's table loading from parquet to `db.py`-backed SQL reads (per `sales-ops-new-plan.md`) is the natural home for this: `account_plans` and `stakeholders` land in the same SQLite database, and account-scoped Ask can join against them directly (e.g., "have we already identified a champion here?") instead of needing a second storage layer.

---

## 9. Open Questions

- Should `stakeholders`/`account_plans` data eventually sync back into HubSpot as contact/company properties, or stay app-local indefinitely? App-local ships faster now; syncing back matters more once other teams (not just this app's users) need visibility.
- Who owns and maintains the Play Collateral registry (§7.3) as the Plays Portfolio site evolves — Marketing, or Sales Ops?
- What's the cost/rate-limit ownership for ZoomInfo and web-search API calls once wired into Ask (§8.2) — worth scoping before it's live, not after a surprise bill.
- Should Account Plan visibility be scoped to the account owner + their manager rather than all sellers, given some contents (competitive intel, trigger-event notes) may be sensitive? This mirrors the `require_admin`/`require_login` distinction already being built into `newapp/`'s auth model — Account Plans may need a third tier (owner-or-admin) rather than reusing the existing two roles as-is.
- Does a pursuit ever need more than one Account Plan per company (e.g., two different teams pitching two different plays concurrently), or is one active plan per company the right constraint?
