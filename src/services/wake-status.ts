import { supabase } from '@/lib/supabase';
import {
  getLocalDay,
  getWakeChallengeAttempt,
} from '@/services/wake-challenge-attempt';

export type WakeOutcome = 'success' | 'failure';

export type FriendWakeStatus = {
  profileId: string;
  localDay: string;
  firedAt: string;
  outcome: WakeOutcome;
  requiredQuestionCount: number | null;
};

type WakeAttemptLogRow = {
  profile_id: string;
  local_day: string;
  fired_at: string;
  outcome: string;
  required_question_count: number | null;
};

function isWakeOutcome(value: string): value is WakeOutcome {
  return value === 'success' || value === 'failure';
}

// Called once per resolved Wake Up Challenge (see quiz-success.tsx, quiz-failure.tsx,
// and quiz-failure-photo.tsx), so friends can see when today's alarm rang and whether it
// was completed. Best-effort: a failure to log here must never block the outcome screen
// itself from rendering, matching the existing recordFailureAccessOutcome/
// logWakeChallengeFailure call pattern. Reads the in-progress WakeChallengeAttemptRecord
// for a startedAt close to when the alarm actually rang -- the AsyncStorage read is
// issued first (before this function's first await point) so that, called textually
// before clearWakeChallengeAttempt() the way every call site does, it's dispatched to
// the native bridge ahead of that clear's removeItem, avoiding a lost-read race.
export type RecordedWakeAttempt = {
  firedAt: string;
  localDay: string;
};

export async function recordWakeAttemptOutcome(
  outcome: WakeOutcome,
  requiredQuestionCount: number | null = null,
): Promise<RecordedWakeAttempt> {
  const attempt = await getWakeChallengeAttempt().catch(() => null);
  const firedAt = attempt?.startedAt ?? new Date().toISOString();
  const localDay = attempt?.localDay ?? getLocalDay(new Date());

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { firedAt, localDay };
  }

  await supabase.from('wake_attempt_log').upsert(
    {
      fired_at: firedAt,
      local_day: localDay,
      outcome,
      profile_id: userData.user.id,
      required_question_count: requiredQuestionCount,
    },
    { onConflict: 'profile_id,local_day' },
  );

  return { firedAt, localDay };
}

// Today's wake outcome for each of the given friend profile ids, keyed by profile id.
// "Today" is the viewer's own local day -- a friend's row was written using their own
// local day at the time, so this can miss/misalign a result right around midnight for
// friends in a different timezone, same tradeoff as the rest of this app's local-day
// logic.
export async function listTodayWakeStatuses(
  friendProfileIds: string[],
): Promise<Map<string, FriendWakeStatus>> {
  if (friendProfileIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('wake_attempt_log')
    .select('profile_id, local_day, fired_at, outcome, required_question_count')
    .in('profile_id', friendProfileIds)
    .eq('local_day', getLocalDay(new Date()));

  if (error) {
    throw error;
  }

  const statusByProfileId = new Map<string, FriendWakeStatus>();

  for (const row of (data ?? []) as WakeAttemptLogRow[]) {
    if (!isWakeOutcome(row.outcome)) {
      continue;
    }

    statusByProfileId.set(row.profile_id, {
      firedAt: row.fired_at,
      localDay: row.local_day,
      outcome: row.outcome,
      profileId: row.profile_id,
      requiredQuestionCount: row.required_question_count,
    });
  }

  return statusByProfileId;
}
