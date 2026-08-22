-- Failure Log Entries: a lightweight record created for every Challenge Failure,
-- regardless of reason, so Friends can see who currently needs help and remotely
-- activate their alarm. Fully separate from `photos`/Failure Card: no photo, no effect
-- on Friends Feed Access. `activated_at`/`activated_by` are only ever set by the
-- `activate-alarm` edge function (service role) -- there is deliberately no client-facing
-- update policy, so a client can never mark its own or anyone else's entry activated.

create table if not exists public.failure_log_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  failure_reason text not null check (
    failure_reason in (
      'app-quit',
      'bad-photo-limit',
      'no-photo-timeout',
      'quiz-timeout',
      'quiz-upload-failed'
    )
  ),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by uuid references public.profiles(id) on delete set null
);

create index if not exists failure_log_entries_profile_id_idx
  on public.failure_log_entries (profile_id);

alter table public.failure_log_entries enable row level security;

create policy "Users can insert their own failure log entry"
on public.failure_log_entries for insert
to authenticated
with check (profile_id = auth.uid());

-- Mirrors the friends_relations visibility pattern used elsewhere (e.g. push-on-failure's
-- notify.ts): a user can see their own entries, plus any entry belonging to a Friend --
-- this is what powers the Friends-screen Alarm Activation gating query.
create policy "Users can read their own or friends' failure log entries"
on public.failure_log_entries for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.friends_relations fr
    where (fr.profile_id = auth.uid() and fr.friend_profile_id = failure_log_entries.profile_id)
       or (fr.friend_profile_id = auth.uid() and fr.profile_id = failure_log_entries.profile_id)
  )
);
