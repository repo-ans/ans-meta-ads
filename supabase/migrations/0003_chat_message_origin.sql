-- Distinguishes an unprompted AI observation (posted automatically by the
-- daily sync) from a reply to something the agency typed in Campaign
-- Assistant — so the frontend can surface proactive ones under the
-- Recommendations tab (where the agency actually looks for "what should I
-- do about this campaign") instead of only inside the chat history.
--
-- Run with: supabase db push   (or paste into the SQL editor)

alter table public.campaign_chat_messages
  add column if not exists origin text check (origin in ('user_reply', 'proactive'));

comment on column public.campaign_chat_messages.origin is
  'proactive = posted unprompted by the daily sync''s AI review. user_reply = a reply to an agency chat message. null = legacy rows from before this column existed.';
