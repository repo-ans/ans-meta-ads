// Thin client for the n8n webhooks. The frontend never calls Meta directly —
// every Meta-side action goes through one of these. n8n reads/writes Supabase
// with the service_role key; the browser only fires the trigger.
//
// Paths are prefixed `meta-` because the Google Ads sibling system runs its own
// same-named webhooks on the same n8n instance.
//
// Contract (base = VITE_N8N_WEBHOOK_BASE, e.g. https://n8n.../webhook):
//   POST /meta-client-message         { message_id }                              -> async
//   POST /meta-campaign-chat          { campaign_id, message }                    -> { id, content, proposed_action, action_status }
//   POST /meta-apply-campaign-action  { campaign_id, proposed_action, chat_message_id? } -> { ok: true }
//   POST /meta-send-reply             { message_id }                              -> async
//   POST /meta-build-campaign         { campaign_id }                             -> async
//   POST /meta-sync-now               {}                                          -> async

import type { ProposedAction } from './database.types'

const BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE?.replace(/\/$/, '') ?? ''

export const isWebhookConfigured = Boolean(BASE)

export class WebhookError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'WebhookError'
  }
}

async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  if (!BASE) {
    throw new WebhookError(
      'n8n webhook base URL is not set (VITE_N8N_WEBHOOK_BASE). The automation trigger was skipped.',
    )
  }
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  } catch (e) {
    throw new WebhookError(
      `Could not reach the automation service: ${e instanceof Error ? e.message : 'network error'}`,
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new WebhookError(
      `Automation webhook "${path}" failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
      res.status,
    )
  }
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return (await res.json()) as T
  return undefined as T
}

// --- typed helpers ---

export function triggerClientMessage(messageId: string) {
  return post('meta-client-message', { message_id: messageId })
}

export interface CampaignChatReply {
  id: string
  content: string
  proposed_action: ProposedAction | null
  action_status: 'proposed' | 'applied' | 'dismissed' | null
}

export function sendCampaignChat(campaignId: string, message: string) {
  return post<CampaignChatReply>('meta-campaign-chat', {
    campaign_id: campaignId,
    message,
  })
}

export function applyCampaignAction(args: {
  campaignId: string
  proposedAction: ProposedAction
  chatMessageId?: string
}) {
  return post<{ ok: true }>('meta-apply-campaign-action', {
    campaign_id: args.campaignId,
    proposed_action: args.proposedAction,
    chat_message_id: args.chatMessageId ?? null,
  })
}

export function triggerSendReply(messageId: string) {
  return post('meta-send-reply', { message_id: messageId })
}

export function triggerBuildCampaign(campaignId: string) {
  return post('meta-build-campaign', { campaign_id: campaignId })
}

export function triggerSyncNow() {
  return post('meta-sync-now', {})
}
