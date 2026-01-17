-- ARC Quest Tracking v1 enhancements (links, UTMs, submissions)

-- 1) Campaign links: add link_index (1..5) and unique per campaign
alter table if exists brand_campaign_links
  add column if not exists link_index int;

update brand_campaign_links
set link_index = display_order + 1
where link_index is null
  and display_order is not null
  and display_order < 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'brand_campaign_links_link_index_range'
  ) then
    alter table brand_campaign_links
      add constraint brand_campaign_links_link_index_range
      check (link_index between 1 and 5);
  end if;
end $$;

create unique index if not exists idx_brand_campaign_links_campaign_link_index
  on brand_campaign_links(campaign_id, link_index)
  where link_index is not null;

-- 2) UTM links: reference campaign link id
alter table if exists campaign_utm_links
  add column if not exists brand_campaign_link_id uuid references brand_campaign_links(id) on delete set null;

update campaign_utm_links cul
set brand_campaign_link_id = bcl.id
from brand_campaign_links bcl
where cul.brand_campaign_link_id is null
  and cul.utm_content = bcl.id::text;

create unique index if not exists idx_campaign_utm_links_creator_link
  on campaign_utm_links(campaign_id, creator_profile_id, brand_campaign_link_id)
  where brand_campaign_link_id is not null;

create index if not exists idx_campaign_utm_links_link_id
  on campaign_utm_links(brand_campaign_link_id)
  where brand_campaign_link_id is not null;

-- 3) UTM events: add ip_hash, country, and campaign_link_id
alter table if exists campaign_utm_events
  add column if not exists campaign_link_id uuid references brand_campaign_links(id) on delete set null;

alter table if exists campaign_utm_events
  add column if not exists ip_hash text;

alter table if exists campaign_utm_events
  add column if not exists country text;

create index if not exists idx_campaign_utm_events_campaign_link_id
  on campaign_utm_events(campaign_link_id);

create index if not exists idx_campaign_utm_events_ip_hash
  on campaign_utm_events(ip_hash);

-- 4) Submissions: add X verification + link usage fields
alter table if exists campaign_submissions
  add column if not exists x_tweet_id text;

alter table if exists campaign_submissions
  add column if not exists verified_at timestamptz;

alter table if exists campaign_submissions
  add column if not exists rejected_reason text;

alter table if exists campaign_submissions
  add column if not exists used_campaign_link boolean default false;

alter table if exists campaign_submissions
  add column if not exists matched_utm_link_id uuid references campaign_utm_links(id) on delete set null;

create unique index if not exists idx_campaign_submissions_unique_x_tweet
  on campaign_submissions(campaign_id, creator_profile_id, x_tweet_id)
  where platform = 'x' and x_tweet_id is not null;
