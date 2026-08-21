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

alter table public.push_tokens enable row level security;

-- A select policy IS required even though clients never read push_tokens directly: the
-- client's upsert uses `INSERT ... ON CONFLICT (token) DO UPDATE`, and Postgres RLS needs
-- select visibility on the conflicting row to decide whether to insert or update at all —
-- without this, every upsert fails closed with "new row violates row-level security policy",
-- regardless of how permissive the insert/update policies are (confirmed via curl against
-- the live REST API: removing on_conflict/resolution=merge-duplicates made the identical
-- request succeed, isolating the cause to conflict detection, not the insert/update checks).
create policy "Authenticated users can see push token rows to resolve conflicts"
  on public.push_tokens
  for select
  to authenticated
  using (true);

create policy "Users can register their own push token"
  on public.push_tokens
  for insert
  to authenticated
  with check (profile_id = auth.uid());

-- USING (true) lets the upsert reassign a row belonging to a different profile_id — a
-- token identifies an app install, and a reused install must be able to move to whichever
-- profile is currently logged in (see the comment on token above).
create policy "Users can reassign an existing push token to themselves"
  on public.push_tokens
  for update
  to authenticated
  using (true)
  with check (profile_id = auth.uid());
