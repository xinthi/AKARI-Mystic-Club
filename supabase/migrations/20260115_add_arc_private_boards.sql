-- ARC Private Leaderboards (KOL Boards)

create table if not exists arc_private_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  base_url text,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  visibility text not null default 'private' check (visibility in ('private', 'invite', 'approved')),
  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists arc_private_board_kols (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references arc_private_boards(id) on delete cascade,
  profile_id uuid references profiles(id),
  twitter_username text,
  status text not null default 'invited' check (status in ('invited', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, profile_id),
  unique (board_id, twitter_username)
);

create table if not exists arc_private_board_utms (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references arc_private_boards(id) on delete cascade,
  kol_id uuid not null references arc_private_board_kols(id) on delete cascade,
  base_url text not null,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  utm_content text not null,
  generated_url text not null,
  created_at timestamptz not null default now(),
  unique (kol_id)
);

create table if not exists arc_private_board_utm_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references arc_private_boards(id) on delete cascade,
  kol_id uuid references arc_private_board_kols(id) on delete set null,
  event_type text not null check (event_type in ('click', 'conversion')),
  request_path text,
  referrer text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);
