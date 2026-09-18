import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CampaignChatMessage } from '../lib/database.types'
import { timeAgo } from '../lib/format'
import { applyCampaignAction, WebhookError } from '../lib/webhooks'
import { Button, Card, Pill, Spinner } from './ui'
import { ProposedActionPreview } from './ProposedActionPreview'

// Unprompted AI observations the daily sync posts (origin='proactive' in
// campaign_chat_messages — same table Campaign Assistant reads, just filtered
// to the ones nobody asked for). Shown at the top of the Recommendations tab,
// since that's where the agency actually looks for "what should I do about
// this campaign" — full back-and-forth conversation still lives in Campaign
// Assistant.
export function ProactiveSuggestions({
  campaignId,
  currentBudgetUsd,
}: {
  campaignId: string
  currentBudgetUsd?: number | null
}) {
  const [rows, setRows] = useState<CampaignChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('campaign_chat_messages')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('origin', 'proactive')
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) setError(error.message)
    else setRows((data ?? []) as CampaignChatMessage[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`proactive:${campaignId}`)
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

  async function apply(msg: CampaignChatMessage) {
    if (!msg.proposed_action) return
    setBusyId(msg.id)
    setError(null)
    try {
      await applyCampaignAction({
        campaignId,
        proposedAction: msg.proposed_action,
        chatMessageId: msg.id,
      })
      await load()
    } catch (e) {
      setError(e instanceof WebhookError ? e.message : 'Failed to apply the change.')
    } finally {
      setBusyId(null)
    }
  }

  async function dismiss(msg: CampaignChatMessage) {
    setBusyId(msg.id)
    const { error } = await supabase
      .from('campaign_chat_messages')
      .update({ action_status: 'dismissed' })
      .eq('id', msg.id)
    setBusyId(null)
    if (error) setError(error.message)
    else load()
  }

  if (loading) return <Spinner label="Loading AI suggestions…" />
  if (rows.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        AI suggestions
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <Pill tone="blue">AI</Pill>
            <span className="text-xs text-slate-400">{timeAgo(r.created_at)}</span>
          </div>
          <p className="text-sm text-slate-800">{r.content}</p>
          {r.proposed_action && (
            <div className="mt-2 space-y-2">
              <ProposedActionPreview action={r.proposed_action} currentBudgetUsd={currentBudgetUsd} />
              {r.action_status === 'applied' ? (
                <p className="text-xs font-medium text-green-700">✓ Applied</p>
              ) : r.action_status === 'dismissed' ? (
                <p className="text-xs text-slate-400">Dismissed</p>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => apply(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? 'Applying…' : 'Confirm & apply'}
                  </Button>
                  <Button variant="secondary" onClick={() => dismiss(r)} disabled={busyId === r.id}>
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
