-- User Generated Content policy: apps that display other users' content must let
-- viewers report objectionable content and block abusive users.

-- reports: an append-only audit trail. There's no in-app admin panel yet, so reports
-- are reviewed directly via the SQL Editor; users can only insert and read their own.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('photo', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in ('inappropriate', 'harassment', 'spam', 'other')),
  details text,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "Users can insert their own reports"
on public.reports for insert
to authenticated
with check (reporter_id = auth.uid());

create policy "Users can read their own reports"
on public.reports for select
to authenticated
using (reporter_id = auth.uid());

-- blocks: directional. Only the blocker can see their own block list (blockUser then
-- also deletes any friends_relations row between the two, in src/services/moderation.ts)
-- -- the blocked party is never told who blocked them.
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_not_self check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

create policy "Users can read their own blocks"
on public.blocks for select
to authenticated
using (blocker_id = auth.uid());

create policy "Users can insert their own blocks"
on public.blocks for insert
to authenticated
with check (blocker_id = auth.uid());

create policy "Users can delete their own blocks"
on public.blocks for delete
to authenticated
using (blocker_id = auth.uid());

-- security definer so this can see both sides of a block regardless of which party is
-- asking -- the blocks SELECT policy above only lets a user see blocks THEY made, which
-- is not enough to stop a blocked user from re-sending a friend request (see the
-- friends_relations insert policy below): that check must see a block made by either
-- party, not just the caller's own.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.is_blocked(uuid, uuid) from public;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

drop policy if exists "Users can insert their own friend relations" on public.friends_relations;
create policy "Users can insert their own friend relations"
on public.friends_relations for insert
to authenticated
with check (
  profile_id = auth.uid()
  and not public.is_blocked(profile_id, friend_profile_id)
);
