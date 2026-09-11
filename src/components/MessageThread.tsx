import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/database.types'
import { formatDateTime } from '../lib/format'
import { triggerSendReply, WebhookError } from '../lib/webhooks'
import { Button, EmptyState, Pill, Spinner, TextArea, TextInput } from './ui'
import { ProposedActionPreview } from './ProposedActionPreview'

type Row = Message & { campaigns?: { campaign_name: string | null } | null }

export function MessageThread({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, campaigns(campaign_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setRows((data ?? []) as Row[])
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
    const ch = supabase
      .channel(`messages:${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [clientId, load])

  if (loading) return <Spinner label="Loading messages…" />

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Client replies from the portal and AI-drafted outbound messages will show up here."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <MessageCard key={m.id} message={m} onChanged={load} onError={setError} />
          ))}
        </div>
      )}

      <Composer clientId={clientId} onSent={load} />
    </div>
  )
}

function MessageCard({
  message: m,
  onChanged,
  onError,
}: {
  message: Row
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const inbound = m.direction === 'inbound'
  const isDraft = m.status === 'drafted' || (m.status === 'new' && !!m.ai_draft_body)
  const [draft, setDraft] = useState(m.ai_draft_body ?? m.body ?? '')
  const [busy, setBusy] = useState(false)
  const action = m.proposed_action

  // Approve & send: persist the (possibly edited) draft, then let n8n's
  // send-reply workflow apply any proposed_action on Meta, insert the outbound
  // row, and mark this one sent.
  async function send() {
    setBusy(true)
    onError('')
    const { error } = await supabase
      .from('messages')
      .update({ ai_draft_body: draft })
      .eq('id', m.id)
    if (error) {
      setBusy(false)
      onError(error.message)
      return
    }
    try {
      await triggerSendReply(m.id)
    } catch (e) {
      setBusy(false)
      onError(
        e instanceof WebhookError
          ? `Draft saved, but the send workflow could not be reached: ${e.message}`
          : 'Draft saved, but sending failed.',
      )
      return
    }
    setBusy(false)
    onChanged()
  }

  async function dismiss() {
    setBusy(true)
    await supabase.from('messages').update({ status: 'dismissed' }).eq('id', m.id)
    setBusy(false)
    onChanged()
  }

  return (
    <div
      className={`rounded-xl border p-4 ${
        inbound ? 'border-slate-200 bg-white' : 'border-brand-100 bg-brand-50/40'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Pill tone={inbound ? 'slate' : 'blue'}>{inbound ? 'From client' : 'From agency'}</Pill>
        <Pill tone={m.campaign_id ? 'violet' : 'slate'}>
          {m.campaign_id ? (m.campaigns?.campaign_name ?? 'campaign') : 'general'}
        </Pill>
        {m.status === 'sent' && <Pill tone="green">sent</Pill>}
        {m.status === 'dismissed' && <Pill tone="slate">dismissed</Pill>}
        <span>{formatDateTime(m.sent_at ?? m.created_at)}</span>
      </div>

      {m.subject && <p className="text-sm font-semibold text-slate-800">{m.subject}</p>}

      {inbound && m.body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
      )}

      {isDraft ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
            AI draft — review, edit, then send
          </p>
          <TextArea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
          {action && <ProposedActionPreview action={action} />}
          {action && (
            <p className="text-xs text-slate-500">
              Sending will also apply this change on Meta.
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={send} disabled={busy || !draft.trim()}>
              {busy ? 'Sending…' : 'Approve & send'}
            </Button>
            <Button variant="secondary" onClick={dismiss} disabled={busy}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : (
        !inbound && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
        )
      )}
    </div>
  )
}

function Composer({ clientId, onSent }: { clientId: string; onSent: () => void }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!body.trim()) return
    setBusy(true)
    await supabase.from('messages').insert({
      client_id: clientId,
      direction: 'outbound',
      channel: 'in_app',
      subject: subject.trim() || null,
      body: body.trim(),
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    setBusy(false)
    setSubject('')
    setBody('')
    onSent()
  }

  return (
    <div className="card space-y-2 p-4">
      <p className="text-sm font-semibold">New message to client</p>
      <TextInput
        placeholder="Subject (optional)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <TextArea
        rows={3}
        placeholder="Write a message…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={send} disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
