import { supabase } from '@/lib/supabase';
import { listFriends, type FriendProfile } from '@/services/friend';

export type WakeFriendTarget = FriendProfile & {
  failureEntryId: string;
};

type FailureLogEntryRow = {
  id: string;
  profile_id: string;
};

// Kept in sync with ENTRY_VALIDITY_WINDOW_MS in
// supabase/functions/activate-alarm/activate.ts, which is the actual server-side source
// of truth -- this is only for what the list shows, not what activate-alarm will accept.
const ENTRY_VALIDITY_WINDOW_MS = 30 * 60 * 1000;

function entryValidityWindowStartIso(now: Date): string {
  return new Date(now.getTime() - ENTRY_VALIDITY_WINDOW_MS).toISOString();
}

// Joins the existing friend list with unconsumed Failure Log Entries from the last 30
// minutes so screens only receive Friends whose remote alarm can currently be activated.
export async function listWakeFriendTargets(
  now: Date = new Date(),
): Promise<WakeFriendTarget[]> {
  const friends = await listFriends();

  if (friends.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('failure_log_entries')
    .select('id, profile_id')
    .in(
      'profile_id',
      friends.map((friend) => friend.id),
    )
    .is('activated_at', null)
    .gte('created_at', entryValidityWindowStartIso(now));

  if (error) {
    throw error;
  }

  const entries = (data ?? []) as FailureLogEntryRow[];
  const entryIdByProfileId = new Map<string, string>();

  for (const entry of entries) {
    if (!entryIdByProfileId.has(entry.profile_id)) {
      entryIdByProfileId.set(entry.profile_id, entry.id);
    }
  }

  return friends.flatMap((friend) => {
    const failureEntryId = entryIdByProfileId.get(friend.id);

    return failureEntryId ? [{ ...friend, failureEntryId }] : [];
  });
}

// Called once per failed Wake Up Challenge attempt (see quiz-failure.tsx and
// quiz-failure-photo.tsx) so friends can see it and, if they choose, ring this user's
// alarm remotely. Best-effort: a failure to log here must never block the failure screen
// itself from rendering, matching the existing recordFailureAccessOutcome call pattern.
export async function logWakeChallengeFailure(): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return;
  }

  await supabase
    .from('failure_log_entries')
    .insert({ profile_id: userData.user.id });
}

// Reads (and clears) the question count the Friend who rang this device's alarm chose,
// stashed on this Profile's own row by activate-alarm since the Wake Friend ring path
// has no Saved Alarm for the quiz screen to read a questionCount from otherwise (see
// resolveRequiredCorrectAnswerCount in quiz.tsx). Single-use: cleared immediately so a
// later dev/test alarm ring doesn't pick up a stale value.
export async function getAndClearPendingWakeFriendQuestionCount(): Promise<
  number | null
> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('pending_wake_friend_question_count')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error || !data?.pending_wake_friend_question_count) {
    return null;
  }

  await supabase
    .from('profiles')
    .update({ pending_wake_friend_question_count: null })
    .eq('id', userData.user.id);

  return data.pending_wake_friend_question_count;
}

export async function activateWakeFriendAlarm(
  failureEntryId: string,
  questionCount?: number,
): Promise<void> {
  const { error } = await supabase.functions.invoke('activate-alarm', {
    body: { entryId: failureEntryId, questionCount },
  });

  if (error) {
    throw error;
  }
}
