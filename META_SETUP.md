# Meta (Facebook/Instagram) Setup Guide

How to connect a real Meta Business to this platform — every ID/token you
need, exactly where to get it, exactly where it goes, and every real error
this project has already hit (so you don't have to re-debug them). Written
after getting a full real Meta Business ("Meta Ads Reporting") working
end-to-end on 2026-09-15.

Use this whenever: onboarding a new client's own Business Manager, rotating
an expired/revoked token, or setting up the agency's own production Business
Manager for the first time.

---

## 1. The 6 values you need, and where they go

| # | Value | Where it comes from | Where it goes |
|---|---|---|---|
| 1 | **Meta App ID** | App Dashboard → your app → App settings → Basic | Dashboard `/settings` → Meta App ID |
| 2 | **Meta App Secret** | Same page, click "Show" | Dashboard `/settings` → Meta App Secret |
| 3 | **System User Token** | Business Settings → System users → your system user → Generate token | Dashboard `/settings` → System User Token |
| 4 | **Business Manager ID** | Business Settings → Business info → "Business portfolio ID" (same thing, renamed by Meta) | Dashboard `/settings` → Business Manager ID |
| 5 | **Ad Account ID** | Business Settings → Ad accounts → click the account → ID shown at top | Client record → Meta Ad Account ID, **with `act_` prefix** (`act_1234567890`) |
| 6 | **Page ID** | Business Settings → Pages → click the Page → ID shown at top | Client record → Facebook Page ID, **no prefix** |

`/settings` in this table = the agency dashboard's own Settings page
(`meta_ads_settings` table). #1 and #2 aren't actually used by any of the 6
n8n workflows today (they only use #3 and #4) — fill them anyway for
completeness/future use, or leave blank.

---

## 2. Business Manager setup (one-time per Business)

### 2.1 Create a dedicated System User

Business Settings → Users → System users → **+ Add**.

- Name it something recognizable to this project (e.g. `Meta Ads Agency
  Platform`), not a generic/shared one — reusing a system user created for
  something else (e.g. a Conversions API integration) mixes permission
  scopes and makes it hard to revoke one without breaking the other.
- Access level: **Admin access** (not Employee access) — Admin access
  automatically covers every asset owned by the Business, so you don't have
  to individually assign every ad account/Page it might ever need.

### 2.2 Create (or pick) a Meta App under this Business

Business Settings → Accounts → Apps → **Add → Create a new app**.

- App type: **Business**.
- It must be created *inside this Business Manager* (not a personal
  Facebook Developer account) — an app owned by a different Business can't
  be used to generate a token scoped to this one without partner-sharing
  assets across businesses (see §5 if you ever need that route).
- After creation, open it in the Developer Console → **Add Product →
  Marketing API → Set up**. Skipping this causes every Marketing API call to
  fail with a generic permissions error even when every other permission
  looks correct.

### 2.3 Give the System User a role on the App

This is a **separate step from Business Admin access** — easy to miss, and
the single most common point of confusion in this whole setup.

Business Settings → Accounts → Apps → your app → find the assignment
control (or on the app's own Developer Console page, click **"Edit roles in
Meta Business Suite"** if it redirects you back to Business Settings) → add
your system user → give it **"Manage app"** (Full access).

Symptom if this step is skipped: generating a token gets stuck on "Assign
permissions" with **"No permissions available — Assign an app role to the
system user or select another app to continue."**

### 2.4 Marketing API Access Tier

App Dashboard → your app → **Use cases → Customize → Settings** (or search
"Marketing API Access Tier"). A brand-new app starts at **Limited access**.

- For managing your **own** Business's ad accounts, Limited access +
  correct asset/token scopes is normally enough (confirmed working live for
  this project without going through the "App must be published + Marketing
  API Access Tier approved in App Review" full flow).
- If real API calls still fail with `error_subcode: 33` ("Object … does not
  exist, cannot be loaded due to missing permissions, or does not support
  this operation") even after §2.1–§2.3 and §3 are all correct, the two
  remaining levers are: **Start Business Verification** for this Business
  (Business Settings → Business info), or use a token generated from an
  **already-published, App-Review-approved app** instead (see §6).

---

## 3. Ad account + Page prerequisites (per client / per Business)

The System User needs **explicit access to each specific ad account and
Page** it will manage — Business Admin access alone is not always
sufficient in practice for Marketing API write calls.

1. Business Settings → **Ad accounts** → the account → **Assign people** →
   add the system user → role **Advertiser** or higher.
   - Error if skipped: `"No write permission on ad account"` /
     `"Ad account owner has NOT grant ads_read permission"`.
2. Business Settings → **Pages** → the Page → **Assign people** → add the
   system user → **Full control**.
3. **Instagram, if the Page has one connected**: creating any ad creative
   fails with `"Ad Account Has No Access To Instagram Account"` unless the
   ad account is explicitly authorized for that Page's Instagram account.
   Fix, either:
   - Business Settings → **Instagram accounts** → the account → **Assign ad
     accounts** → add this ad account, **or**
   - If you don't need Instagram placements yet: disconnect the Instagram
     account from the Page (Page Settings → Linked accounts → Instagram →
     Disconnect), or restrict the ad set's targeting to
     `publisher_platforms: ["facebook"]` (already the default in
     `n8n/build-campaign.json`).
4. Confirm the ad account's **currency** before testing budgets — Meta
   enforces a currency-specific minimum daily budget (e.g. a CAD account
   rejected a ~$1 USD-equivalent test budget with `"Budget Is Too Low …
   must be more than CA$1.39"`). This platform assumes the account currency
   behaves like whole small-unit-per-cent USD; a non-USD account still
   works, just pick a comfortably-above-minimum test budget (**$5+**).

---

## 4. Generating the token

Business Settings → System users → your system user → **Generate token**
(if a token already exists and something isn't working, **Revoke tokens**
first, then generate a fresh one — asset-permission changes don't always
require a new token, but when in doubt, regenerate).

- App: the one from §2.2.
- Expiration: **Never**.
- Permissions — check all of:
  - `ads_management`
  - `ads_read`
  - `business_management`
  - `pages_show_list`
  - `pages_read_engagement`
  - `instagram_basic` — **required even if you don't think you need
    Instagram**; its absence caused an Instagram-authorization error to
    persist even after §3.3 was done correctly.
  - `instagram_manage_ads` — add if offered.

Copy the token immediately (shown once) → dashboard `/settings` → **System
User Token**.

---

## 5. Cross-Business setup (only if the ad account lives in a *different*
Business than the App)

Sometimes the Business that owns the ad account/Page isn't the one that owns
an already-reviewed App (e.g. borrowing the CEO's verified app for a
client's own Business Manager). Two extra steps before §4 works:

1. In the Business that **owns the ad account/Page**: Business Settings →
   Ad accounts (and separately, Pages) → the asset → **Assign partner** →
   enter the *other* Business's ID → permission **Manage campaigns** (or
   full control).
2. In the Business that **owns the App**: complete §2.1–§2.4 there instead,
   then §3 there too (the system user now needs access to the
   partner-shared asset, same "Assign people" flow — shared assets show up
   the same way once partner-shared).

Simpler alternative when possible: just create the ad account and Page
**inside the same Business Manager as the App** in the first place (§1
table item 5/6 + §2) — this project ended up doing exactly that (moved to a
"Meta Ads Reporting" Business that owned app, ad account, and Page all
together) rather than fighting partner-sharing, and it was considerably
less error-prone.

---

## 6. Real errors this project hit, and the exact fix

Keep this table — every one of these was hit live once and is fully solved.

| Error text (or the gist of it) | Real cause | Fix |
|---|---|---|
| `error_subcode: 33` — "Object … does not exist, cannot be loaded due to missing permissions" | App's Marketing API Access Tier is Limited / app missing the Marketing API product | §2.2 (add product), §2.4 |
| "No permissions available — Assign an app role to the system user…" | System user has Business Admin access but no role *on the App itself* | §2.3 |
| `error_subcode: 2490585` — "No write permission on ad account… Advertiser role or higher" | System user not assigned to that specific ad account | §3.1 |
| `error_subcode: 1815199` — "Ad Account Has No Access To Instagram Account" | Ad account not authorized for the Page's linked Instagram account, or token missing `instagram_basic` scope | §3.3 and §4 |
| `error_subcode: 4834011` — "Must specify True or False in `is_adset_budget_sharing_enabled` field" | Meta API requires this field explicitly when the campaign isn't using Campaign Budget Optimization | Already fixed in `n8n/build-campaign.json` (`is_adset_budget_sharing_enabled: false`) |
| `error_subcode: 1885272` — "Budget Is Too Low… must be more than CA$X" | Ad account currency isn't USD, or budget too small | §3.4 |
| Supabase node: "No output data returned", `[table] not found`, etc. | The n8n Supabase node's Credential is pointed at the wrong Supabase project (e.g. the Google Ads sibling project instead of "Supabase Meta Ads") | Open the node → Credential dropdown → select "Supabase Meta Ads" |
| Gemini: `[GoogleGenerativeAI Error] … Unknown name "type"… any_of… Proto field is not repeating` | Gemini's function-calling schema doesn't support `anyOf`/nullable-nested-object JSON Schema, which LangChain's structured-output implementation generates even from a schema using `nullable: true` | Already fixed — all 3 AI workflows use a flat `action_type: "none"\|...` schema instead of a nested nullable `proposed_action` object. See `n8n/README.md` if this pattern needs reusing elsewhere. |
| OpenAI: "You have no credits remaining" | The OpenAI org's billing ran out | Add credits at platform.openai.com, **or** swap to the Gemini setup already in place (see `n8n/README.md`) |
| Ads Manager email "Your ad was approved… should begin delivering shortly" while the dashboard still shows Paused | Meta's creative/content review runs independently of the campaign's PAUSED/ACTIVE status — "approved" just means content passed review, not that it's live | Trust the dashboard/`sync-metrics`-synced status (it reads Meta's real state); only worry if the dashboard itself shows Active when it shouldn't |

---

## 7. Security notes

- **Never paste a real token into any public/online tool** (curl-testing
  websites, etc.) — treat it as compromised the moment it leaves your own
  machine or the dashboard's own password field, and revoke + regenerate.
- The System User Token and App Secret are stored in Supabase
  `meta_ads_settings`, readable only by the authenticated agency admin (RLS)
  — never put them in frontend code or anywhere `anon`-readable.
- If you ever need to test a raw Graph API call yourself, do it from your
  own terminal (`curl` / PowerShell `Invoke-RestMethod`), not a browser-based
  third-party service.
