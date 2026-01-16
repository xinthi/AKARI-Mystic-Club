-- Brand Profiles and Campaigns (CRM Pivot)

create table if not exists portal_user_preferences (
  user_id uuid primary key references akari_users(id) on delete cascade,
  arc_mode text not null default 'creator' check (arc_mode in ('creator', 'crm')),
  updated_at timestamptz not null default now()
);

create table if not exists brand_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references akari_users(id) on delete cascade,
  name text not null,
  x_handle text,
  website text,
  tg_community text,
  tg_channel text,
  brief_text text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brand_founders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles(id) on delete cascade,
  profile_id uuid references profiles(id),
  username text,
  role text not null default 'founder' check (role in ('founder', 'co-founder', 'investor')),
  created_at timestamptz not null default now(),
  unique (brand_id, profile_id),
  unique (brand_id, username)
);

create table if not exists brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles(id) on delete cascade,
  profile_id uuid references profiles(id),
  username text,
  joined_at timestamptz not null default now(),
  unique (brand_id, profile_id),
  unique (brand_id, username)
);

create table if not exists brand_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles(id) on delete cascade,
  name text not null,
  pitch text,
  objectives text,
  campaign_type text not null default 'public' check (campaign_type in ('exclusive', 'invite', 'public', 'monad')),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  languages text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brand_campaign_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references brand_campaigns(id) on delete cascade,
  label text,
  url text not null,
  display_order int not null default 0
);

create table if not exists brand_campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references brand_campaigns(id) on delete cascade,
  profile_id uuid references profiles(id),
  username text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'invited')),
  joined_at timestamptz not null default now(),
  unique (campaign_id, profile_id),
  unique (campaign_id, username)
);

create table if not exists campaign_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references brand_campaigns(id) on delete cascade,
  creator_profile_id uuid references profiles(id),
  platform text not null,
  post_url text not null,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists campaign_utm_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references brand_campaigns(id) on delete cascade,
  creator_profile_id uuid references profiles(id),
  base_url text not null,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  utm_content text not null,
  generated_url text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_profile_id, utm_content)
);

create table if not exists campaign_utm_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references brand_campaigns(id) on delete cascade,
  creator_profile_id uuid references profiles(id),
  event_type text not null check (event_type in ('click', 'conversion')),
  source_platform text,
  location text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);
