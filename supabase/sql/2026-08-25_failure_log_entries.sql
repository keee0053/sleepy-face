-- Failure Log Entries: recorded whenever a user's own Wake Up Challenge attempt ends in
-- failure (see src/services/wake-friends.ts logWakeChallengeFailure, called from
-- quiz-failure.tsx and quiz-failure-photo.tsx). Friends can see today's unconsumed
-- entries and "activate" one to remotely ring that friend's alarm (src/app/wake-friends.tsx).

create table if not exists public.failure_log_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table public.failure_log_entries enable row level security;

-- A user can insert their own failure record.
create policy "Users can log their own wake challenge failure"
on public.failure_log_entries for insert
to authenticated
with check (profile_id = auth.uid());

-- A user can read their own entries and their friends' entries (needed for the
-- wake-friends screen to list who can be woken up, and to show a friend the entry was
-- consumed).
create policy "Friends can read failure log entries"
on public.failure_log_entries for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.friends_relations relation
    where
      (relation.profile_id = auth.uid() and relation.friend_profile_id = failure_log_entries.profile_id)
      or
      (relation.friend_profile_id = auth.uid() and relation.profile_id = failure_log_entries.profile_id)
  )
);

-- activated_at is only ever set by the activate-alarm Edge Function, which uses the
-- service role key and so bypasses RLS entirely -- no client-facing update policy exists
-- on purpose, since no authenticated user (not even the entry's own owner) should be able
-- to mark it activated directly.
