// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript --local` once the project is linked.

export type CampaignStatus = 'pending' | 'building' | 'active' | 'paused' | 'error'
export type RecommendationStatus = 'open' | 'applied' | 'dismissed'
export type AlertType = 'spend_spike' | 'cpl_doubled' | 'rejected' | 'fatigue'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageStatus = 'new' | 'drafted' | 'approved' | 'sent' | 'dismissed'
export type ChatRole = 'user' | 'assistant'
export type ChatActionStatus = 'proposed' | 'applied' | 'dismissed'
export type MetaObjective =
  | 'OUTCOME_LEADS'
  | 'OUTCOME_SALES'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_APP_PROMOTION'

export interface Client {
  id: string
  name: string
  email: string
  business_name: string | null
  website_url: string | null
  phone: string | null
  meta_ad_account_id: string | null
  meta_page_id: string | null
  created_at: string
}

export interface Campaign {
  id: string
  client_id: string
  meta_ad_account_id: string | null
  campaign_name: string | null
  primary_goal: string | null
  business_objective: string | null
  objective: MetaObjective
  daily_budget_cents: number | null
  bid_strategy: string
  targeting_countries: string[] | null
  targeting_age_min: number | null
  targeting_age_max: number | null
  status: CampaignStatus
  pending_review: boolean
  meta_campaign_id: string | null
  meta_adset_id: string | null
  meta_ad_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface CampaignMetric {
  id: string
  campaign_id: string
  date: string
  spend: number | null
  results: number | null
  cost_per_result: number | null
  impressions: number | null
  clicks: number | null
  cpm: number | null
  cpc: number | null
  ctr: number | null
  frequency: number | null
  roas: number | null
}

export interface Recommendation {
  id: string
  campaign_id: string
  type: string | null
  dollars_recoverable: number | null
  meta_resource_id: string | null
  status: RecommendationStatus
  synced_at: string
}

export interface Alert {
  id: string
  campaign_id: string
  alert_type: AlertType
  detail: Record<string, unknown> | null
  created_at: string
  acknowledged: boolean
}

export interface Message {
  id: string
  client_id: string
  campaign_id: string | null
  direction: MessageDirection
  channel: string
  from_email: string | null
  subject: string | null
  body: string | null
  ai_draft_body: string | null
  proposed_action: Record<string, unknown> | null
  status: MessageStatus
  created_at: string
  sent_at: string | null
}

export interface CampaignChatMessage {
  id: string
  campaign_id: string
  role: ChatRole
  content: string | null
  proposed_action: ProposedAction | null
  action_status: ChatActionStatus | null
  created_at: string
}

export interface MetaAdsSettings {
  id: string
  app_id: string | null
  app_secret: string | null
  system_user_token: string | null
  business_manager_id: string | null
  singleton: boolean
}

// Shape n8n is expected to write into proposed_action. Rendered as a diff
// preview before the agency confirms — never auto-applied.
export interface ProposedAction {
  kind: string // e.g. 'increase_budget', 'pause_adset', 'update_targeting'
  summary: string // human sentence, e.g. "Increase daily budget from $50 to $75"
  table?: string // table the frontend should update on confirm
  row_id?: string
  patch?: Record<string, unknown> // column -> new value
  before?: Record<string, unknown> // column -> current value, for the diff
}

// --- Client portal RPC return shapes ---
export interface PortalMessage {
  id: string
  direction: MessageDirection
  subject: string | null
  body: string | null
  created_at: string
  sent_at: string | null
  status: MessageStatus
  campaign_id: string | null
  campaign_name: string | null
}

export interface PortalData {
  business_name: string
  messages: PortalMessage[]
}

export interface PortalCampaign {
  id: string
  campaign_name: string | null
  status: CampaignStatus
}
