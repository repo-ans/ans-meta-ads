-- Multi-client Meta Ads agency automation platform — initial schema.
--
-- Security model:
--   * anon  -> public intake only: INSERT into clients / campaigns, plus the
--              three client-portal RPCs (SECURITY DEFINER).
--   * authenticated -> the single agency admin: full read/write on everything
--              except meta_ads_settings which is further restricted below.
--   * service_role is NEVER used from the browser. n8n uses it server-side.
--
-- Run with:  supabase db push      (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  email               text not null unique,
  business_name       text,
  website_url         text,
  phone               text,
  meta_ad_account_id  text,   -- 'act_XXXXXXXXXX'
  meta_page_id        text,   -- Facebook Page ID; required before any ad creative
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id) on delete cascade,
  meta_ad_account_id  text,
  campaign_name       text,
  primary_goal        text,   -- intake concept; nullable, not set on discovered campaigns
  business_objective  text,   -- intake concept; nullable
  objective           text not null default 'OUTCOME_LEADS',
  daily_budget_cents  integer,
  bid_strategy        text not null default 'LOWEST_COST_WITHOUT_CAP',
  targeting_countries text[],
  targeting_age_min   integer,
  targeting_age_max   integer,
  status              text not null default 'pending'
                        check (status in ('pending','building','active','paused','error')),
  -- true  => campaign was just created and is PAUSED awaiting the agency's
  --          launch decision. false => an agency-chosen pause / any other state.
  pending_review      boolean not null default true,
  meta_campaign_id    text,
  meta_adset_id       text,
  meta_ad_id          text,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists campaigns_meta_campaign_id_key
  on public.campaigns (meta_campaign_id)
  where meta_campaign_id is not null;

create index if not exists campaigns_client_id_idx on public.campaigns (client_id);

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- campaign_metrics
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_metrics (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  date            date not null,
  spend           numeric,
  results         integer,
  cost_per_result numeric,
  impressions     integer,
  clicks          integer,
  cpm             numeric,
  cpc             numeric,
  ctr             numeric,
  frequency       numeric,
  roas            numeric,
  unique (campaign_id, date)
);

create index if not exists campaign_metrics_campaign_date_idx
  on public.campaign_metrics (campaign_id, date desc);

-- ---------------------------------------------------------------------------
-- recommendations  (Meta's own recommendations, synced in by n8n)
-- ---------------------------------------------------------------------------
create table if not exists public.recommendations (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references public.campaigns (id) on delete cascade,
  type                 text,
  dollars_recoverable  numeric,
  meta_resource_id     text unique,
  status               text not null default 'open'
                         check (status in ('open','applied','dismissed')),
  synced_at            timestamptz not null default now()
);

create index if not exists recommendations_campaign_idx
  on public.recommendations (campaign_id, status);

-- ---------------------------------------------------------------------------
-- alerts  (Meta-specific; driven by Phase 1 anomaly flags)
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  alert_type   text not null
                 check (alert_type in ('spend_spike','cpl_doubled','rejected','fatigue')),
  detail       jsonb,
  created_at   timestamptz not null default now(),
  acknowledged boolean not null default false
);

create index if not exists alerts_unacked_idx
  on public.alerts (campaign_id) where acknowledged = false;

-- ---------------------------------------------------------------------------
-- messages  (client <-> agency, in-app)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  campaign_id    uuid references public.campaigns (id) on delete set null,
  direction      text not null check (direction in ('inbound','outbound')),
  channel        text not null default 'in_app',
  from_email     text,
  subject        text,
  body           text,
  ai_draft_body  text,
  proposed_action jsonb,
  status         text not null default 'new'
                   check (status in ('new','drafted','approved','sent','dismissed')),
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);

create index if not exists messages_client_idx on public.messages (client_id, created_at);

-- ---------------------------------------------------------------------------
-- campaign_chat_messages  (agency-facing AI assistant)
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text,
  proposed_action jsonb,
  action_status   text check (action_status in ('proposed','applied','dismissed')),
  created_at      timestamptz not null default now()
);

create index if not exists campaign_chat_campaign_idx
  on public.campaign_chat_messages (campaign_id, created_at);

-- ---------------------------------------------------------------------------
-- meta_ads_settings  (singleton, agency-only, never service_role in browser)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_ads_settings (
  id                   uuid primary key default gen_random_uuid(),
  app_id               text,
  app_secret           text,
  system_user_token    text,
  business_manager_id   text,
  singleton            boolean not null default true unique
);

-- ---------------------------------------------------------------------------
-- sync_requests  (ADDITION beyond the original spec)
-- The dashboard "Sync Now" button writes a row here; an n8n trigger polls the
-- table and runs the Meta pull on demand. The frontend never calls Meta.
-- Drop this table if the n8n side prefers a webhook instead.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_requests (
  id           uuid primary key default gen_random_uuid(),
  source       text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.clients               enable row level security;
alter table public.campaigns             enable row level security;
alter table public.campaign_metrics      enable row level security;
alter table public.recommendations       enable row level security;
alter table public.alerts                enable row level security;
alter table public.messages              enable row level security;
alter table public.campaign_chat_messages enable row level security;
alter table public.meta_ads_settings     enable row level security;
alter table public.sync_requests         enable row level security;

-- Public intake: anon may INSERT clients + campaigns only.
create policy "anon can insert clients"  on public.clients
  for insert to anon with check (true);
create policy "anon can insert campaigns" on public.campaigns
  for insert to anon with check (true);

-- The single agency admin (any authenticated user) can do everything.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','campaigns','campaign_metrics','recommendations',
    'alerts','messages','campaign_chat_messages'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'authenticated full access', t
    );
  end loop;
end $$;

create policy "authenticated full access" on public.sync_requests
  for all to authenticated using (true) with check (true);

-- meta_ads_settings: authenticated read/write, but keep it explicit & separate
-- so it is easy to lock down further later (e.g. to a specific admin uid).
create policy "authenticated can read settings" on public.meta_ads_settings
  for select to authenticated using (true);
create policy "authenticated can write settings" on public.meta_ads_settings
  for all to authenticated using (true) with check (true);

-- ===========================================================================
-- Client portal RPCs  (SECURITY DEFINER — access via unguessable client UUID)
-- ===========================================================================

create or replace function public.get_client_portal_data(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_name text;
  v_messages jsonb;
begin
  select coalesce(business_name, name) into v_business_name
  from clients where id = p_client_id;

  if v_business_name is null then
    raise exception 'client not found' using errcode = 'no_data_found';
  end if;

  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at), '[]'::jsonb)
  into v_messages
  from (
    select msg.id, msg.direction, msg.subject, msg.body,
           msg.created_at, msg.sent_at, msg.status,
           msg.campaign_id, c.campaign_name
    from messages msg
    left join campaigns c on c.id = msg.campaign_id
    where msg.client_id = p_client_id
      and msg.status in ('sent','new','approved')
  ) m;

  return jsonb_build_object(
    'business_name', v_business_name,
    'messages', v_messages
  );
end;
$$;

create or replace function public.get_client_campaigns(p_client_id uuid)
returns table (id uuid, campaign_name text, status text)
language sql
security definer
set search_path = public
as $$
  select id, campaign_name, status
  from campaigns
  where client_id = p_client_id
  order by created_at;
$$;

create or replace function public.insert_client_message(
  p_client_id   uuid,
  p_body        text,
  p_campaign_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'message body is required';
  end if;

  if not exists (select 1 from clients where id = p_client_id) then
    raise exception 'client not found' using errcode = 'no_data_found';
  end if;

  -- Validate the campaign belongs to this client, if one was supplied.
  if p_campaign_id is not null then
    if not exists (
      select 1 from campaigns
      where id = p_campaign_id and client_id = p_client_id
    ) then
      raise exception 'campaign does not belong to this client';
    end if;
  end if;

  insert into messages (client_id, campaign_id, direction, channel, body, status)
  values (p_client_id, p_campaign_id, 'inbound', 'in_app', p_body, 'new')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.get_client_portal_data(uuid)   from public;
revoke all on function public.get_client_campaigns(uuid)     from public;
revoke all on function public.insert_client_message(uuid, text, uuid) from public;

grant execute on function public.get_client_portal_data(uuid)   to anon, authenticated;
grant execute on function public.get_client_campaigns(uuid)     to anon, authenticated;
grant execute on function public.insert_client_message(uuid, text, uuid) to anon, authenticated;
