import type { ProposedAction } from '../lib/database.types'
import { formatMoney } from '../lib/format'

// Renders a proposed_action as a clear before/after preview. Never applies
// anything itself — the parent owns the confirm handler, which fires the
// apply-campaign-action / send-reply webhook.
export function ProposedActionPreview({
  action,
  currentBudgetUsd,
}: {
  action: ProposedAction
  currentBudgetUsd?: number | null
}) {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
        Proposed change
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{title(action)}</p>

      {action.action_type === 'update_daily_budget' && (
        <p className="mt-1 text-sm">
          <span className="text-slate-400 line-through">
            {currentBudgetUsd != null ? formatMoney(currentBudgetUsd) : 'current budget'}
          </span>
          <span className="mx-2 text-slate-400">→</span>
          <span className="font-semibold text-slate-900">
            {formatMoney(action.daily_budget_usd)} / day
          </span>
        </p>
      )}

      {action.reason && (
        <p className="mt-1.5 text-xs text-slate-500">{action.reason}</p>
      )}
    </div>
  )
}

function title(a: ProposedAction): string {
  switch (a.action_type) {
    case 'update_daily_budget':
      return `Change the daily budget to ${formatMoney(a.daily_budget_usd)}`
    case 'pause_campaign':
      return 'Pause this campaign'
    case 'resume_campaign':
      return 'Resume this campaign'
    default:
      return 'Proposed change'
  }
}
