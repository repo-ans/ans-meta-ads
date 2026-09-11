// Formatting helpers. Money (daily_budget_usd, spend, dollars_recoverable, …)
// is stored as plain dollars.

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatMoney(dollars: number | null | undefined): string {
  if (dollars == null) return '—'
  return usd.format(dollars)
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatRoas(roas: number | null | undefined): string {
  if (roas == null) return '—'
  return `${roas.toFixed(2)}x`
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—'
  return `${n.toFixed(digits)}%`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

// Percent change helper: returns { pct, direction } or null when no baseline.
export function pctChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): { pct: number; direction: 'up' | 'down' | 'flat' } | null {
  if (current == null || previous == null || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  const direction = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down'
  return { pct, direction }
}

// Parse a currency-ish form input ("50", "50.00", "$50", "1,000") to a number.
export function parseDollars(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100) / 100
}
