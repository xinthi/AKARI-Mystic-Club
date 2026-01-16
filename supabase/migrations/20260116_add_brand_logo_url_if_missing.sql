-- Ensure brand_profiles has logo_url column

alter table if exists brand_profiles
  add column if not exists logo_url text,
  add column if not exists banner_url text;
