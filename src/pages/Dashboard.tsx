import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Campaign, Client } from '../lib/database.types'
import { formatMoney, formatRoas } from '../lib/format'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { AlertBanner } from '../components/AlertsList'
import { Button, Card, EmptyState, Modal, Pill, Spinner } from '../components/ui'
import { IntakeForm } from '../components/IntakeForm'

type MetricAgg = { spend: number; results: number; roasSum: number; roasN: number }
type CampaignLite = Pick<Campaign, 'id' | 'client_id' | 'status' | 'pending_review' | 'error_message' | 'campaign_name'>

interface ClientRow {
  client: Client
  campaigns: CampaignLite[]
  agg: MetricAgg
}

export default function Dashboard() {
  const [rows, setRows] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    const [clientsRes, campaignsRes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase
        .from('campaigns')
        .select('id, client_id, status, pending_review, error_message, campaign_name'),
    ])
    if (clientsRes.error || campaignsRes.error) {
      setError(clientsRes.error?.message ?? campaignsRes.error?.message ?? 'Load failed')
      setLoading(false)
      return
    }
    const clients = (clientsRes.data ?? []) as Client[]
    const campaigns = (campaignsRes.data ?? []) as CampaignLite[]

    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const { data: metrics } = await supabase
      .from('campaign_metrics')
      .select('campaign_id, spend, results, roas, date')
      .gte('date', since)

    const campToClient = new Map(campaigns.map((c) => [c.id, c.client_id]))
    const aggByClient = new Map<string, MetricAgg>()
    for (const m of metrics ?? []) {
      const cid = campToClient.get(m.campaign_id as string)
      if (!cid) continue
      const a = aggByClient.get(cid) ?? { spend: 0, results: 0, roasSum: 0, roasN: 0 }
      a.spend += Number(m.spend ?? 0)
      a.results += Number(m.results ?? 0)
      if (m.roas != null) {
        a.roasSum += Number(m.roas)
        a.roasN += 1
      }
      aggByClient.set(cid, a)
    }

    setRows(
      clients.map((client) => ({
        client,
        campaigns: campaigns.filter((c) => c.client_id === client.id),
        agg: aggByClient.get(client.id) ?? { spend: 0, results: 0, roasSum: 0, roasN: 0 },
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalNeedsReview = useMemo(
    () =>
      rows.reduce(
        (n, r) =>
          n + r.campaigns.filter((c) => c.status === 'paused' && c.pending_review).length,
        0,
      ),
    [rows],
  )

  return (
    <DashboardLayout>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Clients</h1>
          <p className="text-sm text-slate-500">
            {rows.length} client{rows.length === 1 ? '' : 's'}
            {totalNeedsReview > 0 && (
              <>
                {' · '}
                <span className="font-medium text-violet-700">
                  {totalNeedsReview} campaign{totalNeedsReview === 1 ? '' : 's'} awaiting
                  launch review
                </span>
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>+ New Client</Button>
      </div>

      <div className="mb-4">
        <AlertBanner />
      </div>

      {loading ? (
        <Spinner label="Loading clients…" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add your first client, or share the public intake link so they can sign themselves up."
          action={<Button onClick={() => setShowNew(true)}>+ New Client</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Campaigns</th>
                <th className="px-4 py-3">Ad Account ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Spend (7d)</th>
                <th className="px-4 py-3 text-right">Cost / Result</th>
                <th className="px-4 py-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, campaigns, agg }) => {
                const cpr = agg.results > 0 ? agg.spend / agg.results : null
                const roas = agg.roasN > 0 ? agg.roasSum / agg.roasN : null
                const errored = campaigns.find((c) => c.status === 'error')
                const needsReview = campaigns.filter(
                  (c) => c.status === 'paused' && c.pending_review,
                ).length
                const active = campaigns.filter((c) => c.status === 'active').length
                return (
                  <tr
                    key={client.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/dashboard/clients/${client.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {client.business_name || client.name}
                      </Link>
                      <div className="text-xs text-slate-400">{client.email}</div>
                    </td>
                    <td className="px-4 py-3">{campaigns.length}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {client.meta_ad_account_id || (
                        <span className="text-amber-600">not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {errored && <Pill tone="red">error</Pill>}
                        {needsReview > 0 && (
                          <Pill tone="violet">{needsReview} needs review</Pill>
                        )}
                        {active > 0 && <Pill tone="green">{active} active</Pill>}
                        {!errored && !needsReview && !active && (
                          <Pill tone="slate">—</Pill>
                        )}
                      </div>
                      {errored?.error_message && (
                        <p className="mt-1 max-w-xs truncate text-xs text-red-600">
                          {errored.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(agg.spend || null)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(cpr)}</td>
                    <td className="px-4 py-3 text-right">{formatRoas(roas)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New client" wide>
        <IntakeForm
          onDone={(r) => {
            if (r.ok) {
              setShowNew(false)
              load()
            }
          }}
        />
      </Modal>

      <p className="mt-4 text-xs text-slate-400">
        Public intake link:{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5">{location.origin}/intake</code>
      </p>
    </DashboardLayout>
  )
}
