-- Account deletion (Google Play User Data policy) needs deleting a user's auth.users
-- row to fully remove all of their data. base_schema.sql (profiles/photos/
-- friends_relations/push_tokens) declared its FKs to profiles(id)/auth.users(id)
-- without `on delete cascade`, so deleting auth.users would previously fail on any
-- dependent row. This backfills cascade on those FKs; the other tables already
-- declared `on delete cascade` to profiles(id) when they were created (photo_reactions,
-- comments, failure_log_entries, wake_attempt_log).
alter table public.profiles
  drop constraint profiles_id_fkey,
  add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

alter table public.photos
  drop constraint photos_profile_id_fkey,
  add constraint photos_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.friends_relations
  drop constraint friends_relations_profile_id_fkey,
  add constraint friends_relations_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;

alter table public.friends_relations
  drop constraint friends_relations_friend_profile_id_fkey,
  add constraint friends_relations_friend_profile_id_fkey
    foreign key (friend_profile_id) references public.profiles(id) on delete cascade;

alter table public.push_tokens
  drop constraint push_tokens_profile_id_fkey,
  add constraint push_tokens_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;
