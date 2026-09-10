import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Client } from '../lib/database.types'
import { Button, Field, Modal, TextInput } from './ui'

export function EditClientModal({
  client,
  open,
  onClose,
  onSaved,
}: {
  client: Client
  open: boolean
  onClose: () => void
  onSaved: (updated: Client) => void
}) {
  const [form, setForm] = useState(client)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Client>(key: K, value: Client[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const patch = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      business_name: form.business_name?.trim() || null,
      website_url: form.website_url?.trim() || null,
      phone: form.phone?.trim() || null,
      meta_ad_account_id: form.meta_ad_account_id?.trim() || null,
      meta_page_id: form.meta_page_id?.trim() || null,
    }
    const { data, error } = await supabase
      .from('clients')
      .update(patch)
      .eq('id', client.id)
      .select()
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved(data as Client)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit client">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Email">
            <TextInput
              required
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <TextInput
              value={form.business_name ?? ''}
              onChange={(e) => set('business_name', e.target.value)}
            />
          </Field>
          <Field label="Website">
            <TextInput
              value={form.website_url ?? ''}
              onChange={(e) => set('website_url', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <TextInput
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
          <Field label="Meta Ad Account ID" hint="act_XXXXXXXXXX">
            <TextInput
              value={form.meta_ad_account_id ?? ''}
              onChange={(e) => set('meta_ad_account_id', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Facebook Page ID"
          hint="Required before any ad creative can be built."
        >
          <TextInput
            value={form.meta_page_id ?? ''}
            onChange={(e) => set('meta_page_id', e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
