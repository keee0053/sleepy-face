-- Adds indexes on foreign-key-style columns that are hit on every friend-relation
-- lookup, Home Feed load, and Wake Friend / Help Request Edge Function call, but were
-- never indexed (Postgres only auto-indexes primary keys and unique constraints, not
-- plain foreign key columns). At the current small scale this is invisible, but every
-- one of these columns is scanned on the morning wake-up burst, so it's worth fixing
-- early while it's a zero-cost, zero-risk change (CREATE INDEX IF NOT EXISTS is
-- idempotent and safe to run against a live table with existing rows at this size).
--
-- friends_relations and photos are base-schema tables not defined anywhere in this
-- repo (see supabase/README.md's "スキーマ管理上の注意"), so their columns are
-- inferred from how they're referenced elsewhere (e.g.
-- 2026-08-26_account_deletion_cascades.sql's FK definitions, and the friend-gated
-- policies in 2026-08-25_friend_gated_policies_require_accepted.sql).

create index if not exists idx_friends_relations_profile_id
  on public.friends_relations (profile_id);

create index if not exists idx_friends_relations_friend_profile_id
  on public.friends_relations (friend_profile_id);

create index if not exists idx_failure_log_entries_profile_id
  on public.failure_log_entries (profile_id);

create index if not exists idx_photos_profile_id
  on public.photos (profile_id);

create index if not exists idx_comments_photo_id
  on public.comments (photo_id);

create index if not exists idx_photo_reactions_photo_id
  on public.photo_reactions (photo_id);
