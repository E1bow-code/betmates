-- BetMates data model, matching the brief's Section 5 starting point.
-- Run this once in a new Supabase project (SQL Editor), then set
-- VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local - the app
-- switches from the localStorage mock (src/lib/localBackend.js) to these
-- tables automatically via src/lib/dataStore.js. No UI code changes needed.

create extension if not exists "pgcrypto";

-- One row per auth.users user; created at sign-up (see src/lib/dataStore.js).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  date_of_birth date not null,
  bookmaker_prefs text[] not null default '{}',
  notification_prefs jsonb not null default '{"betPosted": true, "betSettled": true, "oddsMoved": false}',
  friend_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  accepted_terms_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table bet_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id),
  sport text not null,
  market_type text not null,
  selections jsonb not null, -- [{event, market, selection, odds, bookmaker}, ...]
  stake numeric,
  stake_hidden boolean not null default false,
  potential_return numeric,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table bet_copies (
  id uuid primary key default gen_random_uuid(),
  original_bet_id uuid not null references bet_posts(id) on delete cascade,
  copying_user_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table bet_reactions (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bet_posts(id) on delete cascade,
  user_id uuid not null references profiles(id),
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (bet_id, user_id, emoji)
);

create table bet_comments (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bet_posts(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Personal tracker entries not tied to a group post (manual log, Section 2C).
create table manual_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  market_type text not null,
  selections jsonb not null,
  stake numeric,
  potential_return numeric,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- Cached fixtures + odds history, normalised across sports/providers.
create table fixtures (
  id text primary key,
  sport text not null,
  competition text,
  home_team text not null,
  away_team text not null,
  kickoff timestamptz not null,
  status text not null default 'scheduled'
);

create table odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null references fixtures(id) on delete cascade,
  bookmaker text not null,
  market text not null,
  selection text not null,
  odds numeric not null,
  fetched_at timestamptz not null default now()
);

-- --- Row Level Security ----------------------------------------------------

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table bet_posts enable row level security;
alter table bet_copies enable row level security;
alter table bet_reactions enable row level security;
alter table bet_comments enable row level security;
alter table manual_entries enable row level security;

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "members read their groups" on groups for select using (
  exists (select 1 from group_members m where m.group_id = groups.id and m.user_id = auth.uid())
);
create policy "any signed-in user can create a group" on groups for insert with check (auth.uid() = created_by);

create policy "members read their membership rows" on group_members for select using (
  exists (select 1 from group_members m2 where m2.group_id = group_members.group_id and m2.user_id = auth.uid())
);
create policy "user joins a group as themselves" on group_members for insert with check (auth.uid() = user_id);

create policy "members read bet posts in their groups" on bet_posts for select using (
  exists (select 1 from group_members m where m.group_id = bet_posts.group_id and m.user_id = auth.uid())
);
create policy "members post bets as themselves" on bet_posts for insert with check (
  auth.uid() = user_id and exists (select 1 from group_members m where m.group_id = bet_posts.group_id and m.user_id = auth.uid())
);
create policy "author updates own bet status" on bet_posts for update using (auth.uid() = user_id);

create policy "members read bet copies in their groups" on bet_copies for select using (
  exists (
    select 1 from bet_posts b
    join group_members m on m.group_id = b.group_id
    where b.id = bet_copies.original_bet_id and m.user_id = auth.uid()
  )
);
create policy "user records their own copy" on bet_copies for insert with check (auth.uid() = copying_user_id);

create policy "members read reactions in their groups" on bet_reactions for select using (
  exists (
    select 1 from bet_posts b
    join group_members m on m.group_id = b.group_id
    where b.id = bet_reactions.bet_id and m.user_id = auth.uid()
  )
);
create policy "user reacts as themselves" on bet_reactions for insert with check (auth.uid() = user_id);
create policy "user removes own reaction" on bet_reactions for delete using (auth.uid() = user_id);

create policy "members read comments in their groups" on bet_comments for select using (
  exists (
    select 1 from bet_posts b
    join group_members m on m.group_id = b.group_id
    where b.id = bet_comments.bet_id and m.user_id = auth.uid()
  )
);
create policy "user comments as themselves" on bet_comments for insert with check (auth.uid() = user_id);

create policy "user reads own tracker entries" on manual_entries for select using (auth.uid() = user_id);
create policy "user writes own tracker entries" on manual_entries for insert with check (auth.uid() = user_id);
create policy "user updates own tracker entries" on manual_entries for update using (auth.uid() = user_id);

-- fixtures / odds_snapshots are public reference data cached by the
-- Netlify Function (netlify/functions/odds.js) using the service role key,
-- so no RLS write policy is needed for anon clients; reads are open.
alter table fixtures enable row level security;
alter table odds_snapshots enable row level security;
create policy "anyone can read fixtures" on fixtures for select using (true);
create policy "anyone can read odds snapshots" on odds_snapshots for select using (true);

-- --- Friends & video tips ---------------------------------------------------
-- NOT YET WIRED UP in src/lib/dataStore.js - the friends/video-tips feature
-- currently runs local-only (src/lib/localBackend.js + src/lib/videoStore.js's
-- IndexedDB blobs), per an explicit product decision to ship that fast
-- rather than stand up cloud video storage first. These tables are here so
-- the real schema is ready when that's revisited: `video_posts.storage_key`
-- would move from an IndexedDB key to a Supabase Storage object path/URL,
-- and dataStore's addFriendByCode/listFriends/createVideoPost/etc. would
-- grow the same `if (!isSupabaseConfigured) return local.X(...)` branches
-- as everything else in that file.

create table friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique (user_a, user_b)
);

create table video_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  storage_key text not null, -- Supabase Storage object path once wired up
  duration_sec integer,
  caption text,
  tag text, -- freeform pick, e.g. "Thunder Chaser to win at Ascot 14:30"
  created_at timestamptz not null default now()
);

create table video_shares (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references video_posts(id) on delete cascade,
  shared_by_user_id uuid not null references profiles(id),
  target_type text not null check (target_type in ('group', 'friend')),
  target_id uuid not null, -- groups.id or profiles.id depending on target_type
  created_at timestamptz not null default now()
);

alter table friendships enable row level security;
alter table video_posts enable row level security;
alter table video_shares enable row level security;

create policy "user reads own friendships" on friendships for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "user adds a friendship as themselves" on friendships for insert with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "author and friends read video posts" on video_posts for select using (
  auth.uid() = author_id or exists (
    select 1 from friendships f
    where (f.user_a = auth.uid() and f.user_b = author_id) or (f.user_b = auth.uid() and f.user_a = author_id)
  )
);
create policy "user posts videos as themselves" on video_posts for insert with check (auth.uid() = author_id);

create policy "recipient and sharer read a share" on video_shares for select using (
  auth.uid() = shared_by_user_id
  or (target_type = 'friend' and target_id = auth.uid())
  or (target_type = 'group' and exists (select 1 from group_members m where m.group_id = target_id and m.user_id = auth.uid()))
);
create policy "user shares as themselves" on video_shares for insert with check (auth.uid() = shared_by_user_id);
