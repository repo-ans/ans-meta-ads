# Agency Platform Frontend

React + Vite + TypeScript + Tailwind + Supabase JS. This is the surface for
both phases of the Meta Ads agency automation platform. It talks **only** to
Supabase — never to Meta's API directly. All Meta work happens in n8n.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Anon (publishable) key only. The `service_role` key must never appear in
frontend code or `.env.local` — RLS is the security boundary.

## Database

Schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
Apply it with `supabase db push` (CLI, project linked) or by pasting it into the
Supabase SQL editor.

It creates: `clients`, `campaigns`, `campaign_metrics`, `recommendations`,
`alerts`, `messages`, `campaign_chat_messages`, `meta_ads_settings`, RLS
policies, and the three client-portal RPCs
(`get_client_portal_data`, `get_client_campaigns`, `insert_client_message`).

### Deviations from the spec — confirm these are OK

1. **`campaigns.pending_review boolean`** (default `true`) — added because the
   spec requires the UI to distinguish "paused, awaiting the agency's launch
   decision" from "paused, agency chose to pause it", and the given schema has
   no field for it. n8n should set `pending_review = true` when it creates a
   campaign (always PAUSED), and the agency clears it via **Approve & launch**.
2. **`sync_requests` table** — the dashboard "Sync Now" button inserts a row
   here for an n8n trigger to poll. If n8n prefers a webhook, drop the table;
   the button degrades to a friendly "not set up" notice on its own.

Everything else matches the spec's column list exactly. `database.types.ts` is
hand-written to match — regenerate with `supabase gen types typescript` once the
project is linked if you prefer generated types.

### Creating the single agency admin

There is no sign-up UI. Create the one admin user in the Supabase dashboard
(Authentication → Users → Add user), or:

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
| `/dashboard` | admin | Client list w/ 7-day spend / CPR / ROAS |
| `/dashboard/clients/:clientId` | admin | Campaigns table, portal link, edit client, add campaign |
| `/dashboard/clients/:clientId/campaigns/:campaignId` | admin | Stat cards, alerts, Recommendations + Assistant tabs |
| `/dashboard/clients/:clientId/messages` | admin | Agency view of the message thread |
| `/account`, `/settings` | admin | Password; Meta app credentials singleton |

## What the frontend does NOT do

- No Meta Marketing API calls. No n8n workflows. No edge functions.
- The Campaign Assistant (`campaign_chat_messages`) and AI message drafts
  (`messages.ai_draft_body`) are populated/consumed by n8n. The UI only writes
  `role='user'` rows and reads back assistant replies (realtime subscription).
- Applying a recommendation or a proposed action just flips a `status` /
  `action_status` column (and, for chat actions with a `patch`, updates the
  target row). n8n watches those columns and does the actual Meta-side work.

## Proposed-action contract

`campaign_chat_messages.proposed_action` and `messages.proposed_action` are
rendered as a before/after diff (see `ProposedActionPreview`). Expected shape:

```jsonc
{
  "kind": "increase_budget",
  "summary": "Increase daily budget from $50 to $75",
  "table": "campaigns",
  "row_id": "<campaign uuid>",
  "before": { "daily_budget_cents": 5000 },
  "patch":  { "daily_budget_cents": 7500 }
}
```

Fields named `*_cents` or matching `/budget/i` are rendered as currency.
Nothing is ever auto-applied — the agency clicks **Confirm & apply**.

## Scripts

- `npm run dev` — dev server on :5173
- `npm run build` — typecheck + production build
- `npm run typecheck` / `npm run lint`
