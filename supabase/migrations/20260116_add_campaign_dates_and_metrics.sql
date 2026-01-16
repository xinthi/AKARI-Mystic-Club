-- Add dates and metrics to campaigns/submissions

alter table if exists brand_campaigns
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;

alter table if exists campaign_submissions
  add column if not exists like_count int,
  add column if not exists reply_count int,
  add column if not exists repost_count int,
  add column if not exists view_count int,
  add column if not exists engagement_score numeric,
  add column if not exists updated_at timestamptz;
