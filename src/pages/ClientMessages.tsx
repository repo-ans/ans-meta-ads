import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Client } from '../lib/database.types'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { MessageThread } from '../components/MessageThread'
import { Spinner } from '../components/ui'

export default function ClientMessages() {
  const { clientId } = useParams<{ clientId: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()
      .then(({ data }) => {
        setClient(data as Client)
        setLoading(false)
      })
  }, [clientId])

  return (
    <DashboardLayout>
      <Link
        to={`/dashboard/clients/${clientId}`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← {client?.business_name || client?.name || 'Client'}
      </Link>
      <h1 className="mt-2 text-xl font-bold">Messages</h1>
      <p className="mb-4 text-sm text-slate-500">
        Agency view of the client's in-app thread. Approve AI drafts before they send.
      </p>
      {loading || !clientId ? (
        <Spinner label="Loading…" />
      ) : (
        <MessageThread clientId={clientId} />
      )}
    </DashboardLayout>
  )
}
