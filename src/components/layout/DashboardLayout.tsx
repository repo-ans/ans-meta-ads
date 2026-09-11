import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { triggerSyncNow, WebhookError } from '../../lib/webhooks'
import { Button } from '../ui'

// "Sync Now" fires the n8n `sync-now` webhook, which runs the same Meta pull as
// the daily schedule. n8n responds immediately; metrics land a few seconds
// later, so the caller just reloads its data shortly after.
async function requestSync(): Promise<string> {
  try {
    await triggerSyncNow()
    return 'Sync started. New metrics will appear shortly — refresh in a moment.'
  } catch (e) {
    return e instanceof WebhookError
      ? `Could not start sync: ${e.message}`
      : 'Could not start sync.'
  }
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function onSync() {
    setSyncing(true)
    setSyncMsg(await requestSync())
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 6000)
  }

  async function onLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-sm font-bold text-slate-900">
            Meta Ads <span className="text-brand-600">Agency</span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onSync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
            <Link to="/settings" className="btn-ghost">
              Settings
            </Link>
            <Link to="/account" className="btn-ghost">
              Account
            </Link>
            <Button variant="ghost" onClick={onLogout}>
              Logout
            </Button>
          </div>
        </div>
        {syncMsg && (
          <div className="bg-brand-50 px-4 py-2 text-center text-xs text-brand-700">
            {syncMsg}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
