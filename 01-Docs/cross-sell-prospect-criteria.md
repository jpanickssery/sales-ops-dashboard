# Cross-Sell Prospect Identification — Requirements & ICP Criteria

**Status:** Draft v1 — informs the "Cross-Sell Customers" page under Prospects in the FY27 Pipeline Analytics app.
**Author context:** Written from HGS's live HubSpot CRM schema, the HGS Plays Portfolio (https://hgs-portfolio-static.vercel.app), and the existing ad hoc whitespace analysis in `HGS_Master_Customer_Analysis-v5.xlsx`.

---

## 1. Purpose & Scope

Define, in concrete and computable terms, what makes an **existing HGS customer** a good **cross-sell prospect** — i.e., a candidate for landing a new service line or portfolio play beyond what they already buy. This is deliberately scoped to the *existing customer base*, not net-new logo acquisition:

| Motion | Population | Out of scope here? |
|---|---|---|
| **New Logo** | Never a customer | Yes — different ICP/qualification problem (firmographic fit + intent signals, no HGS history to lean on) |
| **Cross-Sell** (this doc) | Status = Current (or Current & Previous), buying ≥1 service line today | **In scope** |
| **Win-Back** | Status = Previous only (churned/lapsed) | No — related, but a different motion (re-engagement, not expansion); HGS already has a "Win-Back Targets" cut in the master analysis |

A cross-sell prospect, concretely: **an active HGS account with room to buy something they don't already buy, where HGS has a right to win and a reasonable path to a warm conversation.**

This maps directly onto a field HGS's own CRM already uses: `dealtype = ECNB` ("Existing Customer, New Business") is literally the deal-type code for a cross-sell deal, as distinct from `NCNB` (new logo), `ECEB` (existing customer, existing business — a renewal/expansion of what they already have), and `Framework` (MSA-level). The criteria below are, in effect, a leading indicator for "which current accounts are likely to produce an ECNB deal next."

---

## 2. Grounding: HGS's Actual Portfolio & Data Model

### 2.1 The HGS Plays Portfolio (three pillars)

The portfolio site organizes everything HGS sells into three portfolios, each with a handful of strategic plays, each broken into six-step project-play journeys:

| Portfolio | Promise | Strategic Plays | Buyer |
|---|---|---|---|
| **Intelligent Interactions** | Grow Customers | Marketing Transformation · Service Experience Transformation · Sales Transformation | CMO, VP CX, VP Sales |
| **Intelligent Platforms** | Build Digital Foundations | Enterprise Planning · Data & AI Foundation · Content & Context Foundation · Application & Cloud Modernization | CIO, CTO, CDO |
| **Intelligent Operations** | Run AI-Native Operations | Employee & Enterprise Operations · Industry Managed Services · Outcome-Based Operations Transformation | COO, CFO, Shared Services / vertical Ops heads |

**Industry Managed Services** (inside Intelligent Operations) is explicitly organized by vertical — **BFSI, Insurance, Healthcare, Retail & CPG, Telecom** — each with its own named project play (Banking Operations/KYC/AML/Collections, Insurance Claims Operations, Healthcare Member/Provider Services Operations, CPG/Retail Operations, Telecom & Network Operations). This is the clearest signal of where HGS has invested in vertical depth, and it's the natural first filter for industry-fit scoring below.

### 2.2 The service lines HGS already tracks, and coverage today

The existing `HGS_Master_Customer_Analysis-v5.xlsx` (Service Line Coverage tab) tracks exactly **9 service lines** across the current book of business:

| Service Line | # Current Clients Using | % of Current Clients | Maps to portfolio |
|---|---:|---:|---|
| Data & Analytics | 82 | 16.0% | Intelligent Platforms → Data & AI Foundation |
| Staff Augmentation/Consulting | 76 | 14.9% | Intelligent Operations → Outcome-Based Transformation (Flexible Talent & Expert Services) |
| Cloud & Infrastructure | 68 | 13.3% | Intelligent Platforms → Application & Cloud Modernization |
| Digital/Automation/RPA | 67 | 13.1% | Intelligent Platforms (Platform Engineering) / Intelligent Operations (automation) |
| Voice/Contact Center/BPO | 62 | 12.1% | Intelligent Interactions → Service Experience Transformation |
| Marketing/Social Media | 58 | 11.4% | Intelligent Interactions → Marketing Transformation |
| Planning/Finance Systems | 55 | 10.8% | Intelligent Platforms → Enterprise Planning |
| SAP/ERP Consulting | 50 | 9.8% | Intelligent Platforms → Application & Cloud Modernization |
| CX/CRM Platforms | 29 | 5.7% | Intelligent Interactions → Sales/Service Transformation |

Two things worth noting for whoever builds on this:

1. **This 9-line taxonomy predates the 3-portfolio/10-strategic-play structure** on the live portfolio site. They're conceptually compatible (mapping above), but not identical, and HGS's CRM `service_line` field on deals is **free text**, not a picklist against either taxonomy — the app today shows whatever string a rep typed (e.g., "Digital Engineering", "Contact Center Modernization", "HGS Staffing – OSS Salary"). **Recommendation:** normalize `service_line` into a controlled picklist (ideally aligned to the 10 strategic plays, since that's the forward-looking sales motion) so whitespace math is precise instead of approximate. Until that lands, whitespace scoring has to work off the *count* of distinct service-line strings per account, not a clean check against the canonical 9 (or 10).
2. The technology/platform partner roster on deals (`partner_account__c`: AWS, Genesys, Twilio, Microsoft, SAP, Snowflake, Databricks, UiPath, Automation Anywhere, Sprinklr, Anaplan, Pigment, Onestream, ContentStack, Drata, SentinelOne, …) lines up cleanly with the Intelligent Platforms and Intelligent Interactions plays and is a second, corroborating whitespace signal: an account using a partner platform HGS already integrates with (e.g., a Genesys or Twilio shop) is a warmer lead for Service Experience Transformation than one with no CX platform relationship at all.

### 2.3 HGS's own account-tiering fields (already in HubSpot, already in this app)

Two HubSpot company properties already do real ICP/relationship classification work — this doc builds on them rather than inventing a parallel system:

**`hs_ideal_customer_profile`** ("ICP Tier") — HGS has defined ICP explicitly around company **revenue size**:

| Value | Meaning |
|---|---|
| Large ($5B+) | Enterprise — largest expansion headroom, most budget, longest sales cycles |
| Mid ($500M – $5B) | Core mid-market — HGS's bread-and-butter account size |
| Small (< $500M) | Smaller accounts — real but bounded expansion ceiling |

**`account_sales_tier__c`** ("Account Sales Tier") — a relationship-stage field, not a size field:

`Existing Client – Strategic` · `Existing Client` · `New Client (12 mos.) – Strategic` · `New Client (12 mos.)` · `Tier 1` / `Tier 2` / `Tier 3` · `Previous Client` · `Client` · `Channel Partners` · `Analyst` · `Agency`

The "Strategic" variants are HGS's own flag for its most important relationships — treat as a strong positive signal, not just a label. `Previous Client` should always route to Win-Back, never Cross-Sell.

This app already surfaces both fields (`icpTier`, `accountSalesTier`) plus `status` (Current / Previous / Current & Previous, derived from `is_current`/`is_previous`), `industry`, `numOpenDeals`, `numWonDeals`, `numContacts`, `totalRevenue`, `revenueFY27`, `revenueFY28`, and `serviceLines` (the distinct list of service-line strings associated with the account) on the Master Customer data model — **every field this framework needs already exists in the data pipeline.** No new HubSpot properties or backend fields are required to ship v1.

### 2.4 Prior art: the existing ad hoc "Whitespace Score"

`HGS_Master_Customer_Analysis-v5.xlsx`'s "Whitespace Opportunities" tab already assigns every account a Whitespace Score. Reverse-engineering the ~100 rows shows the formula is:

```
Whitespace Score = ICP_Weight × (9 − Num Service Lines Identified)
  where ICP_Weight:  Large ($5B+) = 3,  Mid ($500M–5B) = 2,  Small (<$500M) = 1
```

i.e., score = tier weight × service lines *not yet* bought, out of the 9 tracked. It's a reasonable first cut — bigger account + more whitespace = higher score — but it has real gaps this framework is designed to close:

- **No relationship-health signal at all.** A large account with zero won deals and zero contacts scores identically to one with a thriving, multi-year relationship and an active champion, as long as service-line count matches. That's backwards — the accounts most likely to actually convert on a cross-sell are the ones with *proven* delivery success, not just "hasn't bought much yet."
- **No revenue-in-hand signal.** Doesn't distinguish a $50K logo from a $10M relationship within the same ICP tier.
- **No industry/vertical-fit signal.** Treats a BFSI account (where HGS has a named Industry Managed Services play) the same as an industry HGS has no dedicated play for.
- **No exclusion for lapsed relationships** — worth double-checking the underlying data doesn't leak `Previous`-only accounts into the whitespace cut.

Section 5 below proposes a scorecard that keeps the whitespace insight but adds these three dimensions.

---

## 3. What Good Looks Like: the Cross-Sell ICP

Combining HGS's own ICP definition (§2.3) with the portfolio structure (§2.1), the ideal cross-sell prospect looks like this:

- **Size:** Mid-to-Large ICP tier ($500M+ revenue) — big enough to have multiple buying centers and budget for a second service line, without requiring the multi-year enterprise sales cycle of the very largest accounts. (Large accounts are still excellent targets — they just take longer and need executive-sponsor mapping before they'll convert.)
- **Industry:** Ideally BFSI, Insurance, Healthcare, Retail/CPG, or Telecom — HGS has a named, productized Industry Managed Services play and delivery pattern for each. Outside those five, HGS can still sell (Intelligent Interactions and Intelligent Platforms are industry-agnostic), but there's no vertical-specific playbook to lean on.
- **History:** Already `Current` (not lapsed), with at least one closed-won deal (proven delivery, not just a logo on paper) and visible recent activity (open deals and/or contacts on file) — a relationship someone can actually pick up the phone on.
- **Service Line coverage:** Buying 1–3 of the ~9 tracked service lines today, not the full spread — real whitespace remains, but there's enough of an existing footprint that HGS already has a foot in the door (a security-vetted vendor, an existing SOW/MSA, a known point of contact).
- **Existing relationship / account tier:** `account_sales_tier__c` of `Existing Client` or, ideally, `Existing Client – Strategic` — HGS has already decided this relationship matters.
- **Platform adjacency:** Uses a partner platform (Genesys, Twilio, Snowflake, SAP, Anaplan, etc.) that HGS already integrates with for a play the account doesn't yet have — a corroborating, not primary, signal.

The **worst** cross-sell candidate, by contrast: `Previous`-only status (lapsed — that's Win-Back), Small ICP tier with zero won deals (unproven, low ceiling), an industry with no HGS vertical play and no platform adjacency, and/or full coverage across all tracked service lines already (nothing left to sell).

---

## 4. Criteria Framework

Four dimensions, matching how the business actually asks the question ("how big are they, what industry, how long/well have we worked with them, what do they already buy from us"):

### 4.1 Size (firmographic)

| Signal | Field | Why it matters |
|---|---|---|
| ICP Tier | `icpTier` (`hs_ideal_customer_profile`) | HGS's own revenue-band classification; primary size signal |
| Annual Revenue | `annualRevenue` | Backs up ICP tier where it's blank/stale; finer-grained than the 3 tiers |
| Total HGS revenue to date | `totalRevenue` | Size of the *relationship*, not just the company — a proxy for wallet share and buying-center depth |

### 4.2 Industry

| Signal | Field | Why it matters |
|---|---|---|
| Industry | `industry` | Maps to a named HGS vertical play (BFSI/Insurance/Healthcare/Retail·CPG/Telecom) or not — determines which strategic play to lead with, and whether a productized delivery pattern exists |
| Country / region | `country` | Secondary — informs which HGS business unit/delivery center is the natural owner (see `originating_business_unit__c`: APAC, UK, USA, LatAm, HGS Digital, TekLink, …) |

### 4.3 History (relationship health & momentum)

| Signal | Field | Why it matters |
|---|---|---|
| Status | `status` (Current / Previous / Current & Previous) | Hard gate — Previous-only is Win-Back, not Cross-Sell |
| Account Sales Tier | `accountSalesTier` | `Existing Client – Strategic` is HGS's own flag for its most important relationships |
| Won deals | `numWonDeals` | Proven delivery — the strongest "we can execute for this account" signal |
| Open deals | `numOpenDeals` | Active engagement right now — a live reason to be in the account already |
| Associated contacts | `numContacts` | Relationship breadth/access — more contacts means an easier warm intro to a second buying center |
| Lifecycle stage | `lifecycleStage` | Sanity check against status (e.g., "customer" should correlate with `Current`) |

### 4.4 Service Line (existing footprint / whitespace)

| Signal | Field | Why it matters |
|---|---|---|
| Distinct service lines bought | `serviceLines` (count) | Core whitespace measure — fewer today = more room to grow, *given* the account is otherwise healthy |
| Which service lines, specifically | `serviceLines` (list) | Determines *which* strategic play to lead with next — e.g., an account with Voice/Contact Center only is a natural fit for Marketing Transformation or Data & AI Foundation next, not another CX play |
| Platform/partner adjacency | `partner_account__c` on deals (not yet in this app's data model) | Corroborating signal — using a partner platform HGS already integrates with lowers integration risk for the next sale |

---

## 5. Proposed Scoring Model

A single **Cross-Sell Fit Score (0–100)**, computed only for accounts with `status ∈ {Current, Current & Previous}` (Previous-only accounts are excluded entirely — they belong on a Win-Back list, not this one):

| Component | Weight | Computation |
|---|---:|---|
| **Whitespace** | 35 pts | `35 × (1 − serviceLines.count / max_service_lines_observed)` — fewer existing service lines (relative to the widest-covered account in the book) → higher score |
| **Size / ICP Tier** | 25 pts | Large ($5B+) = 25 · Mid ($500M–5B) = 17 · Small (<$500M) = 8 · unknown = 4 |
| **Relationship Health & Momentum** | 25 pts | `numWonDeals > 0` → +12 (proven delivery) · `numOpenDeals > 0` → +6 (active engagement) · `numContacts ≥ 3` → +7 (relationship access); capped at 25 |
| **Industry / Vertical Fit** | 15 pts | Industry matches a named HGS vertical play (BFSI/Banking/Financial Services, Healthcare/Insurance, Retail/CPG, Telecom) → 15 · other known industry → 7 · blank → 4 |

**Tiering** (for prioritization, not just a raw number). Thresholds are calibrated against the actual score distribution on the live book (726 Current accounts), not round numbers picked in the abstract — most current accounts show 0–2 identified service lines, so whitespace + size + industry alone put a lot of the book in the 50s–60s before relationship signal is even added. Round thresholds of ≥70/45 put **99% of the entire book in Hot+Warm**, which isn't a useful prioritization; the calibrated thresholds below put roughly the top 15–20% in Hot and the bottom 10–15% in Monitor instead:

| Tier | Score | ~Share of book (observed) | Meaning |
|---|---|---|---|
| 🔥 **Hot** | ≥ 75 | ~17% | Lead with this quarter — big, healthy relationship, real whitespace, clear play to pitch |
| 🌤 **Warm** | 55–74 | ~70% | Good candidate — qualify further (confirm sponsor access, validate whitespace against actual play needed) before investing outreach |
| ⬜ **Monitor** | < 55 | ~13% | Either too little whitespace (already broad coverage), too little relationship depth to lean on yet, or too small to prioritize right now — revisit if status changes |

Re-check these percentile cut points against the live distribution any time the weights change — a threshold tuned for one weighting scheme won't necessarily still produce a useful split under a different one.

This keeps the existing spreadsheet's core insight (bigger account + more whitespace = better prospect) but stops a large, cold, zero-relationship account from outscoring a mid-size account with a proven, active, multi-contact relationship — which is the gap most likely to send sellers chasing the wrong accounts first.

**Known v1 simplification:** because `service_line` is free text rather than a controlled picklist (§2.2), "whitespace" here is a *relative* measure (this account's service-line count vs. the widest-covered account currently in the book), not an absolute count against the canonical 9-line (or 10-play) taxonomy. Once `service_line` is normalized to a fixed list, whitespace scoring should switch to the absolute form used in §2.4's reverse-engineered formula (count against the true universe of lines/plays, not the observed max), and should also start recommending the *specific* next play rather than just a whitespace score.

---

## 6. General B2B Cross-Sell Best Practices

Beyond the HGS-specific criteria above, a few principles from account-based expansion selling worth building into how this page evolves:

1. **Segment before you score.** Don't run one funnel-wide model — the right ICP profile differs by portfolio (an Intelligent Operations sale to a COO looks nothing like an Intelligent Interactions sale to a CMO). Where possible, score *fit for a specific next play*, not just "fit for HGS in general."
2. **Whitespace ≠ intent.** A gap in coverage is necessary but not sufficient — pair it with a trigger event (new exec hire, funding round, M&A, a competitor's contract expiring, a support ticket spike, a champion changing roles) wherever that signal is available. This app doesn't have trigger-event data yet; it's a natural v2 addition (news/intent-data feed, or manual notes from the account team).
3. **Map the buying committee, not just the account.** `numContacts` is a coarse proxy for access — the real question is whether HGS has a relationship with the specific buyer for the *new* service line (e.g., the CX contact HGS already has doesn't help sell into Finance). Longer-term, this argues for tracking contact-level role/department, not just a company-level count.
4. **Land-and-expand cadence matters more than a single score.** The best-run cross-sell motions review this list on a fixed cadence (monthly/quarterly) tied to QBRs, not ad hoc — the Hot/Warm/Monitor tiers above are designed to slot into that rhythm.
5. **Wallet share, not just revenue.** `totalRevenue` at HGS says nothing about the account's *total* spend on the categories HGS could sell into. Where available (e.g., from a G2000-style estimate or the account team's own knowledge), a wallet-share estimate turns "this account is big" into "this account spends $X on X and HGS has $0 of it."
6. **Health gates before growth gates.** An account with open delivery/risk issues (escalations, at-risk renewals, low CSAT) is a bad cross-sell target no matter how much whitespace exists — expansion conversations land better from a position of proven success. This app doesn't yet have a health/CSAT signal; the Deal Health & Risk page's hygiene flags are the closest proxy today and could be joined in as a negative modifier.
7. **Score decay.** Relationship signals (contacts, recent activity) go stale — a score computed once and never refreshed drifts from reality within a quarter. Recompute on every data refresh (this app already re-ingests HubSpot data as a snapshot, so this falls out for free) rather than treating it as a one-time exercise like the source spreadsheet.

---

## 7. Data Requirements Summary

Everything needed for the v1 scoring model above is already present in this app's data pipeline (`build_customers_list` in `backend/ingest/aggregate.py`): `icpTier`, `accountSalesTier`, `status`, `industry`, `numWonDeals`, `numOpenDeals`, `numContacts`, `totalRevenue`, `revenueFY27`, `annualRevenue`, `serviceLines`. **No new backend fields, HubSpot properties, or ingest changes are required to ship the Cross-Sell Customers page.**

Gaps for a v2, in priority order:

1. **Normalize `service_line` to a controlled picklist** (ideally the 10 strategic plays) — turns relative whitespace into precise, actionable "sell them Play X next" guidance.
2. **Surface `partner_account__c` (deal-level platform partner) at the account level** — a real, already-captured corroborating whitespace signal this app doesn't currently roll up to the customer object.
3. **A health/risk modifier** joined from the existing Deal Health & Risk hygiene flags, so an at-risk account doesn't get recommended for expansion outreach.
4. **Trigger-event / intent data** (exec changes, funding, competitor contract expiry) — not in HubSpot today; would need a new source (news/intent feed or manual account-team notes).
5. **Contact-level role/department** — to move from "N contacts" to "do we know the buyer for the specific play we'd pitch."

---

## 8. Open Questions

- Should Cross-Sell scoring exclude accounts below a minimum `totalRevenue` or deal-count floor regardless of tier, to keep the list focused on accounts sellers can realistically prioritize this quarter?
- Should `Existing Client – Strategic` accounts get a fixed bonus/floor on top of the formula (i.e., a strategic account should probably never show as "Monitor" even with full service-line coverage, since there may be adjacent/renewal plays not captured by whitespace alone)?
- Who owns re-validating the Industry → HGS-vertical mapping in §4.2 as HGS's own portfolio/plays evolve?
- **Data-quality note found while building v1:** `status` (derived from HubSpot's `is_current`/`is_previous`) and `account_sales_tier__c` sometimes disagree on the same company — e.g. an account showing `status = Current` (and so included here) while `account_sales_tier__c = "Previous Client"`. This framework trusts `status`, matching how the rest of this app already partitions Current vs. Previous — but it means `accountSalesTier` shown alongside a Cross-Sell row shouldn't be read as a second confirmation of "current," just as HGS's own relationship-stage label, which can lag. Worth a CRM data-hygiene pass independent of this feature.
