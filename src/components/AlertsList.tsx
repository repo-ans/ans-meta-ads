import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Alert, AlertType } from '../lib/database.types'
import { formatDateTime } from '../lib/format'
import { Button, Spinner } from './ui'

const LABELS: Record<AlertType, string> = {
  spend_spike: 'Spend spike',
  cpl_doubled: 'Cost per lead doubled',
  rejected: 'Ad rejected by Meta',
  fatigue: 'Creative fatigue',
}

const TONE: Record<AlertType, string> = {
  spend_spike: 'border-red-300 bg-red-50 text-red-800',
  cpl_doubled: 'border-red-300 bg-red-50 text-red-800',
  rejected: 'border-amber-300 bg-amber-50 text-amber-900',
  fatigue: 'border-amber-300 bg-amber-50 text-amber-900',
}

type AlertRow = Alert & { campaigns?: { campaign_name: string | null; client_id: string } | null }

function detailLine(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null
  // n8n writes free-form detail; surface the most useful bits generically.
  const parts: string[] = []
  for (const [k, v] of Object.entries(detail)) {
    if (v == null || typeof v === 'object') continue
    parts.push(`${k.replace(/_/g, ' ')}: ${String(v)}`)
  }
  return parts.length ? parts.join(' · ') : null
}

export function AlertsList({
  campaignId,
  scope = 'campaign',
  limit,
}: {
  campaignId?: string
  scope?: 'campaign' | 'all'
  limit?: number
}) {
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('alerts')
      .select('*, campaigns(campaign_name, client_id)')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
    if (scope === 'campaign' && campaignId) q = q.eq('campaign_id', campaignId)
    if (limit) q = q.limit(limit)
    const { data, error } = await q
    if (!error && data) setAlerts(data as AlertRow[])
    setLoading(false)
  }, [campaignId, scope, limit])

  useEffect(() => {
    load()
  }, [load])

  async function acknowledge(id: string) {
    setBusy(id)
    const { error } = await supabase
      .from('alerts')
      .update({ acknowledged: true })
      .eq('id', id)
    setBusy(null)
    if (!error) setAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  if (loading) return <Spinner label="Loading alerts…" />
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${TONE[a.alert_type]}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {LABELS[a.alert_type]}
              {scope === 'all' && a.campaigns && (
                <>
                  {' — '}
                  <Link
                    className="underline"
                    to={`/dashboard/clients/${a.campaigns.client_id}/campaigns/${a.campaign_id}`}
                  >
                    {a.campaigns.campaign_name ?? 'campaign'}
                  </Link>
                </>
              )}
            </p>
            {detailLine(a.detail) && (
              <p className="text-xs opacity-80">{detailLine(a.detail)}</p>
            )}
            <p className="text-xs opacity-70">{formatDateTime(a.created_at)}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => acknowledge(a.id)}
            disabled={busy === a.id}
          >
            {busy === a.id ? 'Acknowledging…' : 'Acknowledge'}
          </Button>
        </div>
      ))}
    </div>
  )
}

// Compact banner for the dashboard header area.
export function AlertBanner() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('acknowledged', false)
      .then(({ count }) => setCount(count ?? 0))
  }, [])

  if (!count) return null
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
      {count} unacknowledged alert{count === 1 ? '' : 's'} across your campaigns — review
      them on the affected campaign pages.
    </div>
  )
}
