alter table if exists campaign_submissions
  add column if not exists twitter_fetch_error text,
  add column if not exists twitter_fetch_at timestamptz;
