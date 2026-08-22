-- Profile Icon Photos: lets a user set a custom photo (instead of one of the 8 preset
-- icons) as their profile icon. See docs/database_design.md for the app-level contract:
-- profiles.icon_url already stores either a preset identifier or a full photo URL.
--
-- Mirrors the existing `failure-photos` bucket's shape (public bucket, path scoped by
-- Auth User ID) documented in docs/database_design.md.

insert into storage.buckets (id, name, public)
values ('profile-icon-photos', 'profile-icon-photos', true)
on conflict (id) do nothing;

-- Anyone can view profile icon photos (friends need to see them in the feed, friend
-- search, etc.), matching the public-read shape of failure-photos.
create policy "Profile icon photos are publicly readable"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-icon-photos');

-- A user may only write under a path prefixed by their own Auth User ID
-- (see uploadProfileIconPhoto in src/services/profile-icon-photo.ts: `${profileId}/icon.jpg`).
create policy "Users can upload their own profile icon photo"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-icon-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can replace their own profile icon photo"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-icon-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-icon-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
