-- Neither of these friend-gated policies checked friends_relations.status, so a
-- still-pending (not yet approved) friend request already granted full read access --
-- exactly the leak the friend-approval feature (2026-08-25_friend_requests.sql) was
-- meant to close. Require status = 'accepted' on both.

drop policy if exists "Friends can read each other's photos" on public.photos;
create policy "Friends can read each other's photos"
on public.photos for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.friends_relations relation
    where
      relation.status = 'accepted'
      and (
        (relation.profile_id = auth.uid() and relation.friend_profile_id = photos.profile_id)
        or
        (relation.friend_profile_id = auth.uid() and relation.profile_id = photos.profile_id)
      )
  )
);

drop policy if exists "Friends can read failure log entries" on public.failure_log_entries;
create policy "Friends can read failure log entries"
on public.failure_log_entries for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.friends_relations relation
    where
      relation.status = 'accepted'
      and (
        (relation.profile_id = auth.uid() and relation.friend_profile_id = failure_log_entries.profile_id)
        or
        (relation.friend_profile_id = auth.uid() and relation.profile_id = failure_log_entries.profile_id)
      )
  )
);
