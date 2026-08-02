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

-- group_id is nullable: a null group_id + visibility='public' is a post to
-- the public Feed (see src/pages/SocialFeedPage.jsx), not tied to any group.
create table bet_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  user_id uuid not null references profiles(id),
  sport text not null,
  market_type text not null,
  selections jsonb not null, -- [{event, market, selection, odds, bookmaker}, ...]
  stake numeric,
  stake_hidden boolean not null default false,
  potential_return numeric,
  visibility text not null default 'group' check (visibility in ('group', 'public')),
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((visibility = 'group' and group_id is not null) or (visibility = 'public' and group_id is null))
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

create policy "update own profile" on profiles for update using (auth.uid() = id);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);

-- Broader than "read own profile only": the friend-code lookup (add a
-- friend by code), the public Feed (showing author names), and follow
-- buttons all need to resolve OTHER people's basic profile info, not just
-- your own. Trade-off: email and date_of_birth become readable by any
-- signed-in user, not just the profile owner. Tighten later with a
-- narrower public "handles" view if that's not acceptable.
create policy "signed-in users can read any profile" on profiles for select using (auth.role() = 'authenticated');

-- Creator must be able to read the group back immediately after creating it,
-- before their own group_members row exists (Supabase's insert().select()
-- does the INSERT then a SELECT in one request; without this, that
-- read-back gets blocked by RLS and reports as a generic insert failure).
-- Also broad enough for "join with a code": looking a group up by its
-- invite_code has to work before the joiner has a group_members row.
-- Trade-off (same shape as the profiles policy above): any signed-in user
-- can technically list all groups' names/codes, not just ones they're in.
create policy "signed-in users can read any group" on groups for select using (auth.role() = 'authenticated');
create policy "any signed-in user can create a group" on groups for insert with check (auth.uid() = created_by);

-- A policy on group_members that subqueries group_members itself causes
-- "infinite recursion detected in policy" - Postgres re-evaluates the same
-- RLS policy for the inner query. security definer sidesteps that by
-- running the check with the function owner's privileges (bypassing RLS)
-- instead of the caller's.
create or replace function is_group_member(_group_id uuid, _user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from group_members where group_id = _group_id and user_id = _user_id);
$$;

-- auth.uid() = user_id (no subquery) covers reading back your own just-
-- inserted row when joining a group - same read-after-insert RLS gotcha as
-- groups/bet_posts above. is_group_member() covers seeing your groupmates'
-- membership rows.
create policy "members read their membership rows" on group_members for select using (
  auth.uid() = user_id
  or is_group_member(group_id, auth.uid())
);
create policy "user joins a group as themselves" on group_members for insert with check (auth.uid() = user_id);

create policy "members read bet posts in their groups" on bet_posts for select using (
  exists (select 1 from group_members m where m.group_id = bet_posts.group_id and m.user_id = auth.uid())
);
create policy "anyone signed in can read public bet posts" on bet_posts for select using (visibility = 'public');
create policy "members post bets as themselves" on bet_posts for insert with check (
  auth.uid() = user_id and (
    (visibility = 'public' and group_id is null)
    or exists (select 1 from group_members m where m.group_id = bet_posts.group_id and m.user_id = auth.uid())
  )
);
create policy "author updates own bet status" on bet_posts for update using (auth.uid() = user_id);

create policy "members or anyone read copies of visible bet posts" on bet_copies for select using (
  exists (
    select 1 from bet_posts b
    where b.id = bet_copies.original_bet_id
    and (b.visibility = 'public' or exists (select 1 from group_members m where m.group_id = b.group_id and m.user_id = auth.uid()))
  )
);
create policy "user records their own copy" on bet_copies for insert with check (auth.uid() = copying_user_id);

create policy "members or anyone read reactions on visible bet posts" on bet_reactions for select using (
  exists (
    select 1 from bet_posts b
    where b.id = bet_reactions.bet_id
    and (b.visibility = 'public' or exists (select 1 from group_members m where m.group_id = b.group_id and m.user_id = auth.uid()))
  )
);
create policy "user reacts as themselves" on bet_reactions for insert with check (auth.uid() = user_id);
create policy "user removes own reaction" on bet_reactions for delete using (auth.uid() = user_id);

create policy "members or anyone read comments on visible bet posts" on bet_comments for select using (
  exists (
    select 1 from bet_posts b
    where b.id = bet_comments.bet_id
    and (b.visibility = 'public' or exists (select 1 from group_members m where m.group_id = b.group_id and m.user_id = auth.uid()))
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

-- --- Friends, follows & video tips -----------------------------------------
-- Friends, follows, and video-post METADATA sync through Supabase like
-- everything else once configured. Video BYTES do not: storage_key still
-- points at an IndexedDB key on whichever device recorded/uploaded the
-- clip (see src/lib/videoStore.js), not a Supabase Storage object - that
-- part is still local-only. A clip recorded on one device will show
-- VideoCard's "recorded on a different device" fallback everywhere else
-- until storage_key is switched to a real Storage URL and the record/
-- upload flow is changed to push bytes there instead of IndexedDB.

create table friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique (user_a, user_b)
);

-- One-way, unlike friendships: no accept step needed.
create table follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (follower_id <> following_id),
  unique (follower_id, following_id)
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
alter table follows enable row level security;
alter table video_posts enable row level security;
alter table video_shares enable row level security;

create policy "user reads own friendships" on friendships for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "user adds a friendship as themselves" on friendships for insert with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "anyone can read follow relationships" on follows for select using (true);
create policy "user follows as themselves" on follows for insert with check (auth.uid() = follower_id);
create policy "user unfollows as themselves" on follows for delete using (auth.uid() = follower_id);

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

-- --- Group chat & push notifications ----------------------------------
-- group_messages is plain free-text chat, separate from bet_comments
-- (which thread under one specific bet post) - see src/pages/GroupFeedPage.jsx.

create table group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table group_messages enable row level security;

create policy "members read group messages" on group_messages for select using (
  is_group_member(group_id, auth.uid())
);
create policy "members send group messages as themselves" on group_messages for insert with check (
  auth.uid() = user_id and is_group_member(group_id, auth.uid())
);

-- One row per browser/device's Web Push subscription (a user signed in on
-- two devices gets two rows).
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "user manages own push subscriptions" on push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- netlify/functions/send-push.js authenticates as the poster (their own
-- access token, not a service-role key - there isn't one configured for
-- this project) and needs to look up their group-mates' subscriptions to
-- fan a notification out to them. Broadens read access to "anyone who
-- shares a group with you" rather than only your own rows.
create policy "group-mates can read push subscriptions to notify them" on push_subscriptions for select using (
  exists (
    select 1 from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = push_subscriptions.user_id
  )
);
