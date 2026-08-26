-- Wake Attempt Log: one row per Profile per local day, recording when their alarm's
-- Wake Up Challenge was resolved (success or failure) and at what time. Lets friends see
-- "did they wake up, and when" on the Friends screen -- separate from
-- failure_log_entries, which exists only to drive the wake-a-friend remote-ring feature
-- and would be the wrong place to also track successes.

create table if not exists public.wake_attempt_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  local_day text not null,
  fired_at timestamptz not null,
  outcome text not null check (outcome in ('success', 'failure')),
  created_at timestamptz not null default now(),
  unique (profile_id, local_day)
);

alter table public.wake_attempt_log enable row level security;

-- One row per (profile, local_day) -- a retry the same day overwrites the earlier
-- attempt's outcome rather than accumulating rows, so upserts need an update policy too.
create policy "Users can log their own wake attempt outcome"
on public.wake_attempt_log for insert
to authenticated
with check (profile_id = auth.uid());

create policy "Users can update their own wake attempt outcome"
on public.wake_attempt_log for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Friends can read wake attempt outcomes"
on public.wake_attempt_log for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.friends_relations relation
    where
      relation.status = 'accepted'
      and (
        (relation.profile_id = auth.uid() and relation.friend_profile_id = wake_attempt_log.profile_id)
        or
        (relation.friend_profile_id = auth.uid() and relation.profile_id = wake_attempt_log.profile_id)
      )
  )
);
