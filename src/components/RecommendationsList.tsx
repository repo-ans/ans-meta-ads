import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Recommendation, RecommendationStatus } from '../lib/database.types'
import { formatMoney, timeAgo } from '../lib/format'
import { Button, EmptyState, Pill, Spinner } from './ui'

// Renders Meta's own recommendations synced into `recommendations` for one
// campaign. Apply / Dismiss just move `status`; the actual apply-on-Meta is
// n8n's job (it watches for status='applied').
export function RecommendationsList({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('recommendations')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('dollars_recoverable', { ascending: false, nullsFirst: false })
    setRows((data ?? []) as Recommendation[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id: string, status: RecommendationStatus) {
    setBusy(id)
    const { error } = await supabase
      .from('recommendations')
      .update({ status })
      .eq('id', id)
    setBusy(null)
    if (!error) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    }
  }

  if (loading) return <Spinner label="Loading recommendations…" />

  const open = rows.filter((r) => r.status === 'open')
  const resolved = rows.filter((r) => r.status !== 'open')

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No recommendations yet"
        description="Meta's recommendations for this campaign appear here once the sync has run."
      />
    )
  }

  return (
    <div className="space-y-3">
      {open.length === 0 && (
        <p className="text-sm text-slate-500">No open recommendations. All caught up.</p>
      )}

      {open.map((r) => (
        <div key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-medium capitalize">
              {r.type?.replace(/_/g, ' ') ?? 'Recommendation'}
            </p>
            {r.dollars_recoverable != null && (
              <p className="text-sm text-slate-500">
                Est. {formatMoney(r.dollars_recoverable)} recoverable
              </p>
            )}
            <p className="text-xs text-slate-400">synced {timeAgo(r.synced_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setStatus(r.id, 'applied')}
              disabled={busy === r.id}
            >
              Apply
            </Button>
            <Button
              variant="secondary"
              onClick={() => setStatus(r.id, 'dismissed')}
              disabled={busy === r.id}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <div>
          <button
            className="text-sm text-slate-500 underline"
            onClick={() => setShowResolved((s) => !s)}
          >
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
          {showResolved && (
            <div className="mt-2 space-y-2">
              {resolved.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  <span className="capitalize text-slate-600">
                    {r.type?.replace(/_/g, ' ') ?? 'Recommendation'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Pill tone={r.status === 'applied' ? 'green' : 'slate'}>
                      {r.status}
                    </Pill>
                    <button
                      className="text-xs text-slate-400 underline"
                      onClick={() => setStatus(r.id, 'open')}
                    >
                      reopen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
