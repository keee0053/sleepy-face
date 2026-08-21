create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A token identifies an app install, not a user: if the same install re-registers under a
-- different logged-in profile, the unique constraint on token reassigns it via upsert
-- rather than creating a stale duplicate row.
create index push_tokens_profile_id_idx on public.push_tokens (profile_id);
