# Agency Platform Frontend

React + Vite + TypeScript + Tailwind + Supabase JS. The surface for both phases
of the Meta Ads agency automation platform. It talks to **Supabase** (data) and
to the **n8n webhooks** (to trigger Meta-side actions) — never to Meta's API
directly.

This system shares its conventions with the Google Ads sibling platform: same
`proposed_action` shape, same webhook contract style, `daily_budget_usd` in
plain dollars.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in the 3 VITE_ vars
npm run dev
```

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — anon/publishable key only.
  The `service_role` key must never appear client-side; RLS is the boundary.
- `VITE_N8N_WEBHOOK_BASE` — e.g. `https://n8n.srv1300653.hstgr.cloud/webhook`
  (no trailing slash). If unset, automation triggers are skipped with a visible
  notice; the app still runs read-only.

## Database

- [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — full
  schema for a fresh setup.
- [`supabase/migrations/0002_realign_to_platform_conventions.sql`](supabase/migrations/0002_realign_to_platform_conventions.sql)
  — apply **after** 0001 on a DB that was already created from the first version
  of 0001 (`daily_budget_cents→daily_budget_usd`, `meta_resource_id→resource_name`,
  drops `sync_requests`).

Tables: `clients`, `campaigns`, `campaign_metrics`, `recommendations`, `alerts`,
`messages`, `campaign_chat_messages`, `meta_ads_settings`, RLS policies, and the
three portal RPCs (`get_client_portal_data`, `get_client_campaigns`,
`insert_client_message`).

### One deliberate addition beyond the original spec

**`campaigns.pending_review boolean`** (default `true`) — the spec requires the
UI to tell "paused, awaiting the agency's launch decision" apart from "paused,
agency chose to pause it", and the given schema had no field for it. The
`meta-build-campaign` workflow sets it `true`; `meta-apply-campaign-action`
clears it on any pause/resume (i.e. once the agency has made a launch decision).

`database.types.ts` is hand-written to match; regenerate with
`supabase gen types typescript` if you prefer generated types.

### Creating the single agency admin

No sign-up UI. Create the one admin user in the Supabase dashboard
(Authentication → Users → Add user) or:

```bash
supabase auth admin create-user --email you@agency.com --password '...'
```

Any authenticated user has full read/write via RLS — keep it to one account.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Supabase Auth, single admin |
| `/intake` | public | New-client intake (client fields only) |
| `/client/:clientId` | magic link (client UUID) | Read/reply portal, plain language |
| `/dashboard` | admin | Client list w/ 7-day spend / cost-per-result / ROAS |
| `/dashboard/clients/:clientId` | admin | Campaigns table, portal link, edit client, add campaign |
| `/dashboard/clients/:clientId/campaigns/:campaignId` | admin | Stat cards, alerts, Recommendations + Assistant tabs |
| `/dashboard/clients/:clientId/messages` | admin | Agency view of the message thread |
| `/account`, `/settings` | admin | Password; `meta_ads_settings` singleton |

## n8n webhook contract (`src/lib/webhooks.ts`)

Base = `VITE_N8N_WEBHOOK_BASE`. Paths are `meta-` prefixed so they don't collide
with the Google Ads workflows on the same n8n instance. Full details +
importable workflows in [`n8n/`](n8n/README.md).

| Trigger | Webhook | Body | Response |
|---|---|---|---|
| Portal message sent | `meta-client-message` | `{ message_id }` | async |
| Campaign Assistant send | `meta-campaign-chat` | `{ campaign_id, message }` | `{ id, content, proposed_action, action_status }` |
| Confirm proposed action / launch / pause / resume | `meta-apply-campaign-action` | `{ campaign_id, proposed_action, chat_message_id? }` | `{ ok: true }` |
| Approve & send AI draft | `meta-send-reply` | `{ message_id }` | async |
| Campaign added | `meta-build-campaign` | `{ campaign_id }` | async |
| "Sync Now" | `meta-sync-now` | `{}` | async |

Important behaviours the UI relies on:

- **`meta-campaign-chat` inserts the `role='user'` row itself.** The frontend
  only POSTs; it must not also insert the user message (double up).
- **Approve & send** first PATCHes `messages.ai_draft_body` with the edited
  text, *then* fires `meta-send-reply` — the workflow reads `ai_draft_body` as
  the outbound body and inserts a fresh `outbound` row.
- **Status changes never touch `campaigns.status` from the browser.** Approve &
  launch / Pause / Resume all go through `meta-apply-campaign-action` so the
  change actually happens on Meta and `pending_review` is cleared server-side.

## proposed-action contract

`campaign_chat_messages.proposed_action` and `messages.proposed_action` share
this shape (identical to the Google Ads sibling):

```jsonc
{
  "action_type": "update_daily_budget" | "pause_campaign" | "resume_campaign",
  "daily_budget_usd": 75,      // required for update_daily_budget, else null
  "reason": "Cost per lead is trending down; more budget should scale results."
}
```

`ProposedActionPreview` renders it as a before→after preview. Nothing is auto-
applied — the agency clicks **Confirm & apply**, which fires the webhook.

## Scripts

- `npm run dev` — dev server on :5173
- `npm run build` — typecheck + production build
- `npm run typecheck` / `npm run lint`

## Deploy (Netlify)

`netlify.toml` + `public/_redirects` handle SPA routing (every path →
`index.html`). Set the 3 `VITE_` env vars in Netlify (build-time), and add the
site URL to Supabase → Authentication → URL Configuration.
