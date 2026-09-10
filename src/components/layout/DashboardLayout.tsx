import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui'

// "Sync Now" nudges n8n to run the Meta pull immediately. There is no direct
// Meta call from the browser — we just stamp a request row that n8n polls.
// If the table isn't present yet this degrades to a friendly notice.
async function requestSync(): Promise<string> {
  const { error } = await supabase.from('sync_requests').insert({ source: 'dashboard' })
  if (error) {
    if (error.code === '42P01') {
      return 'Sync request table not set up yet — ask the n8n side to add `sync_requests`, or trigger the workflow manually.'
    }
    return `Could not queue sync: ${error.message}`
  }
  return 'Sync queued. New metrics will appear once n8n finishes its run.'
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
