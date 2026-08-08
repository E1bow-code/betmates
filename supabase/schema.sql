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
  notification_prefs jsonb not null default '{"betPosted": true, "betSettled": true, "oddsMoved": false, "kickoffReminders": false}',
  friend_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  accepted_terms_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  is_discoverable boolean not null default false,
  member_count integer not null default 0
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
  user_id uuid not null references profiles(id) on delete cascade,
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
  outcomes jsonb, -- per-leg ['won'|'lost'|'void'|'placed', ...], set on auto-settlement only (see betEvaluation.js) - null for manually-marked results, which have no per-leg breakdown
  check ((visibility = 'group' and group_id is not null) or (visibility = 'public' and group_id is null))
);

create table bet_copies (
  id uuid primary key default gen_random_uuid(),
  original_bet_id uuid not null references bet_posts(id) on delete cascade,
  copying_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table bet_reactions (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bet_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (bet_id, user_id, emoji)
);

create table bet_comments (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bet_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
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
  settled_at timestamptz,
  outcomes jsonb -- see bet_posts.outcomes
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
create policy "creator renames their group" on groups for update using (auth.uid() = created_by);

-- A policy on group_members that subqueries group_members itself causes
-- "infinite recursion detected in policy" - Postgres re-evaluates the same
-- RLS policy for the inner query. security definer sidesteps that by
-- running the check with the function owner's privileges (bypassing RLS)
-- instead of the caller's.
-- search_path is pinned rather than left to inherit the caller's: these
-- run security definer (see above), and account deletion showed the gap in
-- practice - auth.admin.deleteUser()'s internal cascade delete runs as a
-- role whose default search_path doesn't include public, so the unqualified
-- group_members/groups references below resolved to nothing and threw
-- "relation does not exist", which surfaced to the user as a failed account
-- deletion (netlify/functions/delete-account.js). Every security definer
-- function in this file needs this, not just these two - a function that
-- resolves table names via the caller's search_path instead of a pinned one
-- is also a privilege-escalation footgun in general (a caller-writable
-- schema earlier in their search_path could shadow the intended table).
create or replace function is_group_member(_group_id uuid, _user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from group_members where group_id = _group_id and user_id = _user_id);
$$;

-- Keeps groups.member_count in sync for src/pages/SocialFeedPage.jsx's
-- Discover segment (a non-member browsing Discover can't read
-- group_members/bet_posts rows at all under the RLS above, so a live count
-- has to come from somewhere denormalized rather than a real-time query).
-- security definer for the same reason as is_group_member() above: a
-- joining non-creator's own group_members INSERT needs to update a groups
-- row, which the creator-only "creator renames their group" UPDATE policy
-- would otherwise block.
create or replace function sync_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update groups set member_count = member_count + 1 where id = new.group_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update groups set member_count = member_count - 1 where id = old.group_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists group_members_sync_count on group_members;
create trigger group_members_sync_count
after insert or delete on group_members
for each row execute function sync_group_member_count();

-- auth.uid() = user_id (no subquery) covers reading back your own just-
-- inserted row when joining a group - same read-after-insert RLS gotcha as
-- groups/bet_posts above. is_group_member() covers seeing your groupmates'
-- membership rows.
create policy "members read their membership rows" on group_members for select using (
  auth.uid() = user_id
  or is_group_member(group_id, auth.uid())
);
create policy "user joins a group as themselves" on group_members for insert with check (auth.uid() = user_id);
create policy "user leaves a group as themselves" on group_members for delete using (auth.uid() = user_id);
create policy "creator removes a member" on group_members for delete using (
  exists (select 1 from groups g where g.id = group_members.group_id and g.created_by = auth.uid())
);

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
-- Restricted to status = 'open' - without it, an author could rewrite a
-- settled bet's stake or outcome after the fact via a raw API call, which
-- undermines the whole trust-based-leaderboard model. Matches how the
-- existing self-report "mark result" flow already only ever fires from
-- 'open', and how the edit/delete UI (src/components/EditBetSheet.jsx)
-- gates itself client-side - this makes that the enforced rule, not just
-- the convention. DELETE didn't exist for authors at all before this.
--
-- The with check clause matters: Postgres reuses an UPDATE policy's using
-- expression as its check on the *new* row when no with check is given,
-- which would make status = 'open' a requirement of the result too - and
-- break the self-report transition into 'won'/'lost'/'void' this policy is
-- meant to allow. using still gates which rows can be touched at all
-- (must be open going in); with check only re-confirms ownership.
create policy "author updates own open bet post" on bet_posts for update using (
  auth.uid() = user_id and status = 'open'
) with check (
  auth.uid() = user_id
);
create policy "author deletes own open bet post" on bet_posts for delete using (
  auth.uid() = user_id and status = 'open'
);

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
-- Same status = 'open' restriction as bet_posts above, and for the same
-- reason - a settled entry is a historical record, not something to
-- quietly rewrite after the fact. with check is the same fix too: without
-- it Postgres would reuse using as the check on the new row and block the
-- open -> won/lost/void self-report transition this policy needs to allow.
create policy "user updates own open tracker entry" on manual_entries for update using (
  auth.uid() = user_id and status = 'open'
) with check (
  auth.uid() = user_id
);
create policy "user deletes own open tracker entry" on manual_entries for delete using (
  auth.uid() = user_id and status = 'open'
);

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
  shared_by_user_id uuid not null references profiles(id) on delete cascade,
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
  user_id uuid not null references profiles(id) on delete cascade,
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

-- Kickoff reminders (netlify/functions/alert-checks.js, a scheduled
-- function) need to scan every user's open bets, not just one poster's own
-- group - that has no signed-in user to authenticate as, so it runs on the
-- service-role key instead of RLS. The sent-at column just stops it
-- re-notifying the same bet on its next 15-minute run.
alter table bet_posts add column if not exists kickoff_reminder_sent_at timestamptz;

-- --- Blocks & reports (public feed safety) ------------------------------
-- Block/report only apply to the public Feed (see BetCard.jsx variant=
-- 'public') - not group posts, since a group is already a set of people
-- you chose to be around. Reports are captured here for a future
-- moderation pass; there's no review dashboard reading this table yet.

create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

create table post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references bet_posts(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

alter table blocks enable row level security;
alter table post_reports enable row level security;

create policy "user reads own blocks" on blocks for select using (auth.uid() = blocker_id);
create policy "user blocks as themselves" on blocks for insert with check (auth.uid() = blocker_id);
create policy "user unblocks as themselves" on blocks for delete using (auth.uid() = blocker_id);

create policy "user reads own reports" on post_reports for select using (auth.uid() = reporter_id);
create policy "user reports as themselves" on post_reports for insert with check (auth.uid() = reporter_id);

-- --- Report moderation ---------------------------------------------------
-- One flag on profiles rather than a separate roles table - this project
-- has exactly one operator, not a team with different permission levels.
-- src/pages/AdminReportsPage.jsx (route /admin/reports) is the only thing
-- gated on it, client-side for UX and via these two policies for the real
-- enforcement. bet_posts never had a delete policy before this - nobody,
-- not even a post's own author, could delete one; this adds exactly one
-- way for a post to be removed; admin takedown.
alter table profiles add column if not exists is_admin boolean not null default false;

create policy "admins read all reports" on post_reports for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "admins dismiss reports" on post_reports for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "admins remove reported posts" on bet_posts for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);

-- --- Direct messages ------------------------------------------------------
-- 1:1 chat between friends - separate from group_messages (which is scoped
-- to a group's members) and bet_comments (threaded under one bet post).

create table direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table direct_messages enable row level security;

create policy "user reads own direct messages" on direct_messages for select using (
  auth.uid() = sender_id or auth.uid() = recipient_id
);
create policy "user sends direct messages as themselves" on direct_messages for insert with check (
  auth.uid() = sender_id
);

-- --- Profile photos --------------------------------------------------------
-- Storage bucket for uploaded avatars. Public read (avatars are shown to
-- anyone who can see the profile at all, same as display_name already is)
-- but writes are scoped to a path prefixed with the uploader's own user id
-- (see src/lib/dataStore.js's uploadAvatar, which uploads to `${userId}/...`),
-- checked via storage.foldername() rather than a users table join since
-- storage.objects has no direct FK to profiles.

alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "user uploads own avatar" on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "user replaces own avatar" on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

-- --- Referrals -------------------------------------------------------------
-- Who invited whom, captured at sign-up from a stashed /r/:code (mirrors
-- App.jsx's existing StashJoinCode pattern for group invites) - not a
-- points/rewards system, just attribution for a "most invites" leaderboard
-- (see netlify/functions/hall-of-fame.js) since a competitive stat is more
-- honest right now than inventing a currency with nothing to spend it on.
-- on delete set null (not cascade) - if the referrer's account is later
-- deleted (see delete-account.js), the person they referred keeps their own
-- account; they just lose that attribution, same as the referrer forfeits
-- the Hall of Fame credit rather than taking their invitee down with them.

alter table profiles add column if not exists referred_by uuid references profiles(id) on delete set null;

-- --- Direct message push notifications ------------------------------------
-- Same idea as the group-mates policy above, but for friends instead of
-- group members - lets the sender's own token (see send-push.js's friendId
-- branch) look up the recipient's subscription to notify them of a new DM.
create policy "friends can read each other's push subscriptions" on push_subscriptions for select using (
  exists (
    select 1 from friendships f
    where (f.user_a = auth.uid() and f.user_b = push_subscriptions.user_id)
       or (f.user_b = auth.uid() and f.user_a = push_subscriptions.user_id)
  )
);

-- --- Bet comment push notifications -----------------------------------
-- Same idea again, for send-push.js's authorId branch: a comment can land
-- on a public-feed post from someone who's neither a group-mate nor a
-- friend of the poster, so neither policy above would cover it. Scoped
-- tightly to "you've actually just commented on one of their bets", not a
-- blanket grant.
create policy "commenters can read the bet author's push subscriptions" on push_subscriptions for select using (
  exists (
    select 1 from bet_comments c
    join bet_posts p on p.id = c.bet_id
    where c.user_id = auth.uid() and p.user_id = push_subscriptions.user_id
  )
);

-- --- New-pick push notifications for followers -----------------------
-- send-push.js's followersOf branch: the poster's own token needs to read
-- their followers' subscriptions to announce a new public pick. followersOf
-- is always the caller's own id (auth.uid()), so this only ever exposes a
-- follower's subscription to the specific person they chose to follow.
create policy "followed users can read their followers' push subscriptions" on push_subscriptions for select using (
  exists (
    select 1 from follows f
    where f.following_id = auth.uid() and f.follower_id = push_subscriptions.user_id
  )
);

-- --- Responsible gambling: spending limit -----------------------------
-- A self-set weekly/monthly stake cap (see src/pages/AccountPage.jsx and
-- src/components/BetBuilderSheet.jsx's soft warning nudge) - null/null means
-- no limit set. No new RLS policy needed: "update own profile" above
-- already covers these columns.

alter table profiles add column if not exists stake_limit_amount numeric;
alter table profiles add column if not exists stake_limit_period text check (stake_limit_period in ('weekly', 'monthly'));

-- --- Odds target alerts -------------------------------------------------
-- "Alert me when this hits X" on a single outcome (see FixtureDetailPage's
-- bell button on each outcome row). event_id/market_key/outcome_name are
-- exactly what netlify/functions/alert-checks.js needs to re-fetch the
-- SAME fixture/fight/event from the same internal /api/* routes the client
-- uses and find the matching price again - kickoff is captured at creation
-- so the checker can cheaply drop an alert once its event has clearly
-- passed, without needing to re-fetch it first. Racing is deliberately
-- excluded from the create flow - see racingClient.js, its odds are mock
-- data that never actually moves.
create table odds_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  event_id text not null,
  event_label text not null,
  kickoff timestamptz not null,
  market_key text not null,
  market_label text not null,
  outcome_name text not null,
  selection_label text not null,
  target_decimal numeric not null,
  created_at timestamptz not null default now(),
  triggered_at timestamptz
);
alter table odds_alerts enable row level security;
create policy "user manages own odds alerts" on odds_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Followed fixtures ---------------------------------------------------
-- "Follow" a fixture/fight/event without adding it to the bet slip at all -
-- kickoff reminders and result notifications (both now
-- netlify/functions/alert-checks.js) previously only fired for something
-- tied to an open bet; this is the same two
-- notifications for someone just watching a fixture out of interest.
-- unique() makes following idempotent - re-following (or a duplicate
-- FollowButton click) is just an upsert, not a second row.
create table followed_fixtures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  event_id text not null,
  event_label text not null,
  kickoff timestamptz not null,
  created_at timestamptz not null default now(),
  kickoff_reminder_sent_at timestamptz,
  result_sent_at timestamptz,
  unique (user_id, sport, event_id)
);
alter table followed_fixtures enable row level security;
create policy "user manages own follows" on followed_fixtures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Followed teams/players (standing preference) -------------------------
-- Distinct from followed_fixtures above: that's "notify me about this ONE
-- upcoming game", this is "always show me this team/player wherever they
-- show up" - powers OddsListPage's "My teams only" filter. participant_name
-- is a plain string match against whatever the odds provider calls that
-- team/player (fixture.homeTeam, fight.fighterA, event.participantA, etc.),
-- not a foreign key - there's no shared participant table across sports.
create table followed_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport text not null,
  participant_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, sport, participant_name)
);
alter table followed_participants enable row level security;
create policy "user manages own followed participants" on followed_participants for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Admin flag integrity -------------------------------------------------
-- profiles.is_admin decides who can read every moderation report and delete
-- anyone's bet post, but "update own profile" lets a user write their own
-- profiles row, and a Postgres RLS policy is row-level - it can't stop one
-- particular column being set. Nothing here is hidden, either: the anon key
-- ships in the client bundle by design (RLS is what protects the data), so
-- any signed-in user could open a console and run
--   supabase.from('profiles').update({ is_admin: true }).eq('id', <own id>)
-- and hand themselves moderator rights. The insert policy has the same hole
-- at sign-up time.
--
-- Column-level GRANTs would fix it but need every updatable column listing
-- by hand, which silently breaks open again the next time one is added.
-- A trigger defaults the other way: is_admin holds its previous value (and
-- starts false) for anything arriving over the public API, whatever columns
-- the row grows later. auth.role() is 'anon'/'authenticated' only for those
-- requests, so the service-role key and direct SQL - the two ways an
-- operator actually grants admin - still work untouched.
create or replace function guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    else
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_is_admin_on_profiles on profiles;
create trigger guard_is_admin_on_profiles
  before insert or update on profiles
  for each row execute function guard_is_admin();

-- --- Comment/reaction/copy insert visibility fix --------------------------
-- Overnight RLS audit: the insert policies for bet_comments, bet_reactions,
-- and bet_copies only ever checked auth.uid() = the acting user - unlike
-- bet_posts' own insert policy (which gates on group membership) or
-- group_messages' (which calls is_group_member()), none of these three
-- verified the target bet_id was actually something the caller can see.
-- Since RLS is the only access control this app has (the anon key ships in
-- the client bundle by design), that meant any signed-in user could POST a
-- comment/reaction/copy-record onto a private group's bet post via a raw
-- API call even without being a member - invisible in the UI, but real
-- against the API directly, and group members WOULD see the injected
-- comment/reaction show up since the SELECT policies (correctly) already
-- trust group membership. Reusing each table's own SELECT policy condition
-- here so insert-eligibility matches read-eligibility exactly: you can only
-- comment/react/copy on something you could already see.
drop policy if exists "user comments as themselves" on bet_comments;
create policy "user comments as themselves" on bet_comments for insert with check (
  auth.uid() = user_id and exists (
    select 1 from bet_posts b
    where b.id = bet_comments.bet_id
    and (b.visibility = 'public' or exists (select 1 from group_members m where m.group_id = b.group_id and m.user_id = auth.uid()))
  )
);

drop policy if exists "user reacts as themselves" on bet_reactions;
create policy "user reacts as themselves" on bet_reactions for insert with check (
  auth.uid() = user_id and exists (
    select 1 from bet_posts b
    where b.id = bet_reactions.bet_id
    and (b.visibility = 'public' or exists (select 1 from group_members m where m.group_id = b.group_id and m.user_id = auth.uid()))
  )
);

drop policy if exists "user records their own copy" on bet_copies;
create policy "user records their own copy" on bet_copies for insert with check (
  auth.uid() = copying_user_id and exists (
    select 1 from bet_posts b
    where b.id = bet_copies.original_bet_id
    and (b.visibility = 'public' or exists (select 1 from group_members m where m.group_id = b.group_id and m.user_id = auth.uid()))
  )
);

-- --- Streak milestone push reminders --------------------------------------
-- netlify/functions/streak-reminders.js celebrates a user's win streak the
-- first time it reaches 3/5/10 (matching the badge thresholds in
-- src/utils/achievements.js). streak_milestone_notified tracks the highest
-- milestone already sent so it never re-fires for one they've already hit -
-- same idea as kickoff_reminder_sent_at, but per-user rather than per-bet
-- since a streak isn't tied to one row. It's monotonic and never resets on a
-- loss: like the achievement badges it mirrors, a milestone stays "earned"
-- even after the streak that reached it ends. No new RLS policy needed:
-- "update own profile" already covers this column.
alter table profiles add column if not exists streak_milestone_notified integer not null default 0;

-- --- Fixture (match-day) chat ----------------------------------------------
-- A chat room scoped to one fixture/fight/event rather than a group -
-- for mates watching the same game live who aren't necessarily in a group
-- together. Separate from group_messages (scoped to a group) and
-- bet_comments (threaded under one bet post). sport/event_id match whatever
-- the odds provider calls that fixture (see followed_fixtures above for the
-- same non-FK pattern) - there's no shared fixtures row for every sport, so
-- this can't be a real foreign key. Open read/write to any signed-in user,
-- same trade-off as bet_posts' public-feed policy: it's a watch-party, not
-- something scoped to people you chose to be around. display_name is
-- denormalized onto the row at send time rather than joined from profiles
-- at read time - there's no bounded "members" list to build a name map from
-- the way group chat has, and a chat message showing the name the sender
-- had at the time they sent it is normal chat-app behaviour anyway.
create table fixture_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  event_id text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table fixture_chat_messages enable row level security;
create policy "any signed-in user can read fixture chat" on fixture_chat_messages for select using (auth.role() = 'authenticated');
create policy "user sends fixture chat as themselves" on fixture_chat_messages for insert with check (auth.uid() = user_id);

-- --- Peer spend-limit accountability ---------------------------------------
-- A self-set spend limit (stake_limit_amount/period above) only ever nudges
-- the person who set it - this adds one trusted mate who gets a push when
-- the limit's actually been hit, the way a real accountability partner
-- would. limit_alert_sent_at is a per-period watermark, same idea as
-- kickoff_reminder_sent_at: netlify/functions/alert-checks.js compares it
-- against periodStart(period) rather than clearing it explicitly, so it
-- naturally "resets" the moment a new week/month starts without a separate
-- cron job to zero it out. No new RLS needed for either column - "update
-- own profile" already covers them.
alter table profiles add column if not exists limit_buddy_id uuid references profiles(id) on delete set null;
alter table profiles add column if not exists limit_alert_sent_at timestamptz;

-- --- Season-long table predictor --------------------------------------------
-- A slower group game than Pick'em (single match, weekly) - predict a final
-- order for a whole competition, scored against a snapshot of the real
-- table. Deliberately freeform rather than hardcoding one league's clubs:
-- participants is whatever list the group's first predictor was created
-- with, so it works for any competition without a season-to-season
-- promotion/relegation list to maintain. One active predictor per group at
-- a time in this version - no picker UI for switching between competitions
-- yet, same "ship the honest scope, not a stub of a bigger one" call as
-- DEEP_LINK_BUILDERS' empty object in bookmakers.js.
create table predictors (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  competition text not null,
  participants jsonb not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  current_standings jsonb,
  standings_updated_by uuid references profiles(id),
  standings_updated_at timestamptz
);

-- A member's predicted order for one predictor - upsertable any time before
-- (or after) standings are entered, trust-based like every other self-
-- reported result in this app rather than locking at a kickoff time.
create table predictor_entries (
  id uuid primary key default gen_random_uuid(),
  predictor_id uuid not null references predictors(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  predicted_order jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (predictor_id, user_id)
);

alter table predictors enable row level security;
alter table predictor_entries enable row level security;

create policy "members read group predictors" on predictors for select using (is_group_member(group_id, auth.uid()));
create policy "members create a predictor as themselves" on predictors for insert with check (
  auth.uid() = created_by and is_group_member(group_id, auth.uid())
);
-- Any member can update standings, not just the creator - it's a shared
-- scoreboard snapshot, same trust model as a group member self-reporting a
-- bet's result.
create policy "members update standings on their group's predictor" on predictors for update using (
  is_group_member(group_id, auth.uid())
) with check (
  is_group_member(group_id, auth.uid())
);

create policy "members read entries for their group's predictors" on predictor_entries for select using (
  exists (select 1 from predictors p where p.id = predictor_entries.predictor_id and is_group_member(p.group_id, auth.uid()))
);
create policy "members submit their own entry" on predictor_entries for insert with check (
  auth.uid() = user_id and exists (select 1 from predictors p where p.id = predictor_entries.predictor_id and is_group_member(p.group_id, auth.uid()))
);
create policy "members update their own entry" on predictor_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Team news push alerts -------------------------------------------------
-- netlify/functions/team-news-alerts.js - the push half of the Social tab's
-- News "My teams" filter (SocialFeedPage.jsx/followed_participants).
-- team_news_notified_at is a watermark, not a per-headline log: only items
-- published after this timestamp are eligible next run, so nothing re-fires
-- for a headline already seen. Left null until the function's first run
-- after someone opts in or follows their first team, which sets it to "now"
-- without notifying - avoids blasting every matching headline already
-- sitting in the feed as if it just broke. No new RLS policy needed:
-- "update own profile" already covers this column.
alter table profiles add column if not exists team_news_notified_at timestamptz;

-- --- Client error logs ------------------------------------------------------
-- src/components/ErrorBoundary.jsx posts here through dataStore.js's
-- logClientError() whenever a page throws and the boundary catches it -
-- before this, a crash was only ever visible in whoever's own devtools
-- console. Insert is open to anyone, signed in or not (a crash on AuthPage
-- itself is exactly the case with nobody to attribute it to), but only an
-- admin can read the list back - same single-operator is_admin gating as
-- post_reports above, surfaced on AdminReportsPage's "Error logs" tab.
create table error_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  route text,
  user_id uuid references profiles(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table error_logs enable row level security;

create policy "anyone can log a client error" on error_logs for insert with check (true);
create policy "admins read error logs" on error_logs for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "admins delete error logs" on error_logs for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);

-- --- Realtime ----------------------------------------------------------
-- Live updates for chat/feed/unread-badges (src/lib/dataStore.js's
-- subscribeX functions) - postgres_changes only fires for tables in this
-- publication. Existing RLS SELECT policies already scope who receives
-- what per-subscriber; no new policies needed. INSERT-only for now (see
-- dataStore.js's subscribeToInserts) - no UPDATE/DELETE requires no
-- replica identity change from the default.
alter publication supabase_realtime add table group_messages;
alter publication supabase_realtime add table bet_posts;
alter publication supabase_realtime add table direct_messages;
alter publication supabase_realtime add table fixture_chat_messages;

-- --- Realtime: bet comments & reactions -----------------------------------
-- Third live-update pass (comments/reactions were cut from the prior
-- Realtime pass - see that section's comment above). bet_reactions needs
-- REPLICA IDENTITY FULL because toggleReaction is delete-to-remove (no
-- UPDATE path - see dataStore.js) and the default replica identity only
-- puts the primary key in a DELETE's payload.old, which has no bet_id to
-- route the event by. bet_comments has no delete/update UI, so it stays on
-- the default identity.
alter table bet_reactions replica identity full;
alter publication supabase_realtime add table bet_comments;
alter publication supabase_realtime add table bet_reactions;

-- --- CoachGPT chat history --------------------------------------------
-- One row per turn (role 'user'|'assistant') in a user's private chat
-- with CoachGPT (src/pages/CoachGptPage.jsx) - same shape as
-- direct_messages above, but single-user (no recipient) since this is a
-- conversation with the AI, not between two people. No realtime
-- publication entry: unlike the chat surfaces above, this is a single-
-- device request/response flow (see netlify/functions/coachgpt.js,
-- which is stateless and has no Supabase access at all), not a shared
-- thread another party needs to see arrive live.
create table coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table coach_messages enable row level security;

create policy "user reads own coach messages" on coach_messages for select using (
  auth.uid() = user_id
);
create policy "user inserts own coach messages" on coach_messages for insert with check (
  auth.uid() = user_id
);

-- grounding: real BetSlip legs for the "Log this" quick action on an
-- assistant message (netlify/functions/coachgpt.js's
-- groundFixtureOutcomes/groundRunner) - null on a user message, and null
-- on an assistant message that wasn't grounded in exactly one fixture/
-- race. No new RLS policy needed: the two policies above already cover
-- every column on this table.
alter table coach_messages add column if not exists grounding jsonb;

-- --- Value-edge push alerts -------------------------------------------------
-- netlify/functions/alert-checks.js's runValueEdgeAlerts - the proactive
-- half of CoachGPT: pushes when a followed team/fighter (followed_participants)
-- has a real price edge (src/utils/valueFinder.js's findBoardValue, the same
-- "meaningful edge" bar the Odds tab's own value flag uses), rather than only
-- answering when asked in chat.
--
-- Dedup is per (user, fixture) rather than a single watermark timestamp like
-- team_news_notified_at - a fixture has no publish-date-style ordering to
-- compare a watermark against, so "have we already told this user about this
-- fixture" has to be tracked per row instead.
create table value_edge_alerts_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  fixture_id text not null,
  sport text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, fixture_id)
);

-- Service-role only (a scheduled function, nobody signed in) - RLS enabled
-- with zero policies means anon/authenticated can't touch this table at all,
-- which is correct: there's no client-side reason to read or write it.
alter table value_edge_alerts_sent enable row level security;
