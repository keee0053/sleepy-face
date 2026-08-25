-- Base schema: reconstructed from docs/database_design.md and docs/api_contract.md for
-- a fresh personal Supabase project (the original team project's schema was created by
-- hand through the dashboard, so there was never a committed migration for it). Apply
-- this FIRST, before any of the other files in this directory, which all assume
-- profiles/photos/friends_relations already exist.

-- profiles: one row per authenticated app user, id = the Auth User ID.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  user_id varchar not null unique,
  display_name varchar not null,
  icon_url varchar not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "Users can insert their own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

-- The MVP docs originally said Profiles were immutable, but the Profile screen's edit
-- flow (src/services/user.ts updateProfile) does a direct `.from('profiles').update()`
-- for display_name/icon_url, so this policy must exist for that to work at all.
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- photos: simple image records associated with a profile (not the final Failure Card
-- model -- see docs/database_design.md).
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  image_url varchar,
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;

create policy "Users can read their own photos"
on public.photos for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can insert their own photos"
on public.photos for insert
to authenticated
with check (profile_id = auth.uid());

-- friends_relations: directional friend relation rows between profiles.
create table if not exists public.friends_relations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  friend_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint friends_relations_not_self check (profile_id <> friend_profile_id),
  unique (profile_id, friend_profile_id)
);

alter table public.friends_relations enable row level security;

create policy "Users can read their own friend relations"
on public.friends_relations for select
to authenticated
using (profile_id = auth.uid() or friend_profile_id = auth.uid());

create policy "Users can insert their own friend relations"
on public.friends_relations for insert
to authenticated
with check (profile_id = auth.uid());

-- push_tokens: Expo push tokens for notification delivery, upserted by token (see
-- src/services/push-token.ts) since a token identifies an app install, not a profile.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "Users can read their own push tokens"
on public.push_tokens for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can upsert their own push tokens"
on public.push_tokens for insert
to authenticated
with check (profile_id = auth.uid());

create policy "Users can reassign a push token to themselves"
on public.push_tokens for update
to authenticated
using (true)
with check (profile_id = auth.uid());

-- failure-photos Storage: captured wake-up-challenge photos, public bucket, path scoped
-- by Auth User ID (see storagePath in src/services/wakeChallenge.ts: `${profileId}/...`).
insert into storage.buckets (id, name, public)
values ('failure-photos', 'failure-photos', true)
on conflict (id) do nothing;

create policy "Failure photos are publicly readable"
on storage.objects for select
to authenticated
using (bucket_id = 'failure-photos');

create policy "Users can upload their own failure photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'failure-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- create_profile RPC: completes Initial Setup. See docs/api_contract.md for the full
-- request/response contract and error codes.
create or replace function public.create_profile(
  user_id text,
  display_name text,
  icon_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_id uuid := auth.uid();
  known_icon_ids text[] := array['human', 'man', 'man2', 'woman', 'boy', 'child', 'old-man', 'grandmother'];
  new_profile public.profiles;
begin
  if auth_user_id is null then
    return json_build_object('status', 'error', 'error', 'Not authenticated.', 'code', 'not_authenticated');
  end if;

  if display_name is null or length(trim(display_name)) = 0 then
    return json_build_object('status', 'error', 'error', 'Display name is required.', 'code', 'invalid_profile_input');
  end if;

  if icon_id is null or not (icon_id = any(known_icon_ids)) then
    return json_build_object('status', 'error', 'error', 'Unknown icon id.', 'code', 'invalid_profile_input');
  end if;

  if exists (select 1 from public.profiles where id = auth_user_id) then
    return json_build_object('status', 'error', 'error', 'Profile already created.', 'code', 'profile_already_created');
  end if;

  if exists (select 1 from public.profiles where public.profiles.user_id = create_profile.user_id) then
    return json_build_object('status', 'error', 'error', 'User ID already taken.', 'code', 'user_id_already_taken');
  end if;

  insert into public.profiles (id, user_id, display_name, icon_url)
  values (auth_user_id, create_profile.user_id, create_profile.display_name, icon_id)
  returning * into new_profile;

  return json_build_object(
    'status', 'ok',
    'data', json_build_object(
      'profile_id', new_profile.id,
      'user_id', new_profile.user_id,
      'display_name', new_profile.display_name,
      'icon_url', new_profile.icon_url,
      'created_at', new_profile.created_at
    )
  );
exception
  when unique_violation then
    return json_build_object('status', 'error', 'error', 'User ID already taken.', 'code', 'user_id_already_taken');
end;
$$;

grant execute on function public.create_profile(text, text, text) to authenticated;
