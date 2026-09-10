import type { ProposedAction } from '../lib/database.types'
import { formatCents } from '../lib/format'

// Renders a proposed_action as a clear before/after diff. Never applies anything
// itself — the parent owns the confirm handler.
export function ProposedActionPreview({ action }: { action: ProposedAction }) {
  const rows = diffRows(action)
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
        Proposed change
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{action.summary}</p>
      {rows.length > 0 && (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.field}>
                <td className="py-0.5 pr-3 text-slate-500">{r.label}</td>
                <td className="py-0.5 pr-2 text-slate-400 line-through">{r.before}</td>
                <td className="py-0.5 pr-2 text-slate-400">→</td>
                <td className="py-0.5 font-medium text-slate-900">{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function looksLikeCents(field: string): boolean {
  return /_cents$/.test(field) || /budget/i.test(field)
}

function fmt(field: string, value: unknown): string {
  if (value == null) return '—'
  if (looksLikeCents(field) && typeof value === 'number') return formatCents(value)
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function diffRows(action: ProposedAction) {
  const patch = action.patch ?? {}
  const before = action.before ?? {}
  return Object.keys(patch).map((field) => ({
    field,
    label: field.replace(/_/g, ' ').replace(/ cents$/, ''),
    before: fmt(field, before[field]),
    after: fmt(field, patch[field]),
  }))
}
