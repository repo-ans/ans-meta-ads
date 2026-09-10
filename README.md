# Meta Ad Metrics & Reporting Agent

Automated daily Meta (Facebook/Instagram) ad reporting — pulls metrics,
logs them to Google Sheets, generates a plain-English report with AI, and
alerts on anomalies. Dual-use: Aniya Networks' own ad accounts and paying
clients are both just rows in the same "Clients" config sheet.

```
Clients config sheet (Google Sheets)
        │  Read Client List → Filter Active Clients → Loop Over Clients
        ▼
For each client, in parallel:
  Fetch Campaign Insights  ─┐
  Fetch AdSet Insights     ─┼─→ Normalise Metrics → Log to Client Sheet
  Fetch Ad Insights        ─┤         (their own tab)
  Fetch Ad Statuses        ─┘
        │
        ▼
Read Sheet History → Compute WoW Deltas & Alerts
        │
        ├─ any_alert? → Send Alert to Slack (spend spike / CPL doubled / ad rejected)
        └─ always     → Generate Narrative Report (AI) → Deliver Report to Slack
```

Current status: workflow built, and the two trickiest pieces of logic
(parsing Meta's nested `actions`/`purchase_roas` response shape, and the
week-over-week delta/alert matching) are unit-tested against mock data —
see "What's been tested" below. **Real Meta API connectivity is now
confirmed working** against a sandbox ad account (`act_1088332207052732`,
created under a personal Facebook Developer account's "Ads Reporting
Agent" app) — the campaign Insights, ad-statuses, and account-info
endpoints all return successfully (empty `data: []` on Insights/ads, since
the sandbox account has no campaigns yet — that's expected, not an error).

Getting a working token took two tries: the generic "Get Access Token"
panel (top of the Tools tab) produced a token that had `ads_read` granted
at the OAuth-scope level (confirmed via `/me/permissions`) but still failed
every ad-account call with `"Ad account owner has NOT grant ads_read
permission"` — an account-level grant issue, not a token-scope issue. The
fix was: **Accept TOS** (calendar icon next to the sandbox account row),
then generate the token via that row's own **wrench icon** ("Get access
token" scoped to that specific sandbox account) instead of the generic
panel. That token works and is marked never-expiring.

A test campaign and ad set were created in the sandbox account directly
via the API (`POST /act_.../campaigns`, `/adsets` — both succeeded, ids
`120330000417816113` / `120330000417817113`, left in place, `PAUSED`,
harmless) to try getting non-empty Insights data. That hit a real wall:
Insights stayed empty even with a real campaign+adset existing, because
non-zero data needs a fully live Ad + Creative, which needs a Facebook
Page — and this developer account has none (`/me/accounts` returns
empty). Chasing that further (create a Page via API, then a Creative
referencing it, then an Ad, with no guarantee sandbox even simulates
delivery stats without genuine ad review) wasn't worth it: the two things
that actually needed de-risking — real API connectivity/auth/field names,
and the `actions`/`purchase_roas` parsing logic — are both already
confirmed (the former against the live API just now, the latter via the
unit tests against Meta's documented response shape). Getting a non-empty
number out of the sandbox wouldn't validate anything those two don't
already cover.

**A third real bug found during the first live n8n run**: n8n stops
executing a branch entirely when a node outputs zero items — it's not an
error, but nothing downstream runs either. "Normalise Metrics" correctly
outputs zero items on a day with no campaign/adset/ad data (exactly the
sandbox account's situation), which meant Log to Client Sheet, the WoW
compute, the AI report, and Slack delivery all silently never ran, with
no error to indicate why. Fixed by having "Normalise Metrics" emit one
explicit `level: 'none'` marker row (all metrics zeroed, `entity_name:
"No data returned from Meta for this period"`) instead of an empty array
when there's nothing to report — verified via the same mock-data test
harness that this flows cleanly through Compute WoW Deltas & Alerts
(`any_alert: false`, no crash) so the rest of the chain runs even on a
quiet day, and the sheet gets an honest "nothing happened" record instead
of a silent gap.

**Still blocked / not tested**: everything involving a real client's ad
account with actual campaign history, the official System User/long-lived
production token (vs. the personal-account sandbox token used above), and
App Review approval.

**A second real bug found during the first live n8n run**: "Normalise
Metrics" originally had 4 separate direct connections into it (one from
each of the Fetch Campaign/AdSet/Ad Insights + Ad Statuses nodes), since
its code reads all 4 by name via `$('NodeName')`. But n8n runs a node as
soon as *any one* of several incoming connections delivers data — not
once all of them have — so it fired the moment the fastest fetch (usually
Campaign Insights) finished, before the other three had run, and threw
`Error: Node '<name>' hasn't been executed` trying to read their data.
Fixed by inserting a **Merge** node ("Wait For All Fetches", 4 inputs)
between the four Fetch nodes and Normalise Metrics — it exists purely as
a synchronization barrier (its own merged output isn't used; Normalise
Metrics still reads each source node by name), forcing all 4 API calls to
complete before Normalise Metrics runs. Anyone who already imported the earlier version needs to add this node
and rewire those 5 connections by hand: delete the 4 direct connections
from the Fetch nodes into Normalise Metrics, add a Merge node set to 4
inputs, connect each Fetch node into one of its inputs, then connect the
Merge node's single output into Normalise Metrics.

**A real bug found during the first live n8n run**: "Loop Over Clients"
(a Split In Batches node) has two outputs — index 0 is "done" (fires only
after every batch has been processed), index 1 is "loop" (fires per
batch, with that batch's item). The workflow file originally connected
all four Fetch nodes to index 0 ("done") instead of index 1 ("loop"),
so nothing downstream of the loop ever ran — "done" is empty until the
very last iteration. Fixed in the JSON; anyone who already imported the
earlier version needs to fix this connection by hand in the n8n canvas
(delete the four connection lines from "Loop Over Clients" and redraw
them from its second/lower output socket instead of the first).

## Blocking prerequisites (external account setup, not code)

1. **Meta App + `ads_read` App Review** — being built under a personal
   Facebook Developer account for now (per the "test now, agency swaps in
   their own later" plan), not Aniya's official Business Manager yet.
   Whether the *same* app later gets transferred to Aniya's Business
   Manager (App Review stays valid) or a brand-new app gets created there
   instead (App Review has to be redone from scratch) is still an open
   question worth confirming before relying on this app long-term.
2. **System User + long-lived token**, created in whichever Business
   Manager ends up owning the app above.
3. **At least one ad account with real, running campaigns** shared to that
   Business Manager (Partner sharing → "Analyze performance") — needed to
   test against real data at all.
4. **Google Sheets** — a spreadsheet + OAuth2 credential (same pattern as
   the blog pipeline's "Google Sheets OAuth2" credential).
5. **OpenAI (or Claude) API key** for the narrative report.
6. **Slack credential + channel(s)** for alerts/report delivery.

## Google Sheets structure

### "Clients" tab (one shared tab — the config table)

| Column | Meaning |
|---|---|
| `client_name` | Display name, used in reports/alerts |
| `ad_account_id` | Meta ad account id, **including** the `act_` prefix |
| `sheet_tab` | Name of that client's own data tab (below). Defaults to `client_name` if left blank |
| `slack_channel_url` | Where their alerts + reports get posted |
| `spend_spike_pct` | Alert threshold: % spend increase vs. 7 days ago that counts as a spike. Blank defaults to **50** |
| `cpl_double_threshold` | Alert threshold: CPL ratio vs. 7 days ago that counts as "doubled". Blank defaults to **2.0** (literal doubling) |
| `active` | Set to `no`/`false` to pause a client without deleting their row/history |

### One tab per client (data log)

Same columns the `Normalise Metrics` node outputs: `date, client_name,
level, entity_id, entity_name, campaign_id, adset_id, ad_id, spend,
impressions, clicks, cpm, cpc, ctr, frequency, results, cost_per_result,
roas, effective_status`. Create each client's tab with this header row
before their first run — the append step doesn't create tabs on its own.

**Scale note**: this grows one row per campaign/ad set/ad per day. Fine
for a handful of clients with normal account sizes; if a client runs
hundreds of ads or this grows to many clients over many months, Google
Sheets will get slow and a real database (this project already uses
Supabase elsewhere, for the blog) would be a better fit than a full-tab
read for the WoW comparison step.

## What's been tested (without a live n8n instance)

The two Code nodes with the most actual logic — `Normalise Metrics` and
`Compute WoW Deltas & Alerts` — were extracted and run against hand-built
mock Meta API responses in plain Node, asserting on:

- Correct CPL computation from Meta's nested `actions` array (checking
  several possible "lead" `action_type` values, since accounts vary)
- ROAS pulled correctly from `purchase_roas`
- Zero-results case produces `cost_per_result: null`, not `NaN`/`Infinity`
- **A real bug this caught**: `entity_id` originally fell back through
  `campaign_id || adset_id || ad_id`, but Meta's adset/ad-level responses
  *also* include `campaign_id` as parent context — so every adset/ad row
  was silently getting the campaign's ID instead of its own, which would
  have made different ad sets/ads under the same campaign collide in the
  WoW-comparison matching. Fixed to key off `level` explicitly.
- Each of the three alert flags (spend spike, CPL doubled, ad rejected)
  and the fatigue heuristic trigger correctly on engineered mock data

None of this is a substitute for testing against real Meta API responses
once access is live — Meta's actual response shapes, missing-field edge
cases, and pagination (`Fetch Campaign/AdSet/Ad Insights` all currently
assume the response fits on one page — an account with very large ad
counts may need `after` cursor pagination added) haven't been exercised.

## Known open items / not yet built

- **Pagination** on the three Insights fetches and the ad-statuses fetch —
  fine for accounts with a modest number of campaigns/ads, will silently
  miss data past the first page for large accounts.
- **Email / PDF / GHL delivery** — spec asks for all four channels
  (email/PDF/Slack/GHL); only Slack is built for v1, matching the fastest
  path to a working pilot. Adding the others is templating/delivery work
  on top of the same `Generate Narrative Report` output, not a redesign.
- **Alert thresholds and the fatigue heuristic** (`frequency > 3 && ctr <
  1`) are reasonable starting points, not tuned against real account data
  — expect to adjust once real clients' numbers come in.
- **Meta API version** is pinned to `v21.0` as a placeholder — check
  developers.facebook.com's changelog for the current version before
  going live; Meta deprecates old versions on a schedule.
- **`access_token` is inline** in each HTTP Request node's query
  parameters as a placeholder — move it into an n8n credential (Query
  Auth or Header Auth) before this ever holds a real token, same
  discipline as the Pexels key in the blog workflow.
