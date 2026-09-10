import type { Campaign } from '../lib/database.types'
import { Pill } from './ui'

// Every campaign this platform creates launches PAUSED for human review. The
// dashboard needs to tell "paused, awaiting your launch decision" apart from
// "paused, the agency chose to pause it" at a glance — so pending_review gets
// its own loud treatment, not the same grey as a normal pause.
export function CampaignStatusBadge({
  status,
  pendingReview,
}: {
  status: Campaign['status']
  pendingReview?: boolean
}) {
  if (status === 'paused' && pendingReview) {
    return (
      <Pill tone="violet">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-600" />
        Paused · needs launch review
      </Pill>
    )
  }

  switch (status) {
    case 'pending':
      return <Pill tone="slate">Pending</Pill>
    case 'building':
      return (
        <Pill tone="blue">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
          Building on Meta
        </Pill>
      )
    case 'active':
      return (
        <Pill tone="green">
          <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
          Active
        </Pill>
      )
    case 'paused':
      return <Pill tone="amber">Paused by agency</Pill>
    case 'error':
      return <Pill tone="red">Error</Pill>
    default:
      return <Pill tone="slate">{status}</Pill>
  }
}
