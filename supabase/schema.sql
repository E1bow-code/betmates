-- BetMates data model, matching the brief's Section 5 starting point.
-- Run this once in a new Supabase project (SQL Editor), then set
-- VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local - the app
-- switches from the localStorage mock (src/lib/localBackend.js) to these
-- tables automatically via src/lib/dataStore.js. No UI code changes needed.

create extension if not exists "pgcrypto";

-- One row per auth.users user; created at sign-up (see src/lib/dataStore.js).
-- Deliberately holds nothing sensitive - "signed-in users can read any
-- profile" below grants any authenticated user the whole row (needed for
-- the friend-code lookup, the public Feed's author names, follow buttons,
-- and every embedded profiles(...) join across dataStore.js), so anything
-- that shouldn't be that widely readable belongs on profile_private
-- instead, not here.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  bookmaker_prefs text[] not null default '{}',
  notification_prefs jsonb not null default '{"betPosted": true, "betActivity": true, "betSettled": true, "oddsMoved": false, "kickoffReminders": false}',
  friend_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  accepted_terms_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Split out of profiles (2026-08-26): email and date_of_birth were on the
-- broadly-readable table above, meaning any signed-in user could read
-- either for anyone via the API directly, not just through the app's own
-- UI (which never asked for them). Neither is actually read anywhere
-- except the owner's own session (src/lib/dataStore.js's getSession/
-- signUp/signIn) - email for AccountPage's display, date_of_birth for
-- nothing at all client-side, purely regulatory capture at signup - so a
-- separate owner-only table closes the leak without touching any of the
-- public profile reads above.
create table profile_private (
  id uuid primary key references profiles(id) on delete cascade,
  email text not null,
  date_of_birth date not null
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
  caption text, -- optional note the poster added at post time, shown on the card - not editable after posting
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
alter table profile_private enable row level security;
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
-- your own. Safe to grant the whole row now that profiles holds nothing
-- sensitive - see profile_private below for what isn't.
create policy "signed-in users can read any profile" on profiles for select using (auth.role() = 'authenticated');

create policy "read own private profile" on profile_private for select using (auth.uid() = id);
create policy "insert own private profile" on profile_private for insert with check (auth.uid() = id);

-- Members (including the creator, whose own group_members row lands a
-- moment after the groups insert via createGroup - see below) read their
-- own groups' full rows. Previously "any signed-in user can read any
-- group", which let anyone list every group's name/invite_code, not just
-- ones they're in - narrowed now that the code-lookup and discoverable-
-- browse cases below have their own dedicated, narrower paths.
create policy "members can read their own groups" on groups for select using (
  is_group_member(id, auth.uid()) or created_by = auth.uid()
);

-- SocialFeedPage.jsx's Discover segment needs to browse every group
-- flagged discoverable, not just ones the caller's already in - name and
-- price only, same intent as before, just scoped to the one column that
-- actually makes a group "discoverable" rather than every row.
create policy "signed-in users can browse discoverable groups" on groups for select using (
  is_discoverable = true
);

create policy "any signed-in user can create a group" on groups for insert with check (auth.uid() = created_by);
create policy "creator renames their group" on groups for update using (auth.uid() = created_by);

-- Narrow, code-gated alternative to the old blanket "read any group" -
-- JoinGroupPage.jsx previews a group (name/price) before deciding whether
-- to join or hit a paywall, for a group the caller isn't a member of yet
-- and that may not be discoverable at all (a private group's whole point).
-- security definer so it can read past the select policies above; the
-- gate is knowing the real invite_code, not blanket table access - this
-- is the fix for groups being enumerable by any signed-in user.
create or replace function get_group_preview_by_code(_code text)
returns groups
language sql
security definer
stable
set search_path = public
as $$
  select * from groups where invite_code ilike _code limit 1;
$$;
grant execute on function get_group_preview_by_code(text) to authenticated;

-- Replaces joinGroupByCode's old client-side "look the group up, then
-- insert membership" - group_members' own insert policy below has no way
-- to check a caller-supplied code against the group being joined (RLS
-- policies see the row being inserted, not an out-of-band string), so
-- that path never actually validated the code at the database level: any
-- signed-in user could add themselves to any free group by id, invite
-- code or not. This function is the real gate - security definer so it
-- can insert past group_members' policy too, having done its own check.
create or replace function join_group_by_code(_code text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  target groups;
begin
  select * into target from groups where invite_code ilike _code limit 1;
  if target.id is null then
    raise exception 'No group found with that invite code.';
  end if;

  if target.price_amount is not null and not exists (
    select 1 from group_subscriptions s
    where s.group_id = target.id and s.subscriber_id = auth.uid() and s.status in ('active', 'trialing')
  ) then
    raise exception 'This group needs an active subscription to join.';
  end if;

  insert into group_members (group_id, user_id) values (target.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return target;
end;
$$;
grant execute on function join_group_by_code(text) to authenticated;

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
-- with check also re-confirms group_id membership (not just ownership,
-- per the comment above) - without it, an author could repoint an open
-- post's group_id at a group they were never a member of, injecting it
-- into that group's feed via the "members read bet posts in their
-- groups" select policy above, which trusts group_id alone. Mirrors the
-- same membership check the insert policy already requires.
create policy "author updates own open bet post" on bet_posts for update using (
  auth.uid() = user_id and status = 'open'
) with check (
  auth.uid() = user_id and (group_id is null or is_group_member(group_id, auth.uid()))
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
create policy "user removes own comment" on bet_comments for delete using (auth.uid() = user_id);

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

-- Neither UPDATE policy above restricts which columns change, only that
-- the row is open and stays owned by the same user - same shape hole as
-- guard_premium_fields, but on `selections` instead of a Stripe field.
-- src/components/EditBetSheet.jsx never exposes editing selections/odds/
-- market ("a record of what was actually picked at the time, not
-- something to revise after the fact") - it's insert-time-only by
-- design, which makes locking it here zero legitimate-use cost. Without
-- this, a raw update to an OPEN bet's own selections (e.g. once the real
-- final score is already known) let the score-verified auto-settle path
-- - the "objective" backstop that isn't just self-reported - confirm a
-- fabricated result as a genuine, system-verified win.
create or replace function guard_locked_selections()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    new.selections := old.selections;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_locked_selections_on_bet_posts on bet_posts;
create trigger guard_locked_selections_on_bet_posts
  before update on bet_posts
  for each row execute function guard_locked_selections();

drop trigger if exists guard_locked_selections_on_manual_entries on manual_entries;
create trigger guard_locked_selections_on_manual_entries
  before update on manual_entries
  for each row execute function guard_locked_selections();

-- fixtures / odds_snapshots are public reference data cached by the
-- Netlify Function (netlify/functions/odds-snapshot.js) using the service
-- role key, so no RLS write policy is needed for anon clients; reads are open.
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

-- Deliberately the ONLY select policy - push_subscriptions holds raw Web
-- Push credentials (endpoint/keys), and every legitimate reader is a
-- Netlify Function on the service-role key (auto-settle.js,
-- alert-checks.js, send-push.js, etc.), which bypasses RLS entirely and
-- doesn't need a policy at all. send-push.js used to authenticate as the
-- poster's own token instead and relied on broader read policies here
-- (group-mates/friends/commenters/followers) to both fetch subscriptions
-- AND enforce the relationship - moved to service-role plus explicit
-- relationship checks in code, so those policies are gone rather than
-- narrowed.
create policy "user manages own push subscriptions" on push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
-- security definer for the same reason as is_group_member() above - a raw
-- subquery here would run under the SENDER's own RLS on blocks ("user
-- reads own blocks" = auth.uid() = blocker_id), so a sender who isn't the
-- blocker could never see the recipient's block row and the check below
-- would silently pass every time. Confirmed live: without this, a blocked
-- sender's message still went through.
create or replace function is_blocked_by(_blocker_id uuid, _blocked_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from blocks where blocker_id = _blocker_id and blocked_id = _blocked_id);
$$;

-- Messaging is deliberately open to anyone, not just friends (see
-- PublicProfilePage.jsx's Message button - clickable-profiles made this
-- reachable from any profile on purpose). What "Block" implies but didn't
-- actually enforce: the recipient having blocked the sender should stop
-- a new message landing, even though blocks were originally scoped to
-- just the public feed (see blocks table comment).
create policy "user sends direct messages as themselves" on direct_messages for insert with check (
  auth.uid() = sender_id
  and not is_blocked_by(recipient_id, sender_id)
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

-- --- Video tips --------------------------------------------------------
-- Storage bucket for video-tip clips (src/lib/dataStore.js's
-- uploadVideoBlob/getVideoPlaybackUrl). Unlike avatars, this is private:
-- video_posts already scopes row visibility to the author and their
-- friends ("author and friends read video posts" above), so a public
-- bucket would let anyone with a leaked/guessed URL watch a clip whose
-- metadata is otherwise friend-only. The select policy below mirrors that
-- same author-or-friend check, applied to the `${userId}/...` path
-- prefix instead of author_id. Playback goes through
-- supabase.storage.createSignedUrl(), which enforces this policy at
-- signing time - no separate signing function needed.

insert into storage.buckets (id, name, public) values ('videos', 'videos', false)
on conflict (id) do nothing;

create policy "author and friends read videos" on storage.objects for select using (
  bucket_id = 'videos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from friendships f
      where (f.user_a = auth.uid() and f.user_b::text = (storage.foldername(name))[1])
         or (f.user_b = auth.uid() and f.user_a::text = (storage.foldername(name))[1])
    )
  )
);
create policy "user uploads own video" on storage.objects for insert with check (
  bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "user deletes own video" on storage.objects for delete using (
  bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text
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

-- Denormalized count, kept in sync by a trigger (same shape as
-- sync_group_member_count above) - lets the referral tier badge
-- (src/utils/referralRewards.js) be shown cheaply wherever a member/author
-- list is already fetched (Leaderboard rows, the group Members list, a
-- public profile), not just computed on demand for the referrer's own
-- Account page via a COUNT query. Only incremented on insert - a referral
-- is credited once and, like every other badge/achievement in this app,
-- isn't clawed back later (e.g. if the person they referred later deletes
-- their own account).
alter table profiles add column if not exists referral_count integer not null default 0;

update profiles set referral_count = (select count(*) from profiles r where r.referred_by = profiles.id);

-- security definer for the same reason as sync_group_member_count: a
-- brand-new signer-upper's own INSERT needs to update someone ELSE's
-- profiles row (their referrer's), which "user updates own profile" would
-- otherwise block.
create or replace function sync_referral_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referred_by is not null then
    update profiles set referral_count = referral_count + 1 where id = new.referred_by;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_referral_count on profiles;
create trigger profiles_sync_referral_count
after insert on profiles
for each row execute function sync_referral_count();

-- --- Responsible gambling: spending limit -----------------------------
-- A self-set weekly/monthly stake cap (see src/pages/AccountPage.jsx and
-- src/components/BetBuilderSheet.jsx's soft warning nudge) - null/null means
-- no limit set. No new RLS policy needed: "update own profile" above
-- already covers these columns.

alter table profiles add column if not exists stake_limit_amount numeric;
alter table profiles add column if not exists stake_limit_period text check (stake_limit_period in ('weekly', 'monthly'));

-- --- Bankroll & staking plan ---------------------------------------------
-- A self-set bankroll figure plus a staking rule ({type: 'flat'|'percent',
-- value: number}) - see src/pages/AccountPage.jsx (editing),
-- src/components/BankrollChart.jsx (bankroll-over-time trajectory: starting
-- bankroll + cumulative settled P&L, same running-total approach as
-- PnlChart.jsx) and src/components/BetBuilderSheet.jsx's soft warning nudge
-- when a stake overshoots the plan. staking_rule stored as jsonb rather
-- than two flat columns since 'flat'/'percent' genuinely change what
-- `value` means (an amount vs a percentage) - a single tagged object keeps
-- that pairing atomic instead of two columns that could disagree. Both
-- null means no plan set - purely opt-in, never blocks logging a bet.
-- No new RLS policy needed: "update own profile" above already covers
-- these columns.
alter table profiles add column if not exists bankroll_amount numeric;
alter table profiles add column if not exists staking_rule jsonb;

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

-- Server-side 18+ enforcement. The signup UI (AuthPage) already blocks a DOB
-- under 18, but that guard is client-side only: a raw supabase.auth.signUp plus
-- a direct profile_private insert (or DevTools tampering with the date field)
-- could otherwise register an under-18 user, since date_of_birth is captured
-- but never re-validated. This rejects it at the database for the normal
-- anon/authenticated signup path. The service-role key (admin corrections,
-- migrations, backfills) is intentionally exempt - same convention as the other
-- guard_* triggers. Someone whose 18th birthday is today is allowed (the bound
-- is strict).
--
-- A missing DOB must not slip the gate: `null > (current_date - interval '18
-- years')` is NULL, not true, so the under-18 raise never fires on a null. So
-- on INSERT (the signup path) we require a DOB outright. That NULL check is
-- scoped to INSERT deliberately: an UPDATE of some unrelated field on a legacy
-- row that predates DOB capture must not suddenly hard-fail an existing user -
-- only new rows have to carry one. NOTE: this only takes effect once applied
-- to the live database.
create or replace function guard_min_age()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    -- new signups must carry a DOB (a null would otherwise bypass the age check)
    if tg_op = 'INSERT' and new.date_of_birth is null then
      raise exception 'A date of birth is required to use BetMates.' using errcode = 'check_violation';
    end if;
    -- reject under-18 on both insert and update (strict bound: 18 today is ok)
    if new.date_of_birth > (current_date - interval '18 years') then
      raise exception 'You must be 18 or older to use BetMates.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_min_age_on_profile_private on profile_private;
create trigger guard_min_age_on_profile_private
  before insert or update on profile_private
  for each row execute function guard_min_age();

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
-- with check re-confirms predictor_id still belongs to a group the user
-- is in, mirroring the insert policy above - without it, a user could
-- repoint their own entry's predictor_id at a predictor in a group they
-- were never a member of.
create policy "members update their own entry" on predictor_entries for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from predictors p where p.id = predictor_entries.predictor_id and is_group_member(p.group_id, auth.uid()))
);

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

-- The insert policy above is `with check (true)` on purpose - a crash on
-- AuthPage has no signed-in user to attribute it to, so unauthenticated
-- clients must still be able to log. That also means a script could spam the
-- table to bury real errors or bloat it unbounded. This trigger caps the
-- insert RATE from anon/authenticated callers (service_role is never limited)
-- and opportunistically trims old rows, so genuine logging is unaffected at
-- normal volumes while abuse can't run away. Excess inserts are dropped
-- silently (RETURN NULL) rather than raising - a logger must never itself
-- error. Same security-definer + pinned search_path shape as the guard_*
-- triggers above.
create index if not exists error_logs_created_at_idx on error_logs (created_at);

create or replace function guard_error_logs_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  if auth.role() in ('anon', 'authenticated') then
    select count(*) into recent from error_logs where created_at > now() - interval '1 minute';
    if recent >= 120 then
      return null;              -- over the per-minute cap: silently drop this insert
    end if;
  end if;
  -- Keep the table bounded without a per-insert scan: ~2% of inserts prune
  -- anything older than 30 days (admins read only recent errors anyway).
  if random() < 0.02 then
    delete from error_logs where created_at < now() - interval '30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_error_logs_rate_on_insert on error_logs;
create trigger guard_error_logs_rate_on_insert
  before insert on error_logs
  for each row execute function guard_error_logs_rate();

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

-- recommendation/result: which single grounded leg (if any) an assistant
-- reply actually leaned on (netlify/functions/coachgpt.js's
-- lock_in_recommendation tool, matched back to the full leg from
-- grounding) and how it settled - null/null until netlify/functions/
-- coach-settle.js resolves it. recommendation is legitimately client-
-- inserted (the real assistant reply's own recommendation, computed
-- server-side by coachgpt.js and persisted by the client via
-- addCoachMessage), so it isn't guarded - but result never legitimately
-- arrives with the insert (the comment above already says as much: null
-- until coach-settle.js resolves it later). "insert own coach messages"
-- has no column restriction beyond user_id, so a raw
-- `insert({ ..., result: 'won' })` bypassed the LLM AND coach-settle.js
-- entirely, forging an apparent win onto CoachGPT's own scoreboard -
-- guarded the same way as guard_is_admin/guard_premium_fields above.
alter table coach_messages add column if not exists recommendation jsonb;
alter table coach_messages add column if not exists result text check (result in ('won', 'lost', 'void'));

create or replace function guard_coach_message_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.result := null;
    else
      new.result := old.result;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_coach_message_result_on_coach_messages on coach_messages;
create trigger guard_coach_message_result_on_coach_messages
  before insert or update on coach_messages
  for each row execute function guard_coach_message_result();

-- session_id: groups turns into one conversation. CoachGptPage.jsx starts a
-- fresh uuid (stored client-side in localStorage) each time the user hits
-- "New chat" - older sessions aren't deleted, just no longer the active one,
-- so they stay reachable from the history sheet. Every pre-existing row
-- predates this column, so it's backfilled one generated uuid per user
-- (not per row - a bare `gen_random_uuid()` default re-evaluates per row on
-- backfill, which would explode every old message into its own 1-message
-- session) before being locked to not null. No new RLS policy needed: the
-- two policies above already cover every column on this table.
alter table coach_messages add column if not exists session_id uuid;

do $$
declare
  uid uuid;
  sid uuid;
begin
  for uid in select distinct user_id from coach_messages where session_id is null loop
    sid := gen_random_uuid();
    update coach_messages set session_id = sid where user_id = uid and session_id is null;
  end loop;
end $$;

alter table coach_messages alter column session_id set not null;
alter table coach_messages alter column session_id set default gen_random_uuid();
create index if not exists coach_messages_session_id_idx on coach_messages(session_id);
-- checkMessageAllowance (netlify/functions/coachgpt.js) runs a count on
-- (user_id, role, created_at) on EVERY CoachGPT message to meter the free
-- monthly limit; without this it's a sequential scan that worsens as the
-- table grows. Mirrors the coach_takes(user_id, created_at) index below.
create index if not exists coach_messages_user_role_created_idx on coach_messages(user_id, role, created_at);

-- Feed / membership hot-path indexes. These tables grow with every user and
-- are read on the busiest paths; only their primary keys were indexed, so the
-- queries below fall to sequential scans as rows accumulate under real load.
--  - group_members PK is (group_id, user_id), so "which groups is this user
--    in?" (leftmost = user_id) isn't covered - listMyGroups hits this per load.
--  - bet_posts feed reads filter by group_id (or public) ordered by created_at,
--    and a profile reads its own posts by user_id.
--  - direct_messages inbox/outbox read by recipient/sender, newest first.
create index if not exists group_members_user_id_idx on group_members(user_id);
create index if not exists bet_posts_group_created_idx on bet_posts(group_id, created_at desc);
create index if not exists bet_posts_user_created_idx on bet_posts(user_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx on direct_messages(recipient_id, created_at desc);
create index if not exists direct_messages_sender_created_idx on direct_messages(sender_id, created_at desc);

-- One row per generated "Coach's take" (netlify/functions/coach.js's
-- summary/bet/recap styles - Insights' page-level take, Tracker's per-bet
-- review, and a group's weekly recap) - unlike coach_messages above, this
-- endpoint never had a usage cap of its own. coach.js already required a
-- real signed-in session, but that alone is a weak deterrent (a free
-- signup is trivial to script), and confirmed live: nothing stopped an
-- authenticated caller from generating unlimited real Claude completions
-- against invented bet-shaped JSON, burning the same COACH_ANTHROPIC_KEY
-- budget coachgpt.js's FREE_MONTHLY_MESSAGE_LIMIT is trying to meter. This
-- table exists purely so coach.js can count "takes generated today" per
-- user and cap it - no client ever reads or displays these rows the way
-- coach_messages renders as a real chat history.
create table coach_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table coach_takes enable row level security;

create policy "user reads own coach take usage" on coach_takes for select using (
  auth.uid() = user_id
);
create policy "user inserts own coach take usage" on coach_takes for insert with check (
  auth.uid() = user_id
);

create index coach_takes_user_id_created_at_idx on coach_takes (user_id, created_at);

-- One row per day: CoachGPT's public "pick of the day" (netlify/functions/
-- coach-pick.js). Unlike coach_messages above, this is NOT tied to a user - it's
-- Coach's own standalone tipster record on real fixtures, the same for everyone,
-- so his hit rate genuinely grows over time whether or not anyone is chatting.
-- coach-pick.js writes the pick (a real lock_in_recommendation leg matched from
-- live grounding); coach-settle.js later fills `result` from real scores, the
-- exact same way it settles a user's coach_messages picks. `recommendation` has
-- the same event/market/selection/sport/eventId(-or-raceId+horseId)/odds shape a
-- real bet leg has, so evaluateLeg settles it unchanged. Writes are service-role
-- only (there is deliberately no anon/authenticated insert/update policy below),
-- which is what keeps `result` unforgeable - so this needs no guard trigger like
-- coach_messages does.
create table coach_daily_picks (
  id uuid primary key default gen_random_uuid(),
  pick_date date not null unique,            -- one pick per day; coach-pick.js's insert is idempotent on this
  sport text,
  reply text,                                -- Coach's written rationale for the pick
  recommendation jsonb not null,             -- the BetSlip-ready leg coach-settle.js evaluates
  result text check (result in ('won', 'lost', 'void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table coach_daily_picks enable row level security;
-- Public read: Coach's record is meant to be seen by everyone.
create policy "anyone can read coach daily picks" on coach_daily_picks for select using (true);
-- No insert/update policy: only the service-role scheduled functions write here.

create index coach_daily_picks_unsettled_idx on coach_daily_picks (created_at) where result is null;

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

-- --- Closing Line Value for racing --------------------------------------
-- netlify/functions/odds-snapshot.js now snapshots racing alongside every
-- other sport - a race is fixtures' "fixture" row, but a race has no home/
-- away side the way a two-team fixture does, so home_team/away_team can no
-- longer be required for every row. Nothing reads either column today
-- (dataStore.getClosingLines only selects id/kickoff), so this is a pure
-- constraint relaxation, not a data-shape change for existing rows.
alter table fixtures alter column home_team drop not null;
alter table fixtures alter column away_team drop not null;

-- --- Bet post captions ------------------------------------------------------
-- Optional note the poster adds at post time ("a few things they wanna say"),
-- shown on the card - not editable after posting (see EditBetSheet.jsx, which
-- deliberately doesn't let selections change after the fact either).
alter table bet_posts add column if not exists caption text;

-- --- Season leaderboards (monthly reset + archive) --------------------------
-- The "current" month leaderboard stays exactly what it's always been - a
-- live filter over bet_posts (Leaderboard.jsx's month tab, hall-of-fame.js's
-- monthTopProfit). This table is the missing other half: a PERMANENT record
-- of a month that's already finished, written once by
-- netlify/functions/season-rollover.js (00:00 UTC on the 1st) so a past
-- champion doesn't just quietly vanish when the rolling window moves on.
-- winner_name is snapshotted at rollover time rather than only ever joined
-- from profiles, so a past season's result stays intact even if the winner
-- later deletes their account - winner_user_id itself just goes null.
--
-- One row per (group, period) - enforced by a real unique constraint since
-- group_id is never null for a group-scope row. A global-scope row (the
-- whole app's public feed, group_id null) is deliberately NOT covered by
-- that constraint - Postgres treats NULLs as distinct, so it wouldn't stop
-- duplicates anyway - season-rollover.js instead checks for an existing
-- global row before writing one, which is simpler than fighting a partial
-- index through PostgREST's upsert for what's one row a month.
create table season_results (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'group')),
  group_id uuid references groups(id) on delete cascade,
  period text not null, -- 'YYYY-MM' for the calendar month that just finished
  winner_user_id uuid references profiles(id) on delete set null,
  winner_name text not null,
  profit numeric not null,
  roi numeric,
  win_rate numeric,
  settled_count integer not null,
  -- "Sharpest tipster" award: the month's #1 by average Closing Line Value
  -- (computeSeasonClvWinner in src/utils/groupLeaderboard.js), archived here at
  -- rollover because CLV can't be recomputed later once odds_snapshots age out.
  -- All nullable: a month with no qualifying CLV champion (nobody past the
  -- sample gate, or no recorded closing lines) simply carries none, and rows
  -- written before this award existed stay null too.
  clv_winner_user_id uuid references profiles(id) on delete set null,
  clv_winner_name text,
  clv_avg_pct numeric,
  clv_beat_rate numeric,
  clv_sample integer,
  created_at timestamptz not null default now(),
  check ((scope = 'group') = (group_id is not null)),
  unique (group_id, period)
);

alter table season_results enable row level security;

-- Group rows: members only, same rule as every other group-scoped table.
-- Global rows have no policy at all here on purpose - HallOfFamePage.jsx's
-- "Season champions" section reads them through
-- netlify/functions/hall-of-fame.js's existing service-role client (bypasses
-- RLS, same as every other record on that page) rather than opening a
-- second public-read policy for a single section. No insert/update/delete
-- policy either way - only season-rollover.js's service-role key writes
-- here, same pattern as auto-settle.js.
create policy "group members read their group's season results" on season_results for select using (
  scope = 'group' and is_group_member(group_id, auth.uid())
);

-- --- Head-to-head challenges -------------------------------------------
-- Turns HeadToHeadSheet.jsx's always-on, all-time comparison into a real,
-- time-boxed contest between two friends - pride-based, no real stakes.
-- Deliberately no status/accept column: this only ever scores bets already
-- visible to both parties under the exact same shared-groups-plus-public-
-- feed rule HeadToHeadSheet has always used, so a challenge can't expose
-- anything a plain "vs" comparison couldn't already show on demand - it's
-- just that comparison, timestamped and labelled. No cron either: unlike
-- season_results, a challenge already carries its own fixed starts_at/
-- ends_at, so ChallengeSection.jsx just recomputes live from those bounds
-- any time it's viewed, before or after the window closes - a bet that
-- settles a little late after ends_at still counts correctly instead of
-- being missed by a snapshot.
create table challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id) on delete cascade,
  opponent_id uuid not null references profiles(id) on delete cascade,
  metric text not null check (metric in ('profit', 'roi', 'pickem')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);

alter table challenges enable row level security;

create policy "participants read their challenges" on challenges for select using (
  auth.uid() = challenger_id or auth.uid() = opponent_id
);
-- Same inline friendship check push_subscriptions' read policy above uses -
-- no separate is_friend() helper exists in this schema, so this matches
-- that established shape rather than introducing a new one.
create policy "user starts a challenge against a real friend" on challenges for insert with check (
  auth.uid() = challenger_id and exists (
    select 1 from friendships f
    where (f.user_a = auth.uid() and f.user_b = opponent_id) or (f.user_b = auth.uid() and f.user_a = opponent_id)
  )
);

-- --- Daily streak + XP progression ------------------------------------
-- A DIFFERENT streak from src/utils/trackerStats.js's computeStreak (which
-- counts consecutive WINS and already has its own 3/5/10 push in
-- streak-reminders.js) - this one counts consecutive CALENDAR DAYS with at
-- least one bet logged (src/utils/dailyStreak.js), the "open the app today"
-- habit loop rather than a betting result.
--
-- streak_current_count/streak_last_logged_date are the authoritative,
-- persisted state (not re-derived from bet_posts/manual_entries on every
-- read) because a freeze-bridged gap has a real missing day in that raw
-- data that a pure re-derivation would otherwise read as a broken streak.
-- streak_freezes_used is spend against freezesGranted() (src/utils/
-- dailyStreak.js), which is time-based off profiles.created_at rather than
-- XP/level-based - tying freeze eligibility to a live XP recompute would
-- mean re-deriving a user's entire bet history on every single bet save
-- just to check it, which is a real cost for no real benefit here.
--
-- XP/levels themselves (src/utils/xp.js) stay fully derived at read time
-- from existing bet_posts/manual_entries/referred_by data, same as
-- src/utils/achievements.js already does - no column needed for those.
--
-- No new RLS policy: "user updates own profile" already covers new columns
-- on an existing table.
alter table profiles add column if not exists streak_current_count integer not null default 0;
alter table profiles add column if not exists streak_last_logged_date date;
alter table profiles add column if not exists streak_freezes_used integer not null default 0;

-- Watermark for netlify/functions/streak-reminders.js's daily "keep your
-- streak alive" push (reuses that function's existing */30 * * * * cron
-- slot rather than adding a new schedule entry) - sent at most once per
-- calendar date per user, same one-shot-per-value idea as
-- streak_milestone_notified above.
alter table profiles add column if not exists streak_reminder_sent_date date;

-- Watermark for netlify/functions/weekly-recap.js - every other scheduled
-- push here has one of these (team_news_notified_at, streak_reminder_
-- sent_date, kickoff_reminder_sent_at) specifically so a second
-- invocation in the same window can't double-send; weekly-recap.js never
-- had one, so simply calling its public URL twice (it has no caller auth
-- at all, same as its siblings) fanned out a full duplicate push to
-- every opted-in user with a settled bet that week, each time. No new
-- RLS policy: "user updates own profile" already covers this.
alter table profiles add column if not exists weekly_recap_sent_at timestamptz;

-- Watermark for netlify/functions/weekly-leaderboard-email.js, exactly like
-- weekly_recap_sent_at above and for the same reason: that Monday email job
-- shipped with NO send-dedup, so an at-least-once redelivery (or a manual hit
-- of its unauthenticated URL) re-sent every opted-in member's leaderboard
-- email in full. The function now skips a member emailed within the last 6
-- days and stamps this on a successful send. Covered by "user updates own
-- profile"; nothing here runs until the column exists, so applying this is
-- what turns the guard on.
alter table profiles add column if not exists weekly_leaderboard_email_sent_at timestamptz;

-- --- Group tournaments -------------------------------------------------
-- A seasonal mini-league scoped to one group, ranking every member (not
-- just two, unlike the `challenges` 1v1 above) by profit or ROI over the
-- tournament's own fixed [starts_at, ends_at] window. Same "no cron"
-- reasoning as challenges: the window is stored on the row itself, so
-- src/utils/groupTournament.js just recomputes standings live from
-- bet_posts any time it's viewed, before or after ends_at, rather than
-- snapshotting a result the way season_results does - a bet that settles
-- a little late still counts instead of being missed by a snapshot.
-- Starting one is a group-admin action, same "creator only" rule already
-- used for renaming a group / removing a member.
create table group_tournaments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  metric text not null check (metric in ('profit', 'roi')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table group_tournaments enable row level security;

create policy "group members read their group's tournaments" on group_tournaments for select using (
  is_group_member(group_id, auth.uid())
);
create policy "group creator starts a tournament" on group_tournaments for insert with check (
  auth.uid() = created_by and exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
);

-- --- Self-exclusion / cooling-off (P2-O) ---------------------------------
-- The existing stake_limit_amount above is a self-set cap on what someone
-- LOGS as staked - a nudge, never a block. This is the harder tool: a
-- binding, timed lockout of the app itself, the in-app equivalent of real
-- self-exclusion schemes (GAMSTOP etc.). "update own profile" below has no
-- with check, so a plain column add would let a raw API call shorten or
-- clear this early and defeat the entire point - guarded the same way
-- is_admin already is (guard_is_admin/guard_is_admin_on_profiles above):
-- a trigger that only lets requests arriving as anon/authenticated extend
-- an ACTIVE exclusion further out, never pull it earlier or null it while
-- still in the future. Once it naturally expires the guard no longer
-- applies, so a lifted exclusion can be freely re-set.
alter table profiles add column if not exists self_exclusion_until timestamptz;

create or replace function guard_self_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if old.self_exclusion_until is not null and old.self_exclusion_until > now()
       and (new.self_exclusion_until is null or new.self_exclusion_until < old.self_exclusion_until) then
      new.self_exclusion_until := old.self_exclusion_until;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_self_exclusion_on_profiles on profiles;
create trigger guard_self_exclusion_on_profiles
  before update on profiles
  for each row execute function guard_self_exclusion();

-- --- Automated moderation (P2-O) ------------------------------------------
-- Reports were manual-review-only (AdminReportsPage) until now - a post
-- could sit fully visible on the public feed indefinitely if an admin
-- hadn't happened to check the queue. Once a post crosses a report
-- threshold from distinct reporters it's auto-hidden from public reads
-- pending that review - not deleted, and still visible to its own author
-- (with a "pending review" note client-side) and to admins, just not to
-- everyone else. dismissReportsForPost (src/lib/dataStore.js) clears this
-- back to false when an admin reviews and keeps the post.
alter table bet_posts add column if not exists auto_hidden boolean not null default false;

create or replace function auto_hide_reported_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(distinct reporter_id) from post_reports where post_id = new.post_id) >= 3 then
    update bet_posts set auto_hidden = true where id = new.post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists post_reports_auto_hide on post_reports;
create trigger post_reports_auto_hide
  after insert on post_reports
  for each row execute function auto_hide_reported_post();

-- Replaces the original public-read policy: still anyone-signed-in for a
-- visible post, but an auto_hidden one is only readable by its own author
-- or an admin, not the general public. Group-visibility reads (the
-- separate "members read bet posts in their groups" policy) are untouched -
-- auto-hide is a public-feed-only concept, since a group's own members
-- already chose to be around each other and have their own block/leave
-- tools.
drop policy if exists "anyone signed in can read public bet posts" on bet_posts;
create policy "anyone signed in can read public bet posts" on bet_posts for select using (
  visibility = 'public' and (
    not auto_hidden
    or auth.uid() = user_id
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  )
);

-- Admin-only - needed so dismissReportsForPost can clear auto_hidden back
-- to false after review (the existing "author updates own open bet post"
-- policy only covers the author, and only while status = 'open').
create policy "admins restore auto-hidden posts" on bet_posts for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);

-- --- BetMates Plus / Stripe subscriptions (P2-M) --------------------------
-- Free stays the full tracker/social/groups/leaderboard experience -
-- Plus (£2.99/mo or £24.99/yr) gates two things: CoachGPT beyond a small
-- free monthly allowance (netlify/functions/coachgpt.js - the one feature
-- with a real per-message Anthropic cost) and the "for people who take
-- this seriously" analytics layer (CLV leaderboard, sharp-money indicator,
-- crowd wisdom calibration, bad beats, money-left-on-the-table, discipline
-- streak, cash-out replay, Kelly staking calculator) which costs nothing
-- extra to serve but is real premium value.
--
-- Same problem as self_exclusion_until: "update own profile" has no with
-- check, so a plain column add would let a raw API call self-grant
-- premium for free. Guarded the same way (guard_is_admin/
-- guard_self_exclusion above) - only requests NOT arriving as
-- anon/authenticated can write these, which in practice means only
-- stripe-webhook.js (service role, driven by a Stripe-signed event) and
-- create-checkout-session.js (service role, to stash the Stripe customer
-- id) ever touch them.
alter table profiles add column if not exists is_premium boolean not null default false;
alter table profiles add column if not exists premium_until timestamptz;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
-- Raw Stripe subscription status ('trialing', 'active', ...), synced
-- alongside is_premium/premium_until by stripe-webhook.js. is_premium alone
-- can't tell a free trial apart from a paid renewal (both count as active
-- access), which alert-checks.js's runTrialReminders needs to know so it
-- doesn't send "your trial ends" copy to someone who's already paying.
-- trial_reminder_sent_at is that check's own watermark, same
-- kickoff_reminder_sent_at pattern used elsewhere in that file - it only
-- fires once per trial since a trial only ever ends once.
alter table profiles add column if not exists premium_status text;
alter table profiles add column if not exists trial_reminder_sent_at timestamptz;

-- Was `before update` only (no insert branch) - guard_is_admin's own
-- comment right above explains exactly why that's a hole ("The insert
-- policy has the same hole at sign-up time"), but this trigger was
-- written without the INSERT case that comment warns about: a fresh
-- `supabase.from('profiles').insert({ ...normal signup fields...,
-- is_premium: true })` at account-creation time never touched this
-- trigger at all (wrong `before update` registration below) AND the
-- function itself had no `tg_op = 'INSERT'` branch to null these fields
-- out even if it had fired - free permanent Plus, no Stripe involved.
-- Confirmed live via a real WCAG-style audit of this file, not
-- eyeballed. Fixed the same way guard_is_admin already does it: false/
-- null on insert, hold the previous value on update.
create or replace function guard_premium_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_premium := false;
      new.premium_until := null;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.premium_status := null;
      new.trial_reminder_sent_at := null;
    else
      new.is_premium := old.is_premium;
      new.premium_until := old.premium_until;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.premium_status := old.premium_status;
      new.trial_reminder_sent_at := old.trial_reminder_sent_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_premium_fields_on_profiles on profiles;
create trigger guard_premium_fields_on_profiles
  before insert or update on profiles
  for each row execute function guard_premium_fields();

-- --- Post photos -------------------------------------------------------
-- Optional photo attachment on a bet_posts row (src/lib/dataStore.js's
-- uploadPostPhoto/getPostPhotoUrl) - Home's Facebook-style "share a pick"
-- composer can attach one alongside the caption. Same private-bucket-plus-
-- signed-URL approach as the videos bucket above, but the select policy
-- mirrors bet_posts' own two-tier visibility (public vs. group-only)
-- directly against photo_url, rather than videos' simpler author-or-friend
-- check - a group pick's photo needs to stay exactly as private as the
-- pick itself.

alter table bet_posts add column if not exists photo_url text;

insert into storage.buckets (id, name, public) values ('post-photos', 'post-photos', false)
on conflict (id) do nothing;

create policy "read post photos per bet_posts visibility" on storage.objects for select using (
  bucket_id = 'post-photos' and exists (
    select 1 from bet_posts p
    where p.photo_url = name
      and (
        p.visibility = 'public'
        or exists (select 1 from group_members m where m.group_id = p.group_id and m.user_id = auth.uid())
      )
  )
);
create policy "user uploads own post photo" on storage.objects for insert with check (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "user deletes own post photo" on storage.objects for delete using (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- --- Post tags, video attachments, and pick-less posts ------------------
-- tag: optional Reddit-style flair (src/lib/postTags.js's fixed list -
-- "Racing tip", "Value bet", etc.), same free-text-but-app-constrained
-- shape as caption.
--
-- video_url: same idea as photo_url immediately above - a second optional
-- attachment type, mutually exclusive with photo_url in practice (the
-- composer only lets you attach one media item), same private-bucket-
-- plus-signed-URL approach via a dedicated post-videos bucket rather than
-- the existing `videos` bucket above, because that one is deliberately
-- friend-scoped for the separate Tips video feed - a bet_posts row needs
-- the group/public visibility check instead, same as post-photos.
--
-- sport/market_type/selections stay NOT NULL (dropping that would ripple
-- into every place that already assumes a bet_posts row is a real pick -
-- settlement.js, trackerStats.js, achievements.js, csvExport.js, the
-- Insights per-sport breakdown). A pick-less post (just text/photo/video)
-- instead writes the sentinel sport='post', market_type='Post',
-- selections='[]' - it never matches any settlement candidate (nothing to
-- iterate), never resolves off 'open', and reads exactly like the
-- existing "free pick, no stake" case every other stat already handles.
alter table bet_posts add column if not exists tag text;
alter table bet_posts add column if not exists video_url text;

insert into storage.buckets (id, name, public) values ('post-videos', 'post-videos', false)
on conflict (id) do nothing;

create policy "read post videos per bet_posts visibility" on storage.objects for select using (
  bucket_id = 'post-videos' and exists (
    select 1 from bet_posts p
    where p.video_url = name
      and (
        p.visibility = 'public'
        or exists (select 1 from group_members m where m.group_id = p.group_id and m.user_id = auth.uid())
      )
  )
);
create policy "user uploads own post video" on storage.objects for insert with check (
  bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "user deletes own post video" on storage.objects for delete using (
  bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- --- Paid tipster groups (Stripe Connect) --------------------------------
-- price_amount/price_currency are ordinary owner-settable fields, already
-- covered by the existing "creator renames their group" update policy
-- (row-scoped to created_by = auth.uid(), no column restriction) - only
-- the two Stripe-derived columns below need guarding, same reasoning as
-- guard_premium_fields above: "update own group" has no with check, so a
-- plain column add would let a raw API call self-grant a fake connected
-- account / charges-enabled flag. Only stripe-connect-onboarding.js
-- (service role, to stash the account id) and stripe-webhook.js (service
-- role, driven by a Stripe-signed account.updated event) ever touch these.
alter table groups add column if not exists price_amount numeric;
alter table groups add column if not exists price_currency text not null default 'gbp';
alter table groups add column if not exists stripe_connect_account_id text;
alter table groups add column if not exists stripe_connect_charges_enabled boolean not null default false;

-- Same "before update only, no insert branch" hole guard_premium_fields
-- had - "any signed-in user can create a group" has no column
-- restriction, so `insert({ ..., stripe_connect_charges_enabled: true })`
-- at group-creation time went straight through unguarded.
create or replace function guard_group_connect_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.stripe_connect_account_id := null;
      new.stripe_connect_charges_enabled := false;
    else
      new.stripe_connect_account_id := old.stripe_connect_account_id;
      new.stripe_connect_charges_enabled := old.stripe_connect_charges_enabled;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_connect_fields_on_groups on groups;
create trigger guard_group_connect_fields_on_groups
  before insert or update on groups
  for each row execute function guard_group_connect_fields();

-- One row per active-or-lapsed paid membership. season_results-shaped:
-- select-only for client roles, no insert/update/delete policy at all -
-- the only writer is stripe-webhook.js's service-role client, driven by
-- Stripe-signed subscription events. Destination charges (see
-- create-group-checkout-session.js) keep the Customer/Subscription on the
-- platform account, so this is synced from the same webhook endpoint
-- Plus already uses, not a separate Connect-specific one.
create table group_subscriptions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  subscriber_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text not null,
  stripe_customer_id text not null,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  -- Watermark for alert-checks.js's runGroupRenewalReminders - stores WHICH
  -- current_period_end the reminder already covered, not just a sent-at
  -- flag, since a subscription (unlike a one-off trial) renews every month:
  -- current_period_end advances on each renewal sync, so comparing against
  -- it resets the reminder automatically each cycle with no separate job
  -- needed to clear it - same self-resetting idea as limit_alert_sent_at's
  -- comparison against periodStart() below.
  renewal_reminder_for_period_end timestamptz,
  unique (group_id, subscriber_id)
);
alter table group_subscriptions enable row level security;
create policy "subscriber reads own subscription" on group_subscriptions for select using (auth.uid() = subscriber_id);
create policy "group owner reads their group's subscriptions" on group_subscriptions for select using (
  exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
);

-- Tightened twice now: first from the original unconditional "any
-- signed-in user can add themselves" to require an active subscription
-- for a paid group (service-role inserts - the webhook, after a
-- successful checkout - bypass RLS entirely, so this only ever blocked a
-- client trying to skip payment by calling the insert directly). Second
-- tightening here: the paid-group check alone still let anyone add
-- themselves to any FREE group by id, invite code or not, since nothing
-- checked they were the creator or the group was actually discoverable -
-- a real invite-code-only group gave zero real protection at the
-- database level. Direct self-insert now only covers the two genuinely
-- code-less cases (creating your own group, joining a discoverable one);
-- a private group by code goes through join_group_by_code() above
-- instead, which is the only path that actually validates the code.
drop policy if exists "user joins a group as themselves" on group_members;
create policy "user joins a group as themselves" on group_members for insert with check (
  auth.uid() = user_id
  and (
    exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
    or exists (select 1 from groups g where g.id = group_id and g.is_discoverable = true)
  )
  and (
    not exists (select 1 from groups g where g.id = group_id and g.price_amount is not null)
    or exists (
      select 1 from group_subscriptions s
      where s.group_id = group_members.group_id and s.subscriber_id = auth.uid() and s.status in ('active', 'trialing')
    )
  )
);

-- --- Own-the-serving-layer odds cache ---------------------------------------
-- The durable backing store for BetMates' own football-odds API. Distinct from
-- the fixtures/odds_snapshots pair above: those are a NORMALISED price history
-- (one thin row per bookmaker/selection/time) that feeds CLV and sharp-money
-- analysis. THIS table is a SERVING cache - one row holds a whole
-- already-assembled proxy response (the reshaped { id, homeTeam, ..., markets }
-- list) as jsonb, so netlify/functions/odds.js can answer a user's bulk-list
-- request with a single primary-key read instead of 5 live Odds API calls.
-- It's the durable, cross-instance successor to src/lib/apiCache.js's
-- in-memory map.
--
-- cache_key is the logical response name - 'football-list' (odds-ingest.js),
-- 'ufc-list' (ufc-ingest.js) and 'sport-list-<sport>' per generic sport
-- (sport-ingest.js) today, with room for per-fixture detail etc. as more of
-- the board moves off live fetches. Written only by those service-role crons.
create table odds_cache (
  cache_key text primary key,
  sport text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Public read like fixtures/odds_snapshots (it's cached public reference data,
-- and the proxy reads it with the anon key). No insert/update policy on
-- purpose: with RLS enabled that means anon/authenticated can't write it at
-- all, so only the service-role ingest cron can - exactly the access split we
-- want for a table users consume but never author.
alter table odds_cache enable row level security;
create policy "anyone can read odds cache" on odds_cache for select using (true);

-- Durable, cross-instance cache for netlify/functions/scores.js, the same idea
-- as odds_cache but WRITE-THROUGH rather than cron-filled: /api/scores is hit
-- on demand (live-score polling, the settle/alert crons, the Results tab) with
-- no ingest job in front of it, so src/lib/apiCache.js's per-warm-instance map
-- was the only cache - and it's empty on every cold start, so concurrent
-- instances each re-fetch and multiply Odds API / SportsGameOdds credits. This
-- table lets the first fetch of a key serve every other instance until it
-- expires. cache_key mirrors apiCache's keys (scores-<sportKey>,
-- scores-live-<sportKey>, scores-sgo-*, scores-sgo-league-<league>). expires_at
-- (not fetched_at) because live vs completed rows carry very different TTLs.
-- Written by scores.js with the service-role key; a stale row past expires_at
-- is simply ignored, and old rows are harmless (overwritten on next fetch).
create table scores_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
alter table scores_cache enable row level security;
create policy "anyone can read scores cache" on scores_cache for select using (true);

-- Durable, cross-instance cache for netlify/functions/odds.js's per-fixture
-- DETAIL (player props + extra markets) - the same WRITE-THROUGH idea as
-- scores_cache. odds_cache above is the CRON-filled BULK-LIST tier and
-- deliberately does NOT cover detail: 2 Odds API credits per fixture is far too
-- expensive to pre-fetch for the whole board on a schedule. But the in-memory
-- map in odds.js is per-warm-instance and empty on every cold start, so under
-- real traffic the same popular fixture re-spent its 2 credits on each cold or
-- concurrent instance - the uncapped Odds API spend the bulk-list cron can't
-- reach. This table lets the FIRST open of a fixture pay the 2 credits and write
-- the enriched result; every other instance serves it from the DB until it
-- expires. Written by odds.js with the service-role key (public read policy, no
-- anon write - same split as odds_cache/scores_cache). expires_at (like
-- scores_cache, not fetched_at) since detail carries its own TTL. odds.js no-ops
-- this whole path when Supabase/service-role isn't configured and fails every DB
-- call soft to a miss, so a keyless/local deploy behaves exactly as before.
create table odds_detail_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
alter table odds_detail_cache enable row level security;
create policy "anyone can read odds detail cache" on odds_detail_cache for select using (true);

-- Global daily LLM spend breaker (see src/lib/llmBudget.js). A soft safety
-- valve on TOP of each endpoint's per-user caps: it bounds total model calls
-- across ALL users per UTC day so a runaway - a scripted flood of free
-- signups, a bug in a loop - can't run the Anthropic bill unbounded. Counts in
-- "call-units": each request bumps by its worst-case number of model calls
-- (a CoachGPT chat message can fan out to several; a passive Coach take is
-- one). One row per day.
create table llm_budget (
  day date primary key,
  calls integer not null default 0
);
alter table llm_budget enable row level security;
-- No select/insert/update policy on purpose: with RLS on, anon/authenticated
-- can neither read nor write it directly - only the security-definer RPC below
-- (and the service role) touch it, so a client can't read or forge the tally.

-- Atomically add _n call-units to today's row and report whether the running
-- total is still within _max. Security definer so a user-token client may call
-- it without a direct table grant. Returns true when the call is within budget
-- (allow), false once the cap is exceeded (block). A blocked call still counts,
-- which only makes the breaker slightly conservative - blocked calls cost no
-- tokens anyway.
create or replace function bump_llm_budget(_max integer, _n integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare _calls integer;
begin
  insert into llm_budget (day, calls) values (current_date, _n)
  on conflict (day) do update set calls = llm_budget.calls + _n
  returning calls into _calls;
  return _calls <= _max;
end;
$$;
-- authenticated only, NOT anon: the breaker is only ever called by a
-- signed-in client (coach.js / coachgpt.js reach it with a valid user token),
-- and granting anon would let an unauthenticated caller flood it to inflate the
-- daily tally and trip the breaker for everyone - a DoS on the LLM features.
grant execute on function bump_llm_budget(integer, integer) to authenticated;

-- --- Coco: daily social-post proposals ------------------------------------
-- netlify/functions/social-propose.js drafts a promo post from real BetMates
-- data (src/lib/socialDraft.js) and stores it here as 'pending', then posts it
-- to Discord with Approve/Reject buttons via the bot. discord-interactions.js
-- flips the row on a button click and, on approve, publishes it to X
-- (src/lib/xClient.js), writing back the tweet id. Only the service-role
-- scheduled / interactions functions write here; a public admin read lets an
-- operator screen show the queue if wanted. Nothing here fires unless the
-- Discord + X credentials are configured (see docs/social-agent-setup.md) -
-- same "missing keys degrade, don't crash" contract as the rest of the app.
create table social_posts (
  id uuid primary key default gen_random_uuid(),
  body text not null,                          -- the drafted post text
  platform text not null default 'x',          -- where an approved post publishes
  status text not null default 'pending'       -- pending -> approved|rejected -> posted|failed
    check (status in ('pending', 'approved', 'rejected', 'posted', 'failed')),
  external_id text,                            -- the published tweet id, once posted
  error text,                                  -- publish error message, if status = 'failed'
  discord_message_id text,                     -- the Discord message carrying the buttons
  created_at timestamptz not null default now(),
  decided_at timestamptz,                      -- when approved / rejected
  posted_at timestamptz                        -- when published
);

alter table social_posts enable row level security;
-- Admin-only read (the operator's content queue); every write is service-role.
create policy "admins read social posts" on social_posts for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);

create index social_posts_pending_idx on social_posts (created_at) where status = 'pending';
