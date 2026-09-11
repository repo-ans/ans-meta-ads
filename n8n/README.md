# Meta n8n workflows

Six importable workflows — the Meta-platform counterparts of the Google Ads
sibling system's workflows, same contracts, same `proposed_action` shape. The
frontend only POSTs to these webhooks; **all Meta Marketing API calls live
here.**

| File | Webhook (path) | Trigger | Body | Response |
|---|---|---|---|---|
| `client-message.json` | `POST /webhook/meta-client-message` | ClientPortal, after `insert_client_message` | `{ message_id }` | — (async) |
| `campaign-chat.json` | `POST /webhook/meta-campaign-chat` | CampaignChat send | `{ campaign_id, message }` | `{ id, content, proposed_action, action_status }` |
| `apply-campaign-action.json` | `POST /webhook/meta-apply-campaign-action` | CampaignChat "Confirm & apply" + CampaignDetail launch/pause/resume | `{ campaign_id, proposed_action, chat_message_id? }` | `{ ok: true }` |
| `send-reply.json` | `POST /webhook/meta-send-reply` | MessageThread "Approve & send" (after PATCHing `ai_draft_body`) | `{ message_id }` | — (async) |
| `build-campaign.json` | `POST /webhook/meta-build-campaign` | IntakeForm, after inserting a campaign | `{ campaign_id }` | — (async) |
| `sync-metrics.json` | schedule (06:00) + `POST /webhook/meta-sync-now` | daily + dashboard "Sync Now" | `{}` | — (async) |

The `meta-` prefix keeps these from colliding with the Google Ads workflows'
same-named webhooks on the same n8n instance. It matches the paths in
`src/lib/webhooks.ts`.

## Setup after importing each workflow

1. **Supabase credential.** Every Supabase node references a placeholder
   credential `Supabase Meta Ads` (id `REPLACE_WITH_META_SUPABASE_CRED`). Create
   one n8n Supabase credential pointing at the **Meta** project
   (`https://uyrjagrqxydjeafvrgyx.supabase.co`) with its **service_role** key,
   then select it on every Supabase node. (Service role is fine here — this is
   server-side; it is never exposed to the browser.)
2. **OpenAI credential.** The AI nodes reference `Manam- OpenAi account`
   (id `fj3WhBV98VkK9qr3`) + model `gpt-5-mini` — the same credential the Google
   Ads workflows use on this instance. Re-select if the id differs.
3. **`meta_ads_settings` row.** Fill it from the dashboard `/settings` page:
   `system_user_token` (long-lived Business Manager system-user token with
   `ads_management`), `business_manager_id` (for `sync-metrics` discovery).
   `app_id` / `app_secret` are not used by these workflows yet.
4. **Activate** each workflow and copy its Production webhook URL. They should
   all be `https://<your-n8n>/webhook/meta-<name>`. Set
   `VITE_N8N_WEBHOOK_BASE=https://<your-n8n>/webhook` in the frontend env.
5. Replace each `Notify: …` No-Op with a real Slack/Email node if you want
   out-of-app notifications (the dashboard surfaces everything already).

## Meta API notes / deliberate simplifications

These mirror the "unverified, iterate live" style of the Google Ads workflows —
expect to tune against real API responses.

- **Graph API v21.0**, no OAuth refresh step — the system-user token is
  long-lived. (Simpler than the Google workflows' per-run token refresh.)
- **Budgets:** stored as `daily_budget_usd` (dollars) in Supabase; Meta wants
  the account-currency **minor unit** (cents), so every Meta call does
  `Math.round(usd * 100)` and every read does `minor / 100`. Assumes a
  USD ad account.
- **Budget lives on the ad set.** `apply-campaign-action` / `send-reply` push
  `update_daily_budget` to `meta_adset_id`. `sync-metrics` reads the ad-set
  budget, falling back to the campaign (CBO campaigns).
- **`resume_campaign` sets ACTIVE on campaign + ad set + ad** — Meta does not
  cascade an ACTIVE status downward. `pause_campaign` only pauses the campaign
  (that alone stops delivery).
- **`build-campaign`** creates campaign → ad set → creative → ad, **all
  PAUSED**, then `status='paused'` + `pending_review=true`. `optimization_goal`
  is a conservative default per objective (`LINK_CLICKS` etc.) — the agency
  tunes it in Ads Manager before launching, which is the whole point of the
  paused-for-review model. No Facebook Page on the client → campaign + ad set
  only, with an `error_message` explaining what's left to do.
- **`results`** in `campaign_metrics` is parsed from the Insights `actions`
  array using a priority list of lead/purchase/link-click `action_type` values
  (`Build metrics row` node) — adjust the list per account, same as the Phase-1
  reporting agent.
- **Recommendations** are thin on Meta: the `recommendations` edge returns
  `{ code, title, message, ... }` with **no dollar impact**, so
  `dollars_recoverable` is always null and `RecommendationsList` just shows the
  type. If your token/app can't read the field it comes back empty — harmless.
- **Discovery** (`sync-metrics`) lists `GET /{business_manager_id}/owned_ad_accounts`
  then `GET /act_.../campaigns`, and inserts campaigns whose `meta_campaign_id`
  isn't already tracked, attributed to the client whose
  `clients.meta_ad_account_id` matches. Accounts claimed by 0 or 2+ clients are
  skipped, not guessed.
- Several nodes carry `alwaysOutputData` / `continueOnFail` for the same
  zero-rows-halts-the-branch and unique-conflict reasons documented in the
  Google Ads workflows.
