-- Lets the quiz outcome screens show who rang this device's Wake Friend alarm (see
-- pending_wake_friend_question_count in 2026-08-27_wake_friend_question_count.sql for
-- the same stash-on-profile pattern this follows). Set by activate-alarm alongside the
-- question count, and read (and cleared) once by the ringing device's quiz screen.
alter table public.profiles
  add column if not exists pending_wake_friend_activated_by text;
