-- Shows "N問でクリア" next to a friend's wake status on the friends list -- the quiz
-- difficulty (required correct answer count) in effect for that day's attempt.
-- Nullable: a Bad Photo Limit failure (face-check.tsx) happens before the quiz stage
-- even starts, so there's no question count to record for it.
alter table public.wake_attempt_log
  add column if not exists required_question_count integer;
