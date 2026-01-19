alter table if exists campaign_submissions
  add column if not exists qualified boolean default false,
  add column if not exists qualification_reason text;
