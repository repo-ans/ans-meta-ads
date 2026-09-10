import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PortalCampaign, PortalData, PortalMessage } from '../lib/database.types'
import { formatDate } from '../lib/format'
import { Button, Spinner } from '../components/ui'

// Magic-link portal. Access is the client's own UUID in the URL — no login.
// Deliberately plain-language: no jargon, no raw metric names.
export default function ClientPortal() {
  const { clientId } = useParams<{ clientId: string }>()
  const [data, setData] = useState<PortalData | null>(null)
  const [campaigns, setCampaigns] = useState<PortalCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedCampaign, setSelectedCampaign] = useState<string>('all')
  const [body, setBody] = useState('')
  const [scopeForNew, setScopeForNew] = useState<string>('general')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    const portal = await supabase.rpc('get_client_portal_data', { p_client_id: clientId })
    if (portal.error) {
      setError("We couldn't find your account. Please check the link your agency sent you.")
      setLoading(false)
      return
    }
    setData(portal.data as PortalData)

    const cams = await supabase.rpc('get_client_campaigns', { p_client_id: clientId })
    if (!cams.error) setCampaigns((cams.data ?? []) as PortalCampaign[])
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function send() {
    if (!clientId || !body.trim()) return
    setSending(true)
    const { error } = await supabase.rpc('insert_client_message', {
      p_client_id: clientId,
      p_body: body.trim(),
      p_campaign_id: scopeForNew === 'general' ? null : scopeForNew,
    })
    setSending(false)
    if (error) {
      setError('Sorry, your message could not be sent. Please try again.')
      return
    }
    setBody('')
    setSent(true)
    setTimeout(() => setSent(false), 4000)
    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center py-24">
        <Spinner label="Loading your updates…" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-slate-700">{error}</p>
      </div>
    )
  }

  const showPicker = campaigns.length >= 2
  const messages = (data?.messages ?? []).filter((m) =>
    selectedCampaign === 'all' ? true : m.campaign_id === selectedCampaign,
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm text-slate-500">Your advertising updates</p>
        <h1 className="text-2xl font-bold">{data?.business_name}</h1>
      </header>

      {showPicker && (
        <div className="mb-5">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Show updates about
          </label>
          <select
            className="input bg-white"
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
          >
            <option value="all">All of my ad campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_name || 'Campaign'}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No updates yet. Your agency will post here as your ads get going.
          </div>
        ) : (
          messages.map((m) => <PortalBubble key={m.id} message={m} showTag={showPicker} />)
        )}
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Send your agency a message</h2>
        {showPicker && (
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              This is about
            </label>
            <select
              className="input bg-white"
              value={scopeForNew}
              onChange={(e) => setScopeForNew(e.target.value)}
            >
              <option value="general">A general question</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.campaign_name || 'Campaign'}
                </option>
              ))}
            </select>
          </div>
        )}
        <textarea
          className="input mt-3"
          rows={4}
          placeholder="Type your message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {sent && <p className="mt-2 text-sm text-green-700">Sent — thank you!</p>}
        {error && data && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end">
          <Button onClick={send} disabled={sending || !body.trim()}>
            {sending ? 'Sending…' : 'Send message'}
          </Button>
        </div>
      </section>
    </div>
  )
}

function PortalBubble({
  message: m,
  showTag,
}: {
  message: PortalMessage
  showTag: boolean
}) {
  const fromAgency = m.direction === 'outbound'
  return (
    <div
      className={`rounded-xl border p-4 ${
        fromAgency ? 'border-slate-200 bg-white' : 'border-brand-100 bg-brand-50/50'
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
        <span className="font-medium text-slate-600">
          {fromAgency ? 'Your agency' : 'You'}
        </span>
        <span>·</span>
        <span>{formatDate(m.sent_at ?? m.created_at)}</span>
        {showTag && m.campaign_name && (
          <>
            <span>·</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
              {m.campaign_name}
            </span>
          </>
        )}
      </div>
      {m.subject && <p className="text-sm font-semibold text-slate-800">{m.subject}</p>}
      <p className="whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
    </div>
  )
}
