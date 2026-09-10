import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { MetaAdsSettings } from '../lib/database.types'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Button, Card, Field, Spinner, TextInput } from '../components/ui'

// meta_ads_settings is a singleton, agency-only. The service_role key is never
// used here — this reads/writes as the authenticated admin under RLS.
export default function Settings() {
  const [row, setRow] = useState<MetaAdsSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [token, setToken] = useState('')
  const [bmId, setBmId] = useState('')

  useEffect(() => {
    supabase
      .from('meta_ads_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as MetaAdsSettings | null
        setRow(r)
        setAppId(r?.app_id ?? '')
        setBmId(r?.business_manager_id ?? '')
        // secrets are write-only in the UI — never prefill them
        setLoading(false)
      })
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const patch: Record<string, unknown> = {
      app_id: appId.trim() || null,
      business_manager_id: bmId.trim() || null,
    }
    if (appSecret.trim()) patch.app_secret = appSecret.trim()
    if (token.trim()) patch.system_user_token = token.trim()

    const res = row
      ? await supabase.from('meta_ads_settings').update(patch).eq('id', row.id).select().single()
      : await supabase
          .from('meta_ads_settings')
          .insert({ ...patch, singleton: true })
          .select()
          .single()

    setSaving(false)
    if (res.error) {
      setMsg(res.error.message)
      return
    }
    setRow(res.data as MetaAdsSettings)
    setAppSecret('')
    setToken('')
    setMsg('Settings saved.')
  }

  return (
    <DashboardLayout>
      <Link to="/dashboard" className="text-sm text-slate-500 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-xl font-bold">Settings</h1>
      <p className="text-sm text-slate-500">
        Meta app credentials used by the n8n automation. Stored in Supabase, readable
        only by the agency admin.
      </p>

      {loading ? (
        <Spinner label="Loading settings…" />
      ) : (
        <Card className="mt-4 max-w-lg p-5">
          <form onSubmit={save} className="space-y-4">
            <Field label="Meta App ID">
              <TextInput value={appId} onChange={(e) => setAppId(e.target.value)} />
            </Field>
            <Field
              label="Meta App Secret"
              hint={
                row?.app_secret ? 'A secret is stored. Enter a new value to replace it.' : undefined
              }
            >
              <TextInput
                type="password"
                placeholder={row?.app_secret ? '•••••••• (unchanged)' : ''}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
              />
            </Field>
            <Field
              label="System User Token"
              hint={
                row?.system_user_token
                  ? 'A token is stored. Enter a new value to replace it.'
                  : 'Long-lived token from your Business Manager system user.'
              }
            >
              <TextInput
                type="password"
                placeholder={row?.system_user_token ? '•••••••• (unchanged)' : ''}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
            <Field label="Business Manager ID">
              <TextInput value={bmId} onChange={(e) => setBmId(e.target.value)} />
            </Field>

            {msg && <p className="text-sm text-slate-600">{msg}</p>}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </Card>
      )}
    </DashboardLayout>
  )
}
