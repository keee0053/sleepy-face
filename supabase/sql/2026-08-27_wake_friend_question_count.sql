-- Lets the Friend who rings a Wake Friend alarm choose how many quiz questions the
-- target has to answer, instead of the target's device always falling back to its own
-- dev-only question count setting (see getDevQuizQuestionCount in
-- src/services/dev-quiz-settings.ts). The Wake Friend ring path has no Saved Alarm to
-- read a questionCount from, so this is stashed on the target's own profile row at
-- activation time and read (and cleared) once by the ringing device's quiz screen.
alter table public.profiles
  add column if not exists pending_wake_friend_question_count integer;

alter table public.profiles
  add constraint pending_wake_friend_question_count_range
  check (
    pending_wake_friend_question_count is null
    or (pending_wake_friend_question_count between 5 and 30)
  );
