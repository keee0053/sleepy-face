-- Security fix: the UPDATE policy added in 2026-08-25_friend_requests.sql only pins
-- friend_profile_id = auth.uid() in its USING/WITH CHECK clauses. It does not stop the
-- recipient of a pending request from also rewriting profile_id (the requester) to an
-- arbitrary third party while accepting, forging an "accepted" friend relation that
-- third party never requested or approved. Since friend-gated RLS policies (see
-- 2026-08-25_friend_gated_policies_require_accepted.sql) and the activate-alarm /
-- send-help-request Edge Functions all trust an accepted friends_relations row, a
-- forged row grants the attacker read access to the victim's photos/failure log and
-- lets them remotely ring the victim's alarm, entirely without the victim's consent.
--
-- Fixed with a BEFORE UPDATE trigger (RLS's USING/WITH CHECK alone can't compare a
-- row's old and new values in one expression) that makes profile_id and
-- friend_profile_id immutable after creation, and only allows the pending -> accepted
-- status transition -- matching the immutable-column-guard pattern already used for
-- profiles' monetization columns.
create or replace function public.protect_friend_relation_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is distinct from old.profile_id
    or new.friend_profile_id is distinct from old.friend_profile_id
  then
    raise exception 'profile_id and friend_profile_id cannot be changed after a friend relation is created';
  end if;

  if old.status = 'accepted' and new.status is distinct from old.status then
    raise exception 'an accepted friend relation''s status cannot be changed via update';
  end if;

  if old.status = 'pending' and new.status not in ('pending', 'accepted') then
    raise exception 'invalid friend relation status transition';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_friend_relation_identity_trigger on public.friends_relations;
create trigger protect_friend_relation_identity_trigger
  before update on public.friends_relations
  for each row
  execute function public.protect_friend_relation_identity();
