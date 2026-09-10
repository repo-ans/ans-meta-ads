# Handover — Meta Ad Metrics & Reporting AI Agent

Context ran out on the previous AI session. This file is the full
handover — read this + `README.md` (same folder) before doing anything
else. `README.md` has the architecture diagram, Google Sheets schema, and
a running log of every bug found/fixed with reasoning — don't duplicate
that here, this file is the "what's the current live state and what's
next" summary.

## What this project is

An n8n workflow (`meta-ads-reporting-agent.json`, same folder) that pulls
daily Meta (Facebook/Instagram) ad metrics per client, logs them to Google
Sheets, computes week-over-week deltas, flags anomalies (spend spikes, CPL
doubling, ad rejections), writes an AI narrative report, and delivers
alerts + reports to Slack. Dual-use: Aniya Networks' own internal ad
accounts and paying agency clients are both just rows in the same
"Clients" config sheet — nothing in the workflow is client-specific code.

Full spec was given by the CEO (Meta app + reporting agent, dual-use,
target < 15 min time-to-first-report per new client). The user executing
this (Raiyan, `kraiyan109@gmail.com` on Meta/Facebook) is testing it
end-to-end on **his own personal Meta Developer account first**, per an
explicit instruction from him: *"na ceo na age to ami test kori tarpor na
ceo korbe"* (no, I test first, then CEO does his part) — so everything
below uses his personal sandbox setup, not Aniya's official Business
Manager. That's a deliberate, already-made decision — don't re-litigate it
unless the user brings it up.

## Live state right now (as of this handover)

**n8n workflow**: imported into the user's n8n instance
(`n8n.srv1300653.hstgr.cloud`, workflow named "Meta Ads Reporting Agent"
under "ANS SASS" folder in "Personal" workspace), credentials wired
(Google Sheets, Slack, OpenAI — all reused from an unrelated earlier blog
automation project in the same n8n instance, credential names "Manam-
Google Sheets OAuth2", "Slack account Manam 2", "Manam- OpenAi account").

**Google Sheet**: created (`documentId`
`16AqpuCHSxKR0qHwAwELv6gIeMPfhh_VhM9zbwgeKb2o`), has a "Clients" tab with
one test row (`client_name=Test`, `ad_account_id=act_1088332207052732`,
`sheet_tab=Test`, real Slack channel URL, `active=yes`) and a "Test" tab
with the correct 24-column header row (see README's "Google Sheets
structure" section for the exact list — the user got this right after an
earlier mistake where they'd copied the Clients tab's headers instead).

**Meta setup**: Meta App "Ads Reporting Agent" created under the user's
personal Facebook Developer account (already registered — has other,
unrelated apps "n8n wp chatbot"/"n8n messenger bot" for a different
business "Waivsoft", ignore those). Use case selected: "Measure ad
performance data with Marketing API" (correct choice — read-only,
`ads_read`). A **sandbox ad account** was created (`act_1088332207052732`,
currency BDT) specifically for testing without real spend/App Review.

**The working access token** (sandbox-scoped, marked never-expiring —
generated via the sandbox account row's own wrench icon in App Dashboard
→ Tools tab, AFTER clicking that row's "Accept TOS" calendar icon first —
this exact two-step sequence is the only way that's worked; the generic
"Get Access Token" panel at the top of that same Tools tab produces a
token that LOOKS fine (`/me/permissions` shows `ads_read: granted`) but
fails every real ad-account call with `"Ad account owner has NOT grant
ads_read permission"` — this has bitten the user twice already, flag it
immediately if it happens again):

```
EABBy8NrhWF8BSdc2CDf1qH6y7bvsXkZCUh68ZB5iahexxTgz4OyVXEaaQ9uZCfOw95jxKQMVZCOnpWR60Vdwpf8a1lVnNahgHh7L6Ca0waDdHCOxbcWPmvvUXqdoy96EItjisRlSFrZASdBecmAOYoxfhIt8B7CyUjc7NtZBLQbeMrj1gLsTXur32SAVGKUOUNYR51
```

This is a sandbox-only token (no real spend, no real audience) — low risk,
but still don't paste it anywhere public. A real production System User
token (separate, in Aniya's own Business Manager) is a later, still-open
step (see Blockers below).

A test **Campaign** (`120330000417816113`, "Test Campaign - Ads Reporting
Agent") and **Ad Set** (`120330000417817113`, "Test AdSet - Cold
Audience") exist in that sandbox account, both `PAUSED`, created directly
via API. Confirmed twice via `curl` that they persist. **They do not show
up in the regular Meta Ads Manager UI** — sandbox accounts aren't listed
there, that's normal, not a bug; the account switcher in Ads Manager will
only ever show the user's real ad accounts (currently just
`726007797973506` under a "Waivsoft" business portfolio, unrelated).

**Could not get a live Ad + Creative running** (needed to get non-zero
Insights numbers) — this needs a Facebook Page, and every Page tried has
failed for a different reason:
- Creating a brand-new Page via `POST /me/accounts` fails with `(#152)
  Invalid Page Category` for every category string tried (COMPANY,
  BUSINESS, LOCAL_BUSINESS, BRAND, APP_PAGE, PRODUCT_SERVICE, SOFTWARE) —
  Meta has apparently locked down simple API-based Page creation; the
  `/page_categories` lookup endpoint that used to help pick a valid value
  no longer exists either.
- Using an existing real Page the user manages ("Care X Security
  Services", Page ID `843602472163026`) fails with `"Application does not
  have permission for this action" / "No permission to access this
  profile"` — that Page isn't connected to the same Facebook account/App
  that owns the sandbox setup.
- **Decision already made and confirmed with the user**: stop chasing
  this. The two things that actually needed proving — real Meta API
  connectivity/auth/field-shape correctness, and the metric-parsing logic
  — are both already independently verified (live curl calls + a mock-data
  unit-test harness, see README). A non-zero number out of the sandbox
  wouldn't prove anything those two don't already cover. **Do not
  re-open this rabbit hole unless the user explicitly asks.**

## Three real bugs found and fixed during live n8n testing (full detail in README)

1. **"Loop Over Clients" (Split In Batches) output index swapped** — its
   two outputs are index 0 = "done", index 1 = "loop"; the workflow had
   the four Fetch nodes wired to index 0, so nothing downstream of the
   loop ever ran. Fixed.
2. **"Normalise Metrics" had 4 separate direct connections** (one from
   each Fetch node) — n8n fires a node as soon as *any* incoming
   connection delivers data, not once all have, so it ran prematurely and
   threw `Error: Node '<name>' hasn't been executed` trying to read the
   slower branches. Fixed by inserting a **Merge node** ("Wait For All
   Fetches", 4 inputs) as a synchronization barrier before Normalise
   Metrics.
3. **n8n kills a branch entirely when a node outputs zero items** — on a
   quiet/no-data day (exactly the sandbox's situation), "Normalise
   Metrics" correctly outputs zero items, which silently skipped
   everything downstream (Sheet logging, WoW compute, AI report, Slack)
   with no error. Fixed by having Normalise Metrics emit one explicit
   `level: 'none'` marker row instead of an empty array when there's
   nothing to report.

All three fixes are already applied to `meta-ads-reporting-agent.json` in
this folder AND described to the user for manually re-wiring/re-pasting
into their already-imported, already-credentialed n8n canvas (re-importing
the whole file would lose their credential mappings again, so they've been
patching live instead each time). **Last message to the user** was
instructions to paste the bug-#3 code fix into their live "Normalise
Metrics" node and re-trigger. **Unconfirmed whether they've done this yet
or what the result was** — that's the immediate next thing to check with
them.

## Immediate next step

Ask the user: did you paste the bug #3 fix into "Normalise Metrics" and
re-trigger the webhook? What happened — specifically, did every node down
to "Deliver Report to Slack" get a green checkmark this time, and did a
message actually land in the Slack channel? If yes, the full pipeline
mechanics are proven end-to-end (with sandbox/empty data) and the project
moves to the blocked items below. If a new error shows up, debug it the
same way as the three above: ask for the exact node, its error panel
screenshot, and the JSON error payload — don't guess, this user reliably
provides both when asked.

## Real blockers, unresolved, need the user/CEO to act (not code)

1. **App Review for `ads_read`** — needed before any *real client's*
   ad account can be accessed (their people have no role on this App).
   Not needed for the user's own sandbox/personal-account testing, which
   works right now without it. Blocked further behind:
2. **"Become a Tech Provider"** — Meta's App Dashboard showed a banner:
   *"Become a Tech Provider to submit to App Review and request access to
   ... data from other businesses"* — required specifically because this
   app will access client (other-business) ad accounts. **Never actually
   opened/investigated this flow yet** — this is genuinely the next
   concrete step whenever the user is ready to move past personal-account
   testing. Ask them to click it and screenshot what it asks for.
3. **Official System User + long-lived token** in Aniya's own Business
   Manager (not the personal sandbox) — quick to do (a few minutes in
   Business Settings → Users → System Users → Add), just hasn't been done
   because testing has stayed on the personal sandbox per the user's own
   direction. When they ask "how do I set up the real one", the steps
   already given earlier in this project (before this handover) were:
   create System User (Admin role) in Aniya's Business Manager → Add
   Assets → assign the Meta App with Full Control → Generate New Token
   (select `ads_read`, expiration "Never").
4. **A real client (or Aniya's own live) ad account with actual campaign
   history** — needed to see genuine non-zero numbers and fully validate
   the WoW-delta math against real week-over-week data (currently only
   unit-tested with hand-built mock deltas, never against a real 7-day
   comparison).
5. Per the original spec, only **Slack** delivery is built (v1 choice, to
   move fast) — email/PDF/GHL delivery channels from the spec are
   deliberately deferred, not forgotten.

## Communication style notes for whoever continues this

- The user writes in Banglish/Bengali mixed with English; has been
  replying in Bengali script for a while now by the user's preference —
  keep doing that unless they switch back.
- They screenshot n8n/Meta UI panels and error JSON payloads very
  reliably when asked — lean on that instead of guessing at UI behavior
  that hasn't been verified live.
- They are relaying CEO instructions in real time and sometimes need help
  interpreting CEO's own ambiguous asks (e.g. "GA4 or Google tag?" turned
  out to be the same thing under two names — that was a different,
  earlier project though, just noting the pattern: when CEO's wording is
  unclear, help the user figure out what CEO actually means before acting).
- Every credential/token shared in this chat is real and live — treat
  them as sensitive even when the user pastes them directly (they've done
  this several times without prompting); the sandbox token above is
  low-risk (test-only, no real spend/audience) but still shouldn't be
  echoed into anything public-facing.
