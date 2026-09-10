import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Client, MetaObjective } from '../lib/database.types'
import { dollarsToCents } from '../lib/format'
import { Button, Field, Select, TextArea, TextInput } from './ui'

const OBJECTIVES: MetaObjective[] = [
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_APP_PROMOTION',
]

type Result = { ok: true; message: string } | { ok: false; message: string }

/**
 * Branches on `existingClient`:
 *  - absent  -> new-client mode. Client fields only, NO campaign fields.
 *  - present -> campaign-only mode. Prefills the Meta Ad Account ID from the
 *               client record; collects campaign build parameters.
 */
export function IntakeForm({
  existingClient,
  onDone,
}: {
  existingClient?: Client
  onDone?: (result: Result) => void
}) {
  const mode = existingClient ? 'campaign' : 'client'
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  // client-mode fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [phone, setPhone] = useState('')
  const [adAccount, setAdAccount] = useState('')
  const [pageId, setPageId] = useState('')

  // campaign-mode fields
  const [campaignName, setCampaignName] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [businessObjective, setBusinessObjective] = useState('')
  const [objective, setObjective] = useState<MetaObjective>('OUTCOME_LEADS')
  const [dailyBudget, setDailyBudget] = useState('')
  const [countries, setCountries] = useState('US')
  const [ageMin, setAgeMin] = useState('18')
  const [ageMax, setAgeMax] = useState('65')

  async function submitClient(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    const { error } = await supabase.from('clients').insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      business_name: businessName.trim() || null,
      website_url: websiteUrl.trim() || null,
      phone: phone.trim() || null,
      meta_ad_account_id: adAccount.trim() || null,
      meta_page_id: pageId.trim() || null,
    })
    setSubmitting(false)
    const r: Result = error
      ? {
          ok: false,
          message:
            error.code === '23505'
              ? 'A client with this email already exists.'
              : error.message,
        }
      : { ok: true, message: 'Thanks — your details are in. The agency will be in touch.' }
    setResult(r)
    onDone?.(r)
    if (r.ok) {
      setName('')
      setEmail('')
      setBusinessName('')
      setWebsiteUrl('')
      setPhone('')
      setAdAccount('')
      setPageId('')
    }
  }

  async function submitCampaign(e: FormEvent) {
    e.preventDefault()
    if (!existingClient) return
    setSubmitting(true)
    setResult(null)
    const countryList = countries
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
    const { error } = await supabase.from('campaigns').insert({
      client_id: existingClient.id,
      meta_ad_account_id: existingClient.meta_ad_account_id,
      campaign_name: campaignName.trim(),
      primary_goal: primaryGoal.trim() || null,
      business_objective: businessObjective.trim() || null,
      objective,
      daily_budget_cents: dollarsToCents(dailyBudget),
      targeting_countries: countryList.length ? countryList : null,
      targeting_age_min: ageMin ? Number(ageMin) : null,
      targeting_age_max: ageMax ? Number(ageMax) : null,
      status: 'pending',
      pending_review: true,
    })
    setSubmitting(false)
    const r: Result = error
      ? { ok: false, message: error.message }
      : {
          ok: true,
          message:
            'Campaign queued. It will be built on Meta and launched paused for your review.',
        }
    setResult(r)
    onDone?.(r)
    if (r.ok) {
      setCampaignName('')
      setPrimaryGoal('')
      setBusinessObjective('')
      setDailyBudget('')
    }
  }

  return (
    <form
      onSubmit={mode === 'client' ? submitClient : submitCampaign}
      className="space-y-4"
    >
      {mode === 'client' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <TextInput
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <TextInput
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <TextInput
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </Field>
            <Field label="Website">
              <TextInput
                type="url"
                placeholder="https://"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Meta Ad Account ID"
              hint="Optional now — format act_XXXXXXXXXX. Can be added later."
            >
              <TextInput
                placeholder="act_1234567890"
                value={adAccount}
                onChange={(e) => setAdAccount(e.target.value)}
              />
            </Field>
            <Field
              label="Facebook Page ID"
              hint="Optional now — required before any ads can run."
            >
              <TextInput value={pageId} onChange={(e) => setPageId(e.target.value)} />
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Meta Ad Account ID"
            hint="Prefilled from the client record."
          >
            <TextInput
              value={existingClient?.meta_ad_account_id ?? ''}
              readOnly
              disabled
            />
          </Field>
          <Field label="Campaign name">
            <TextInput
              required
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary goal" hint="Free text — what success looks like.">
              <TextArea
                rows={2}
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
              />
            </Field>
            <Field label="Business objective" hint="Free text — the wider context.">
              <TextArea
                rows={2}
                value={businessObjective}
                onChange={(e) => setBusinessObjective(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meta objective (ODAX)">
              <Select
                value={objective}
                onChange={(e) => setObjective(e.target.value as MetaObjective)}
              >
                {OBJECTIVES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Daily budget" hint="In dollars, e.g. 50">
              <TextInput
                inputMode="decimal"
                placeholder="50"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Target countries"
            hint="Comma-separated ISO codes, e.g. US, CA, GB"
          >
            <TextInput
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Min age">
              <TextInput
                type="number"
                min={13}
                max={65}
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
              />
            </Field>
            <Field label="Max age">
              <TextInput
                type="number"
                min={13}
                max={65}
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-red-300 bg-red-50 text-red-800'
          }`}
        >
          {result.message}
        </div>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting
          ? 'Submitting…'
          : mode === 'client'
            ? 'Submit'
            : 'Queue campaign'}
      </Button>
    </form>
  )
}
