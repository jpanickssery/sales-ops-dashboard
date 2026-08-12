# HubSpot data pulls

Raw HubSpot deal exports, pulled on demand through the Claude HubSpot connector
(no API token — rides on the logged-in user's own HubSpot access via chat).

## Layout

```
app/hubspot-data/
├── latest.json              -> {"latest_snapshot": "<timestamp>"}
└── <timestamp>/             one folder per pull, UTC "YYYYMMDDTHHMMSSZ"
    ├── open_deals.json
    ├── closed_deals.json
    ├── companies.json        "master customer" companies (current or previous)
    ├── meta.json             pull time, filters used, counts, property list
    └── _lookups.json         owner_id / pipeline_id / dealstage_id / forecast_category -> name
```

`latest.json` is only updated after a pull fully succeeds — the app should read
it to find the current snapshot rather than sorting subfolder names.

## How to refresh

Just ask Claude in this project: **"refresh the HubSpot data"**. To redo it
manually or from a fresh session, follow these exact steps:

1. **Create the timestamped folder**: `app/hubspot-data/<UTC timestamp, YYYYMMDDTHHMMSSZ>/`

2. **Pull open deals** via `mcp__claude_ai_HubSpot__search_crm_objects`:
   - `objectType`: `DEAL`
   - `filterGroups`: `[{"filters": [{"propertyName": "dealstage", "operator": "NOT_IN", "values": ["fed83841-fdba-416b-9b18-8cc639bda49a", "f014a734-8157-46b5-ac44-0555cd13e8ef"]}]}]`
     (excludes Stage 5 - Won and Closed Lost — the two closed-stage GUIDs on the HGS Global Pipeline)
   - `limit`: 200, page through with `offset` until `total` records are collected
   - Results routinely exceed the tool's inline output limit — each page gets
     auto-saved to a file under the Claude tool-results dir; copy each into
     the timestamp folder before parsing (don't rely on inline output).

3. **Pull closed FY27 deals** the same way, with:
   - `filterGroups`: `[{"filters": [{"propertyName": "dealstage", "operator": "IN", "values": ["fed83841-fdba-416b-9b18-8cc639bda49a", "f014a734-8157-46b5-ac44-0555cd13e8ef"]}, {"propertyName": "closedate", "operator": "GTE", "value": "<FY27 start ms>"}, {"propertyName": "closedate", "operator": "LT", "value": "<FY27 end ms>"}]}]`
   - FY27 = Apr 1, 2026 → Apr 1, 2027 (exclusive). The search API needs
     **epoch milliseconds** for date filters, not date strings (unlike the
     SQL query tool). Compute via `datetime(2026,4,1,tzinfo=timezone.utc).timestamp()*1000`.

4. **Properties to request** (used by both pulls, 56 total incl. resolved
   lookups — many are only meaningful on a subset of deals, e.g. win/loss
   fields on closed deals or contract fields on later-stage deals, but are
   requested uniformly for a consistent raw schema):
   ```
   # Core / financial
   dealname, company_name, hubspot_owner_id, region, obu, dealtype, dealstage,
   pipeline, hs_manual_forecast_category, hs_deal_stage_probability, closedate,
   hs_tcv, hgs_oss_amount__c, hs_acv, service_line, partner_account__c,
   accelerators, target_deal, portfolio, deal_source, closed_lost_reason,
   createdate, hs_lastmodifieddate

   # Monthly FY27 revenue (Apr'26 -> Mar'27)
   rev_apr_fy27, rev_may_fy27, rev_jun_fy27, rev_jul_fy27, rev_aug_fy27,
   rev_sep_fy27, rev_oct_fy27, rev_nov_fy27, rev_dec_fy27, rev_jan_fy27,
   rev_feb_fy27, rev_mar_fy27

   # Engagement & Activity (deal detail page group)
   hs_next_step, notes_last_contacted, notes_last_updated,
   notes_next_activity_date, num_notes, num_contacted_notes, hs_is_stalled,
   hs_deal_score

   # Win/Loss Detail
   primary_competitor__c, who_did_we_lose_to_competitor__c, win_remarks__c,
   win_probability__c

   # Contract & Approval
   approval_tier, contract_duration_months__c, start_date__c, end_date__c,
   first_invoice_date__c, go_live_date__c

   # Deal Classification
   lead_source, industry_vertical__c, solution_veritical, functional_area__c,
   technology__c
   ```

5. **Pull companies** via `mcp__claude_ai_HubSpot__search_crm_objects`:
   - `objectType`: `COMPANY`
   - `filterGroups`: `[{"filters": [{"propertyName": "lifecyclestage", "operator": "EQ", "value": "customer"}]}, {"filters": [{"propertyName": "previous_client_date_added__c", "operator": "HAS_PROPERTY"}]}]`
     (two filterGroups = OR'd together — HubSpot has no direct "current/previous
     client" flag; `lifecyclestage = customer` and a populated
     `previous_client_date_added__c` are the closest proxies, see the "Known
     gaps" note on this below)
   - `limit`: 100 (rows have more properties than deals, so pages overflow the
     inline-output limit sooner), page through with `offset` until `total`
     is collected (744 as of the 2026-08-04 pull)
   - Properties: `name, country, industry, hs_ideal_customer_profile,
     account_sales_tier__c, hubspot_owner_id, num_associated_contacts,
     hs_num_open_deals, num_associated_deals, number_of_won_deals,
     total_revenue, revenue_fy2027, revenue_fy2028, annualrevenue,
     originating_business_unit__c, lifecyclestage, previous_client_date_added__c`
     — note several of these (`total_revenue`, `revenue_fy2027`,
     `revenue_fy2028`, `hs_num_open_deals`, `number_of_won_deals`) are
     HubSpot-computed rollups already, not something this pull calculates.
   - Resolve any new `hubspot_owner_id` values not already in `_lookups.json`
     the same way as the deal owners (step 6 below).
   - **Service lines are NOT pulled fresh here** — `service_line` only exists
     on DEAL, and a full-portal `SELECT COMPANY.name, service_line, COUNT(*)
     FROM DEAL GROUP BY COMPANY.name, service_line` hits a hard 1000-row cap
     in `query_crm_data` (2446 total rows portal-wide) with no working way to
     narrow it — cross-object `WHERE COMPANY.name > 'x'` filters are silently
     ignored. Instead, derive each company's service lines by grouping the
     already-pulled `open_deals.json` + `closed_deals.json` by `company_name`
     and collecting distinct `service_line` values. This only covers deals in
     this pull's horizon (open + FY27 closed) — most companies' service-line
     history predates FY27, so expect low coverage (187/744 in the
     2026-08-04 pull) and say so in `meta.json`, don't silently under-report.

6. **Resolve lookups**:
   - Collect distinct `hubspot_owner_id` values across both deal pulls (and
     any new ones from the company pull), batch-fetch names via
     `mcp__claude_ai_HubSpot__search_owners` with `ownerIds: [...]`.
   - Pipeline/stage/forecast-category labels come from
     `mcp__claude_ai_HubSpot__get_properties` with
     `propertyNames: ["dealstage", "pipeline", "hs_manual_forecast_category"]`
     — the enum `options` list gives id -> label directly.
   - Write all maps to `_lookups.json`.

7. **Shape and write** `open_deals.json` / `closed_deals.json`: each record
   gets `owner_id`/`owner_name`, `pipeline_id`/`pipeline_name`,
   `dealstage_id`/`dealstage_name`, `forecast_category` (resolved) merged in
   alongside the raw properties. **`companies.json`**: each record gets
   `owner_id`/`owner_name` resolved plus `service_lines` (the derived list
   from step 5) merged in alongside the raw properties.

8. **Write `meta.json`**: pull timestamp, filters used, counts (open/won/
   lost/total/companies/companiesWithServiceLineData), the full list of deal
   properties present, and a `notes.companyServiceLines` explanation of the
   coverage caveat above.

9. **Update `latest.json`** at the top level to point at the new snapshot
   folder — only after the pull fully succeeds. Deals and companies live in
   the *same* snapshot folder (one atomic pull), not separate timestamps.

## Expected counts (as a sanity check when refreshing)

As of the 2026-08-04 pull: 696 open, 546 closed FY27 (202 won / 344 lost) =
1,242 total deals; 744 companies (customer or previous-client). These will
drift over time as deals/companies move — that's expected, not a sign of a
broken pull.

## Known gaps vs. a true backend-automated refresh

This pull happens through the requesting user's own interactive HubSpot login
(via the Claude connector), not a service credential — refreshing requires a
person to ask Claude to do it. A fully headless/scheduled refresh would need
a HubSpot Private App token (`crm.objects.deals.read`,
`crm.objects.owners.read`, `crm.schemas.deals.read`, `crm.objects.companies.read`),
which requires Super Admin / App Marketplace permission on the portal. As of
2026-08-03 the account used for these pulls does not have that permission,
so this manual path is the intended workflow for now.

## Known gaps in the company/customer data specifically

- **"Current vs. previous client" is a proxy, not an exact field.** HubSpot
  has no single "Status" property matching the master spreadsheet's Current
  Client / Previous Client column. `lifecyclestage = customer` and a
  populated `previous_client_date_added__c` are the closest signals, and
  they can disagree with each other (a company can be both) or with the
  spreadsheet (see the master-file-vs-HubSpot comparison this pull's
  filters were originally derived from). `account_sales_tier__c` (values
  like "Existing Client", "Previous Client", "Tier 1", "Channel Partners",
  "New Client (12 mos.)") is a richer, HubSpot-maintained classification
  worth surfacing alongside these two, but it's also not a strict boolean.
- **Service lines are FY27-scoped**, not all-time — see step 5 above.
- **Business Unit** (`originating_business_unit__c`) is the best-guess match
  for the master file's "Business Units" column but hasn't been verified
  value-by-value against it.
