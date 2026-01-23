-- Add eligibility + scoring fields for campaign submissions
alter table if exists campaign_submissions
  add column if not exists eligible boolean default false,
  add column if not exists brand_attribution boolean default false,
  add column if not exists content_text text,
  add column if not exists post_quality_score numeric,
  add column if not exists post_final_score numeric,
  add column if not exists alignment_score numeric,
  add column if not exists compliance_score numeric,
  add column if not exists clarity_score numeric,
  add column if not exists safety_score numeric,
  add column if not exists score_reason_json jsonb;
