-- Face-photo RealMojis are intentionally separate from the existing emoji-only
-- photo_reactions table. The app can move back to the old reaction experiment without
-- destroying its rows, while this branch reads and writes only photo_realmojis.

create table if not exists public.photo_realmojis (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('😂', '🤣', '😏', '🙄', '😜', '🥱')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photo_id, profile_id)
);

alter table public.photo_realmojis enable row level security;

drop policy if exists "Friends can read photo RealMojis" on public.photo_realmojis;
create policy "Friends can read photo RealMojis"
on public.photo_realmojis for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.photos photo
    where photo.id = photo_id
      and (
        photo.profile_id = auth.uid()
        or exists (
          select 1
          from public.friends_relations relation
          where
            (relation.profile_id = auth.uid() and relation.friend_profile_id = photo.profile_id)
            or
            (relation.friend_profile_id = auth.uid() and relation.profile_id = photo.profile_id)
        )
      )
  )
);

drop policy if exists "Users can add their own photo RealMoji" on public.photo_realmojis;
create policy "Users can add their own photo RealMoji"
on public.photo_realmojis for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.photos photo
    where photo.id = photo_id
      and photo.profile_id <> auth.uid()
      and exists (
        select 1
        from public.friends_relations relation
        where
          (relation.profile_id = auth.uid() and relation.friend_profile_id = photo.profile_id)
          or
          (relation.friend_profile_id = auth.uid() and relation.profile_id = photo.profile_id)
      )
  )
);

drop policy if exists "Users can change their own photo RealMoji" on public.photo_realmojis;
create policy "Users can change their own photo RealMoji"
on public.photo_realmojis for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "Users can remove their own photo RealMoji" on public.photo_realmojis;
create policy "Users can remove their own photo RealMoji"
on public.photo_realmojis for delete
to authenticated
using (profile_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('realmoji-photos', 'realmoji-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can upload their own RealMoji photos" on storage.objects;
create policy "Users can upload their own RealMoji photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'realmoji-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Friends can read RealMoji photos" on storage.objects;
create policy "Friends can read RealMoji photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'realmoji-photos'
  and exists (
    select 1
    from public.photo_realmojis realmoji
    join public.photos photo on photo.id = realmoji.photo_id
    where realmoji.storage_path = name
      and (
        realmoji.profile_id = auth.uid()
        or photo.profile_id = auth.uid()
        or exists (
          select 1
          from public.friends_relations relation
          where
            (relation.profile_id = auth.uid() and relation.friend_profile_id = photo.profile_id)
            or
            (relation.friend_profile_id = auth.uid() and relation.profile_id = photo.profile_id)
        )
      )
  )
);

drop policy if exists "Users can delete their own RealMoji photos" on storage.objects;
create policy "Users can delete their own RealMoji photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'realmoji-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
