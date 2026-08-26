-- Fixes a gap in 2026-08-25_base_schema.sql: the photos table's SELECT policy only
-- allowed a user to read their OWN photos, so listFriendsFeed's query for friends'
-- Failure Card photos (src/services/home-feed.ts) was silently filtered down to zero
-- rows by RLS -- no error, the Home feed just showed nothing. comments and
-- photo_realmojis already had the equivalent friends-can-read policy; photos itself did
-- not.

drop policy if exists "Friends can read each other's photos" on public.photos;
create policy "Friends can read each other's photos"
on public.photos for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.friends_relations relation
    where
      (relation.profile_id = auth.uid() and relation.friend_profile_id = photos.profile_id)
      or
      (relation.friend_profile_id = auth.uid() and relation.profile_id = photos.profile_id)
  )
);
