-- Realigns the Meta schema to the conventions the Google Ads sibling system
-- (and its 6 n8n workflows) already use, so both platforms share one frontend
-- pattern and one proposed_action contract.
--
-- Apply this AFTER 0001_init.sql. If you are setting up fresh, 0001 already
-- includes the end state and this file is a no-op.
--
-- Run with:  supabase db push   (or paste into the SQL editor)

-- 1. campaigns.daily_budget_cents -> daily_budget_usd (plain dollars).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns'
      and column_name = 'daily_budget_cents'
  ) then
    alter table public.campaigns add column if not exists daily_budget_usd numeric;
    update public.campaigns
      set daily_budget_usd = round(daily_budget_cents::numeric / 100, 2)
      where daily_budget_cents is not null and daily_budget_usd is null;
    alter table public.campaigns drop column daily_budget_cents;
  end if;
end $$;

-- 2. recommendations.meta_resource_id -> resource_name.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recommendations'
      and column_name = 'meta_resource_id'
  ) then
    alter table public.recommendations rename column meta_resource_id to resource_name;
  end if;
end $$;

-- 3. Drop sync_requests — the "Sync Now" button POSTs to the n8n `sync-now`
--    webhook directly now.
drop table if exists public.sync_requests;

-- 4. campaigns.pending_review — keep (Meta-specific): distinguishes a freshly
--    built PAUSED campaign awaiting the agency's launch decision from an
--    agency-chosen pause. The Meta build-campaign workflow sets it true;
--    apply-campaign-action clears it on any pause/resume.
alter table public.campaigns
  add column if not exists pending_review boolean not null default true;
