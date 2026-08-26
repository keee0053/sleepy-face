-- Turns addFriend into a request that the recipient must approve, instead of
-- instantly making both profiles friends. profile_id is the requester, friend_profile_id
-- is the recipient (matches the existing directionality src/services/friend.ts already
-- writes on insert).
alter table public.friends_relations
  add column if not exists status text not null default 'pending';

alter table public.friends_relations
  drop constraint if exists friends_relations_status_check;

alter table public.friends_relations
  add constraint friends_relations_status_check
  check (status in ('pending', 'accepted'));

-- Only the recipient may accept (or leave pending) their own incoming request; they
-- cannot edit anything else about the row (enforced by the same check on both sides).
drop policy if exists "Users can accept their own pending friend requests" on public.friends_relations;
create policy "Users can accept their own pending friend requests"
on public.friends_relations for update
to authenticated
using (friend_profile_id = auth.uid())
with check (friend_profile_id = auth.uid());

-- Either side can remove a relation: the requester canceling a pending request, the
-- recipient declining one, or either side unfriending an accepted one.
drop policy if exists "Users can delete their own friend relations" on public.friends_relations;
create policy "Users can delete their own friend relations"
on public.friends_relations for delete
to authenticated
using (profile_id = auth.uid() or friend_profile_id = auth.uid());
