import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Button, Card, Field, TextInput } from '../components/ui'

export default function Account() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    setMsg(error ? error.message : 'Password updated.')
    if (!error) setPassword('')
  }

  return (
    <DashboardLayout>
      <Link to="/dashboard" className="text-sm text-slate-500 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-xl font-bold">Account</h1>

      <Card className="mt-4 max-w-md space-y-1 p-4 text-sm">
        <p>
          <span className="text-slate-500">Signed in as</span> {session?.user.email}
        </p>
        <p className="text-xs text-slate-400">User ID: {session?.user.id}</p>
      </Card>

      <Card className="mt-4 max-w-md p-4">
        <h2 className="font-semibold">Change password</h2>
        <form onSubmit={changePassword} className="mt-3 space-y-3">
          <Field label="New password">
            <TextInput
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>
    </DashboardLayout>
  )
}
