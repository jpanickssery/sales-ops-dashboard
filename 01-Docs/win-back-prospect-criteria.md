# Win-Back Prospect Identification — Requirements & Criteria

**Status:** Draft v1 — informs the "Win-Back Customers" page under Customers in the FY27 Pipeline Analytics app.
**Companion doc:** `cross-sell-prospect-criteria.md` — same grounding (HGS Plays Portfolio, live HubSpot schema, `HGS_Master_Customer_Analysis-v5.xlsx`), same data model, different motion. Read that doc's §2 for the full portfolio/CRM-field grounding; this doc doesn't repeat it, only what's specific to Win-Back.

---

## 1. Purpose & Scope

Define what makes a **lapsed HGS customer** worth actively re-engaging, as distinct from a Cross-Sell prospect (still-active account, sell them something new) or a New Logo (never a customer at all):

| Motion | Population | Question being asked |
|---|---|---|
| Cross-Sell | Active relationship | "What *else* can we sell this active account?" |
| **Win-Back** (this doc) | Proven history, dormant now | **"Is this lapsed relationship worth the effort to reactivate, and with what?"** |
| New Logo | Never a customer | "Should we even be talking to them?" |

HGS's own CRM already has the raw material for this: `account_sales_tier__c` includes a `Previous Client` value, and the existing `HGS_Master_Customer_Analysis-v5.xlsx` already carries a "Win-Back Targets" tab (147 companies) — this doc turns that ad hoc cut into a scored, computable model, the same way the Cross-Sell doc did for the "Whitespace Opportunities" tab.

### 1.1 A finding that changed how "lapsed" is defined here

The obvious first definition — `status = Previous` (i.e. HubSpot's `is_previous = true`, `is_current = false`) — turned out not to work against the live data, and the reason is worth recording so nobody re-derives it the hard way:

- **Every single `status = Previous` account (20 of them) has zero deals of any kind on record** — zero won, zero lost, zero total, $0 revenue. Not "used to be a customer, now dormant" — never had a deal in this data at all. That's the same stale/legacy-classification pattern the Cross-Sell doc's companion app already flags for "Previous Pursuits."
- Meanwhile, **604 of 746 total customer accounts have at least one won deal — and every one of them is flagged `status = Current`**, including accounts with zero open deals and zero forecasted revenue for years (Amazon, R.J. Reynolds Tobacco, Shell Energy U.K. — the same names that show up in the master spreadsheet's own "Win-Back Targets" tab with matching historical revenue figures). The `is_current`/`is_previous` flags are apparently set once and not revisited as a relationship goes quiet, so they don't track *actual* dormancy at all.

So this doc (and the page it drives) defines **eligibility by deal activity, not by the status flag**:

> **Win-Back eligible = `numWonDeals > 0` AND `numOpenDeals = 0` AND no forecasted revenue (`revenueFY27 = 0` and `revenueFY28 = 0`)**

i.e. *proven history, nothing open, nothing forward-looking* — regardless of what `status` says. Against the live book this produces 305 candidates (vs. 0 under the naive `status = Previous` definition), and the top accounts by historical revenue are recognizable, real former relationships, not classification noise.

**Consequence worth knowing:** because this doesn't gate on `status`, a dormant account can now appear on *both* this list and the Cross-Sell list if the Cross-Sell page's own eligibility (`isCurrent`) is still true for it despite zero real activity. That's not a bug — a dormant "Current"-flagged account genuinely is both "needs to be reactivated" and, once reactivated, "has whitespace to sell into" — but if the two lists should instead be strictly partitioned, Cross-Sell's own eligibility should switch to the same activity-based test (`numOpenDeals > 0` or forecasted revenue `> 0`) rather than trusting `isCurrent` either. That's a deliberate scope decision for whoever picks this up next, not an oversight here.

---

## 2. Why This Is a Different Problem Than Cross-Sell

Cross-Sell asks "how much whitespace is left in an active, healthy relationship." Win-Back asks a harder question first: **why did they leave, and is that still true?** Three practical differences that shape the criteria below:

1. **No live signal to lean on.** A Current account has open deals, recent activity, a lifecycle stage that reflects reality. A Previous account's data is frozen at the moment they left — `numOpenDeals` is 0 by definition, contacts on file may have moved on, and there's no way (from CRM data alone) to tell "lost the contract to a competitor" apart from "budget cut, will be back" apart from "relationship soured, avoid." That's a real gap — see §6.
2. **The right question isn't "how much whitespace" but "how much did we prove we could deliver."** Historical revenue and deal count *are* the signal here, not a limiter on it — a lapsed account that spent meaningfully with HGS for years is a fundamentally better win-back target than one that never really got going, even if both are now equally "Previous."
3. **Re-engagement needs a specific reason to reach out**, more than cross-sell does. "You already buy X from us, have you considered Y" is a natural warm conversation with an active account. "You used to buy from us, come back" needs a trigger (a contract renewal cycle at the old vendor, a new champion who doesn't share the old baggage, a service line HGS has since built out that didn't exist when they left). This app can't detect those triggers from CRM data alone — flagged as a v2 gap.

---

## 3. What Good Looks Like: the Win-Back ICP

- **Size:** Mid-to-Large ICP tier, same reasoning as Cross-Sell — bigger accounts had bigger historical spend and (usually) more buying centers, so losing the whole relationship over one bad experience or one lost renewal is less likely than a small account where a single decision-maker leaving explains the whole story.
- **Industry:** Same five HGS vertical plays (BFSI, Insurance, Healthcare, Retail & CPG, Telecom) matter here too, for the same reason — a productized playbook exists to re-approach with.
- **History:** The core differentiator. A strong win-back candidate has **real, proven historical revenue and multiple closed-won deals** — evidence HGS actually delivered, not just a logo that was in HubSpot briefly. The bigger and longer that history, the stronger the case that whatever caused the lapse was circumstantial (budget, reorg, a single bad renewal) rather than a fundamental service failure.
- **Service Line / existing relationship:** Knowing *which* service line(s) they bought before is what turns "let's win them back" into an actual pitch — re-approaching with the exact play they already know and trusted is a much easier conversation than starting from zero. Accounts with historical service-line data on file are, all else equal, better win-back targets than ones where that history was never captured.
- **Residual access:** Contacts still on file from the relationship are a head start — even if the original champion has moved on, a former economic buyer or influencer contact is worth checking on before starting cold.

The **weakest** win-back candidate: a "Previous" account with zero won deals (this was never really a customer — likely the same stale-classification issue the app's existing "Previous Pursuits" bucket already calls out on the Cross-Sell side), no contacts on file, small ICP tier, and no industry/vertical fit. There's no real relationship to win back and no obvious way back in.

---

## 4. Criteria Framework

Same four dimensions as Cross-Sell, reframed for a lapsed relationship:

### 4.1 Size (firmographic) — unchanged reasoning from Cross-Sell
`icpTier`, `annualRevenue` — bigger account, bigger prize, more likely the lapse was circumstantial rather than a hard "never again."

### 4.2 Industry — unchanged reasoning from Cross-Sell
`industry` mapped against BFSI/Banking/Financial Services, Healthcare/Insurance, Retail/CPG, Telecom — determines whether a named HGS vertical playbook exists to re-approach with.

### 4.3 History — the dimension that matters most here
| Signal | Field | Why it matters |
|---|---|---|
| Total historical revenue | `totalRevenue` | The single strongest signal — how much did HGS actually earn from this account while the relationship was active |
| Won deals | `numWonDeals` | Depth, not just size — one big deal is a different risk profile than a sustained multi-deal relationship |
| Lost deals | `numLostDeals` | A caution flag, not scored directly in v1 (see §6) — a high lost-to-won ratio may mean the relationship struggled even before it fully lapsed |

### 4.4 Service Line / existing relationship
| Signal | Field | Why it matters |
|---|---|---|
| Historical service lines | `serviceLines` (list, non-empty) | Tells you exactly what to re-pitch, and proves the relationship went far enough to actually deliver something specific |
| Associated contacts | `numContacts` | Residual access — names still on file to check in with before going in cold |

---

## 5. Proposed Scoring Model

A **Win-Back Fit Score (0–100)**, computed only for accounts meeting the eligibility test in §1.1 (`numWonDeals > 0`, no open deals, no forecasted revenue — 305 accounts on the live book, not the `status = Previous` cut, which produces zero):

| Component | Weight | Computation |
|---|---:|---|
| **History — Revenue** | 25 pts | `25 × (totalRevenue / max_totalRevenue_among_eligible_accounts)` — relative to the biggest historical relationship in the dormant book |
| **History — Deal Depth** | 15 pts | `15 × min(numWonDeals, 3) / 3` — rewards a sustained relationship (3+ won deals) over a single one-off |
| **Relationship Residue** | 25 pts | `numContacts ≥ 3` → +15 (still have names to call) · has ≥1 historical service line on file → +10 (know exactly what to re-pitch) |
| **Size / ICP Tier** | 20 pts | Large ($5B+) = 20 · Mid ($500M–5B) = 13 · Small (<$500M) = 7 · unknown = 3 |
| **Industry / Vertical Fit** | 15 pts | Matches a named HGS vertical (BFSI/Banking/Financial Services, Healthcare/Insurance, Retail/CPG, Telecom) → 15 · other known industry → 7 · blank → 4 |

**numWonDeals > 0 is a hard eligibility gate, not just part of the History component's score** — an early version of this model scored History as just another additive component, which meant an account with *zero* proven history could still rank "Hot" purely on Size + Industry + Residue. In testing, a Telecom account with $0 historical revenue and 0 won deals came out as the single highest-scoring "Hot" account — exactly backwards. Gating eligibility on proven wins fixes this structurally rather than papering over it with a bigger History weight.

**Tiering:** calibrated against the live 305-account eligible book (scores ranged 15–82, concentrated between 20 and 50), the same discipline the Cross-Sell doc's thresholds used — not picked as round numbers in the abstract (Cross-Sell's first pass at ≥70/45 put 99% of *that* book in Hot+Warm). Re-check after every data refresh:

| Tier | Score | ~Share of book (observed) | Meaning |
|---|---|---|---|
| 🔥 **Hot** | ≥ 45 | ~20% | Strong historical relationship, real size, residual access — worth a direct outreach this quarter |
| 🌤 **Warm** | 25–44 | ~53% | Real history, but thinner access or fit — worth a lower-touch check-in (email, LinkedIn) before investing a full re-engagement push |
| ⬜ **Monitor** | < 25 | ~28% | Real history, but weak on every other dimension — not worth prioritizing without a specific trigger event |

---

## 6. Known Gaps (v1 simplifications)

1. **No lapse-reason or lapse-date signal.** The model can't currently distinguish "budget got cut, will likely return" from "fired HGS after a service failure, do not re-approach." `numLostDeals` is captured but not yet scored — a high lost-to-won ratio should probably be a *negative* modifier once there's confidence it reliably signals relationship trouble rather than just normal competitive loss. Recommend adding a lapse-reason field (even a simple picklist: budget/reorg/competitor/service issue/other), captured by the account team when an account's last open deal closes with nothing behind it — since, per §1.1, there's no reliable "became Previous" event to hang this off today.
2. **No recency signal.** A relationship that went quiet 18 months ago and one that went quiet 5 years ago score identically today if their revenue/deal history matches — recency almost certainly matters (fresher relationships, fresher contacts, fresher institutional memory of why HGS was good to work with). The closest available proxy today is last-closed-deal date, not currently rolled up to the customer object; a true "last activity date" would be better still.
3. **No trigger-event data**, same gap as Cross-Sell — a competitor's contract expiring, a reorg, a former champion resurfacing at a new lapsed-but-relevant title. Not in HubSpot today.
4. **The `status`/`is_current`/`is_previous` fields are unreliable for dormancy** (§1.1) — this doc works around it by scoring deal activity directly, but the underlying data-hygiene issue (flags set once, never revisited as a relationship goes quiet or reactivates) affects any other feature that trusts those flags, including Cross-Sell's own eligibility test. Worth a CRM data-hygiene pass independent of either page.

---

## 7. Data Requirements Summary

Everything needed for v1 is already present in `build_customers_list` (`backend/ingest/aggregate.py`): `icpTier`, `industry`, `totalRevenue`, `numWonDeals`, `numOpenDeals`, `numLostDeals`, `numContacts`, `serviceLines`, `revenueFY27`, `revenueFY28`. **No new backend fields or ingest changes required to ship the Win-Back Customers page.** Priority gaps for v2, in order: a last-closed-deal or last-activity date (recency), a lapse-reason field, and the lost-deal-ratio negative modifier once reason data exists to validate it against.
