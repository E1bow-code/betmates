-- Post photo/video storage - apply this to the LIVE Supabase project if
-- uploaded post images/videos don't show up in the feed.
--
-- These buckets and policies already exist in schema.sql, but (per the
-- project's own rule) editing schema.sql does nothing until it's applied to
-- the live database. If posts you attach a photo/video to come back with no
-- image, it's almost always because this block was never run against prod:
-- the app uploads to the `post-photos` / `post-videos` buckets and reads them
-- back through a signed URL, and neither works until the bucket + RLS policies
-- exist here.
--
-- Safe to re-run: buckets use ON CONFLICT DO NOTHING, and each policy is
-- dropped-if-exists before being recreated. Run it in the Supabase dashboard:
-- SQL Editor -> paste -> Run.

-- ---- Photos ----------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('post-photos', 'post-photos', false)
on conflict (id) do nothing;

drop policy if exists "read post photos per bet_posts visibility" on storage.objects;
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

drop policy if exists "user uploads own post photo" on storage.objects;
create policy "user uploads own post photo" on storage.objects for insert with check (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user deletes own post photo" on storage.objects;
create policy "user deletes own post photo" on storage.objects for delete using (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---- Videos ----------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('post-videos', 'post-videos', false)
on conflict (id) do nothing;

drop policy if exists "read post videos per bet_posts visibility" on storage.objects;
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

drop policy if exists "user uploads own post video" on storage.objects;
create policy "user uploads own post video" on storage.objects for insert with check (
  bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user deletes own post video" on storage.objects;
create policy "user deletes own post video" on storage.objects for delete using (
  bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text
);
