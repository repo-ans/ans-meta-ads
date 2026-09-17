import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type {
  Campaign,
  CampaignMetric,
  Client,
  ProposedActionType,
} from '../lib/database.types'
import { formatMoney, formatNumber, formatRoas, pctChange } from '../lib/format'
import { applyCampaignAction, WebhookError } from '../lib/webhooks'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { CampaignStatusBadge } from '../components/CampaignStatusBadge'
import { AlertsList } from '../components/AlertsList'
import { RecommendationsList } from '../components/RecommendationsList'
import { CampaignChat } from '../components/CampaignChat'
import { Button, Card, Field, Modal, Spinner, TextArea, cn } from '../components/ui'

type Tab = 'recommendations' | 'assistant'

interface Window7d {
  spend: number
  results: number
  roasSum: number
  roasN: number
}

function sumWindow(rows: CampaignMetric[], startDaysAgo: number, endDaysAgo: number): Window7d {
  const now = Date.now()
  const start = now - startDaysAgo * 864e5
  const end = now - endDaysAgo * 864e5
  const w: Window7d = { spend: 0, results: 0, roasSum: 0, roasN: 0 }
  for (const r of rows) {
    const t = new Date(r.date).getTime()
    if (t < start || t >= end) continue
    w.spend += Number(r.spend ?? 0)
    w.results += Number(r.results ?? 0)
    if (r.roas != null) {
      w.roasSum += Number(r.roas)
      w.roasN += 1
    }
  }
  return w
}

export default function CampaignDetail() {
  const { clientId, campaignId } = useParams<{ clientId: string; campaignId: string }>()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [metrics, setMetrics] = useState<CampaignMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('recommendations')
  const [statusBusy, setStatusBusy] = useState(false)
  const [editingGoals, setEditingGoals] = useState(false)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    const [cam, met] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', campaignId).single(),
      supabase
        .from('campaign_metrics')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('date', { ascending: false })
        .limit(60),
    ])
    if (cam.error) {
      setError(cam.error.message)
      setLoading(false)
      return
    }
    const c = cam.data as Campaign
    setCampaign(c)
    setMetrics((met.data ?? []) as CampaignMetric[])
    const cl = await supabase.from('clients').select('*').eq('id', c.client_id).single()
    if (!cl.error) setClient(cl.data as Client)
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  // Status changes go through the apply-campaign-action webhook so the change
  // actually happens on Meta (and pending_review is cleared server-side). The
  // browser never flips campaigns.status directly.
  async function runCampaignAction(actionType: ProposedActionType, reason: string) {
    if (!campaign) return
    setStatusBusy(true)
    setError(null)
    try {
      await applyCampaignAction({
        campaignId: campaign.id,
        proposedAction: {
          action_type: actionType,
          daily_budget_usd: null,
          reason,
        },
      })
      await load()
    } catch (e) {
      setError(
        e instanceof WebhookError
          ? e.message
          : 'Could not apply the change on Meta.',
      )
    } finally {
      setStatusBusy(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Spinner label="Loading campaign…" />
      </DashboardLayout>
    )
  }
  if (error || !campaign) {
    return (
      <DashboardLayout>
        <p className="text-sm text-red-600">{error ?? 'Campaign not found.'}</p>
      </DashboardLayout>
    )
  }

  const cur = sumWindow(metrics, 7, 0)
  const prev = sumWindow(metrics, 14, 7)
  const curCpr = cur.results > 0 ? cur.spend / cur.results : null
  const prevCpr = prev.results > 0 ? prev.spend / prev.results : null
  const curRoas = cur.roasN > 0 ? cur.roasSum / cur.roasN : null
  const prevRoas = prev.roasN > 0 ? prev.roasSum / prev.roasN : null

  const isPendingReview = campaign.status === 'paused' && campaign.pending_review

  return (
    <DashboardLayout>
      <Link
        to={`/dashboard/clients/${clientId}`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← {client?.business_name || client?.name || 'Client'}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {campaign.campaign_name || 'Untitled campaign'}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <CampaignStatusBadge
              status={campaign.status}
              pendingReview={campaign.pending_review}
            />
            <span className="text-xs text-slate-400">{campaign.objective}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isPendingReview && (
            <Button
              onClick={() =>
                runCampaignAction('resume_campaign', 'Agency approved launch from dashboard')
              }
              disabled={statusBusy}
            >
              {statusBusy ? 'Working…' : 'Approve & launch'}
            </Button>
          )}
          {campaign.status === 'active' && (
            <Button
              variant="secondary"
              onClick={() =>
                runCampaignAction('pause_campaign', 'Agency paused from dashboard')
              }
              disabled={statusBusy}
            >
              {statusBusy ? 'Working…' : 'Pause campaign'}
            </Button>
          )}
          {campaign.status === 'paused' && !campaign.pending_review && (
            <Button
              variant="secondary"
              onClick={() =>
                runCampaignAction('resume_campaign', 'Agency resumed from dashboard')
              }
              disabled={statusBusy}
            >
              {statusBusy ? 'Working…' : 'Resume campaign'}
            </Button>
          )}
        </div>
      </div>

      {isPendingReview && (
        <div className="mt-4 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          This campaign was built on Meta and is <strong>paused, awaiting your launch
          decision</strong>. Nothing is spending. Review the settings below, then Approve
          &amp; launch when ready.
        </div>
      )}

      {campaign.status === 'error' && campaign.error_message && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Build error:</strong> {campaign.error_message}
        </div>
      )}

      <div className="mt-4">
        <AlertsList campaignId={campaign.id} scope="campaign" />
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Spend (7d)"
          value={formatMoney(cur.spend)}
          change={pctChange(cur.spend, prev.spend)}
          invert
        />
        <Stat
          label="Results (7d)"
          value={formatNumber(cur.results)}
          change={pctChange(cur.results, prev.results)}
        />
        <Stat
          label="Cost / Result"
          value={formatMoney(curCpr)}
          change={pctChange(curCpr, prevCpr)}
          invert
        />
        <Stat
          label="ROAS"
          value={formatRoas(curRoas)}
          change={pctChange(curRoas, prevRoas)}
        />
      </div>

      {/* Campaign settings summary */}
      <Card className="mt-4 p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-400">Settings</p>
          <button
            onClick={() => setEditingGoals(true)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Edit goal &amp; objective
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Detail label="Daily budget" value={formatMoney(campaign.daily_budget_usd)} />
          <Detail label="Bid strategy" value={campaign.bid_strategy} />
          <Detail
            label="Targeting"
            value={`${campaign.targeting_countries?.join(', ') || '—'} · age ${
              campaign.targeting_age_min ?? '—'
            }–${campaign.targeting_age_max ?? '—'}`}
          />
          <Detail
            label="Primary goal"
            value={campaign.primary_goal || 'Not set — this campaign wasn’t built here'}
            faint={!campaign.primary_goal}
          />
          <Detail
            label="Business objective"
            value={campaign.business_objective || 'Not set — this campaign wasn’t built here'}
            faint={!campaign.business_objective}
          />
          <Detail label="Meta campaign ID" value={campaign.meta_campaign_id || '—'} mono />
        </div>
      </Card>

      <EditGoalsModal
        open={editingGoals}
        campaign={campaign}
        onClose={() => setEditingGoals(false)}
        onSaved={(updated) => setCampaign(updated)}
      />

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-200">
        <nav className="flex gap-1">
          <TabButton active={tab === 'recommendations'} onClick={() => setTab('recommendations')}>
            Recommendations
          </TabButton>
          <TabButton active={tab === 'assistant'} onClick={() => setTab('assistant')}>
            Campaign Assistant
          </TabButton>
        </nav>
      </div>

      <div className="mt-4">
        {tab === 'recommendations' ? (
          <RecommendationsList campaignId={campaign.id} />
        ) : (
          <CampaignChat
            campaignId={campaign.id}
            currentBudgetUsd={campaign.daily_budget_usd}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

function Stat({
  label,
  value,
  change,
  invert,
}: {
  label: string
  value: string
  change: { pct: number; direction: 'up' | 'down' | 'flat' } | null
  invert?: boolean
}) {
  // invert: for spend / cost-per-result, "up" is bad (red), "down" is good.
  let tone = 'text-slate-400'
  if (change && change.direction !== 'flat') {
    const good = invert ? change.direction === 'down' : change.direction === 'up'
    tone = good ? 'text-green-600' : 'text-red-600'
  }
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className={cn('mt-1 text-xs', tone)}>
        {change
          ? `${change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '—'} ${Math.abs(
              change.pct,
            ).toFixed(0)}% vs prior 7d`
          : 'no prior-week data'}
      </p>
    </Card>
  )
}

function Detail({
  label,
  value,
  mono,
  faint,
}: {
  label: string
  value: string
  mono?: boolean
  faint?: boolean
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('text-slate-800', mono && 'font-mono text-xs', faint && 'italic text-slate-400')}>
        {value}
      </p>
    </div>
  )
}

// Primary goal / business objective are intake-form concepts — a campaign
// discovered on Meta rather than built through this app has no answer for
// them until someone types one in here.
function EditGoalsModal({
  open,
  campaign,
  onClose,
  onSaved,
}: {
  open: boolean
  campaign: Campaign | null
  onClose: () => void
  onSaved: (updated: Campaign) => void
}) {
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [businessObjective, setBusinessObjective] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && campaign) {
      setPrimaryGoal(campaign.primary_goal ?? '')
      setBusinessObjective(campaign.business_objective ?? '')
      setError(null)
    }
  }, [open, campaign])

  async function save() {
    if (!campaign) return
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        primary_goal: primaryGoal.trim() || null,
        business_objective: businessObjective.trim() || null,
      })
      .eq('id', campaign.id)
      .select()
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved(data as Campaign)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit goal & objective">
      <div className="space-y-4">
        <Field
          label="Primary goal"
          hint="Free text — what success looks like for this campaign."
        >
          <TextArea
            rows={2}
            value={primaryGoal}
            onChange={(e) => setPrimaryGoal(e.target.value)}
          />
        </Field>
        <Field
          label="Business objective"
          hint="Free text — the wider context behind this campaign."
        >
          <TextArea
            rows={2}
            value={businessObjective}
            onChange={(e) => setBusinessObjective(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  )
}
