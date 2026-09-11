import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Campaign, Client } from '../lib/database.types'
import { formatMoney, formatDate } from '../lib/format'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { CampaignStatusBadge } from '../components/CampaignStatusBadge'
import { EditClientModal } from '../components/EditClientModal'
import { IntakeForm } from '../components/IntakeForm'
import { Button, Card, EmptyState, Modal, Spinner } from '../components/ui'

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    const [c, cams] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase
        .from('campaigns')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
    ])
    if (c.error) setError(c.error.message)
    else setClient(c.data as Client)
    setCampaigns((cams.data ?? []) as Campaign[])
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign and all its metrics? This cannot be undone.'))
      return
    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) setError(error.message)
    else setCampaigns((prev) => prev.filter((c) => c.id !== id))
  }

  function copyPortalLink() {
    const url = `${location.origin}/client/${clientId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Spinner label="Loading client…" />
      </DashboardLayout>
    )
  }
  if (error || !client) {
    return (
      <DashboardLayout>
        <p className="text-sm text-red-600">{error ?? 'Client not found.'}</p>
        <Link to="/dashboard" className="text-sm text-brand-700 underline">
          Back to clients
        </Link>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Link to="/dashboard" className="text-sm text-slate-500 hover:underline">
        ← Clients
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{client.business_name || client.name}</h1>
          <p className="text-sm text-slate-500">
            {client.email}
            {client.phone ? ` · ${client.phone}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Ad account:{' '}
            <span className="font-mono">
              {client.meta_ad_account_id || 'not set'}
            </span>{' '}
            · Page: <span className="font-mono">{client.meta_page_id || 'not set'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copyPortalLink}>
            {copied ? 'Copied!' : 'Copy portal link'}
          </Button>
          <Button variant="secondary" onClick={() => setSuggestOpen(true)}>
            Client Suggestions
          </Button>
          <Link to={`/dashboard/clients/${client.id}/messages`} className="btn-secondary">
            Messages
          </Link>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit Client
          </Button>
        </div>
      </div>

      {!client.meta_page_id && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No Facebook Page ID on file — this is required before any ad creative can be
          built. Add it via <button className="underline" onClick={() => setEditing(true)}>Edit Client</button>.
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-semibold">Campaigns</h2>
        <Button
          onClick={() => setAdding(true)}
          disabled={!client.meta_ad_account_id}
          title={
            client.meta_ad_account_id
              ? undefined
              : 'Set the Meta Ad Account ID on the client first'
          }
        >
          + Add Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No campaigns"
            description="Add a campaign to queue it for AI-assisted build on Meta. It always launches paused for your review."
          />
        </div>
      ) : (
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Objective</th>
                <th className="px-4 py-3">Daily budget</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/dashboard/clients/${client.id}/campaigns/${c.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.campaign_name || 'Untitled campaign'}
                    </Link>
                    {c.status === 'error' && c.error_message && (
                      <p className="mt-0.5 max-w-sm text-xs text-red-600">
                        {c.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{c.objective}</td>
                  <td className="px-4 py-3">{formatMoney(c.daily_budget_usd)}</td>
                  <td className="px-4 py-3">
                    <CampaignStatusBadge
                      status={c.status}
                      pendingReview={c.pending_review}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteCampaign(c.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <EditClientModal
        client={client}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(u) => setClient(u)}
      />

      <Modal open={adding} onClose={() => setAdding(false)} title="Add campaign" wide>
        <IntakeForm
          existingClient={client}
          onDone={(r) => {
            if (r.ok) {
              setAdding(false)
              load()
            }
          }}
        />
      </Modal>

      <Modal
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        title="Client suggestions"
      >
        <p className="text-sm text-slate-600">
          Draft a proactive note to this client (new campaign ideas, budget changes,
          creative refresh). It lands in their message thread as an AI draft for you to
          approve before it sends.
        </p>
        <SuggestionComposer
          clientId={client.id}
          onDone={() => setSuggestOpen(false)}
        />
      </Modal>
    </DashboardLayout>
  )
}

function SuggestionComposer({
  clientId,
  onDone,
}: {
  clientId: string
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    await supabase.from('messages').insert({
      client_id: clientId,
      direction: 'outbound',
      channel: 'in_app',
      subject: 'A suggestion for your campaigns',
      ai_draft_body: text.trim(),
      status: 'drafted',
    })
    setBusy(false)
    onDone()
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        className="input"
        rows={4}
        placeholder="e.g. Your lead cost is trending down — worth adding $20/day to the top campaign?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={create} disabled={busy || !text.trim()}>
          {busy ? 'Saving…' : 'Save as draft'}
        </Button>
      </div>
    </div>
  )
}
