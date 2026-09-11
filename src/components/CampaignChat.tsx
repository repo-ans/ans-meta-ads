import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CampaignChatMessage } from '../lib/database.types'
import { formatDateTime } from '../lib/format'
import {
  applyCampaignAction,
  sendCampaignChat,
  WebhookError,
} from '../lib/webhooks'
import { Button, Spinner, TextArea } from './ui'
import { ProposedActionPreview } from './ProposedActionPreview'

/**
 * Agency-facing AI assistant for a single campaign.
 *
 * Send flow: POST { campaign_id, message } to the `campaign-chat` webhook.
 * n8n inserts BOTH the user row and the assistant reply — this component does
 * not write the user row itself (it would double up). The reply comes back
 * synchronously; a realtime subscription also keeps the thread fresh.
 *
 * Apply flow: POST { campaign_id, chat_message_id, proposed_action } to the
 * `apply-campaign-action` webhook. n8n does the Meta-side change and writes
 * `campaign_chat_messages.action_status`. The browser never mutates the
 * campaign row itself.
 */
export function CampaignChat({
  campaignId,
  currentBudgetUsd,
}: {
  campaignId: string
  currentBudgetUsd?: number | null
}) {
  const [messages, setMessages] = useState<CampaignChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaign_chat_messages')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setMessages((data ?? []) as CampaignChatMessage[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`chat:${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_chat_messages',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId, load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingUserMsg])

  async function send() {
    const content = draft.trim()
    if (!content) return
    setSending(true)
    setError(null)
    setDraft('')
    setPendingUserMsg(content)
    try {
      await sendCampaignChat(campaignId, content)
      await load()
    } catch (e) {
      setError(
        e instanceof WebhookError
          ? e.message
          : 'Could not reach the assistant. Try again.',
      )
      setDraft(content) // let them retry
    } finally {
      setSending(false)
      setPendingUserMsg(null)
    }
  }

  async function resetChat() {
    if (!confirm('Clear the entire assistant conversation for this campaign?')) return
    const { error } = await supabase
      .from('campaign_chat_messages')
      .delete()
      .eq('campaign_id', campaignId)
    if (error) setError(error.message)
    else setMessages([])
  }

  async function deleteMessage(id: string) {
    const { error } = await supabase
      .from('campaign_chat_messages')
      .delete()
      .eq('id', id)
    if (error) setError(error.message)
    else setMessages((m) => m.filter((x) => x.id !== id))
  }

  async function applyAction(msg: CampaignChatMessage) {
    if (!msg.proposed_action) return
    setApplyingId(msg.id)
    setError(null)
    try {
      await applyCampaignAction({
        campaignId,
        proposedAction: msg.proposed_action,
        chatMessageId: msg.id,
      })
      await load()
    } catch (e) {
      setError(
        e instanceof WebhookError ? e.message : 'Failed to apply the change.',
      )
    } finally {
      setApplyingId(null)
    }
  }

  async function dismissAction(msg: CampaignChatMessage) {
    const { error } = await supabase
      .from('campaign_chat_messages')
      .update({ action_status: 'dismissed' })
      .eq('id', msg.id)
    if (error) setError(error.message)
    else load()
  }

  return (
    <div className="card flex h-[32rem] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <p className="text-sm font-semibold">Campaign Assistant</p>
        <Button variant="ghost" onClick={resetChat} disabled={messages.length === 0}>
          Reset
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <Spinner label="Loading conversation…" />
        ) : messages.length === 0 && !pendingUserMsg ? (
          <p className="text-sm text-slate-500">
            Ask the assistant about this campaign — budget pacing, targeting, fatigue,
            what to change. Proposed changes are shown as a preview for you to confirm.
          </p>
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              currentBudgetUsd={currentBudgetUsd}
              applying={applyingId === m.id}
              onApply={() => applyAction(m)}
              onDismiss={() => dismissAction(m)}
              onDelete={() => deleteMessage(m.id)}
            />
          ))
        )}
        {pendingUserMsg && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl bg-brand-600/70 px-3.5 py-2 text-sm text-white">
              {pendingUserMsg}
              <span className="ml-2 opacity-70">·</span>
              <span className="ml-1 text-xs opacity-70">sending…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="border-t border-slate-200 p-3">
        <TextArea
          rows={2}
          value={draft}
          placeholder="Message the assistant…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">⌘/Ctrl + Enter to send</span>
          <Button onClick={send} disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  currentBudgetUsd,
  applying,
  onApply,
  onDismiss,
  onDelete,
}: {
  message: CampaignChatMessage
  currentBudgetUsd?: number | null
  applying: boolean
  onApply: () => void
  onDismiss: () => void
  onDelete: () => void
}) {
  const isUser = message.role === 'user'
  const action = message.proposed_action
  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            isUser
              ? 'bg-brand-600 text-white'
              : 'border border-slate-200 bg-white text-slate-800'
          }`}
        >
          {message.content}
        </div>

        {action && (
          <div className="space-y-2">
            <ProposedActionPreview action={action} currentBudgetUsd={currentBudgetUsd} />
            {message.action_status === 'applied' ? (
              <p className="text-xs font-medium text-green-700">✓ Applied</p>
            ) : message.action_status === 'dismissed' ? (
              <p className="text-xs text-slate-400">Dismissed</p>
            ) : (
              <div className="flex gap-2">
                <Button onClick={onApply} disabled={applying}>
                  {applying ? 'Applying…' : 'Confirm & apply'}
                </Button>
                <Button variant="secondary" onClick={onDismiss} disabled={applying}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>{formatDateTime(message.created_at)}</span>
          <button
            onClick={onDelete}
            className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          >
            delete
          </button>
        </div>
      </div>
    </div>
  )
}
