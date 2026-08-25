import { supabase } from '@/lib/supabase';
import { listFriends, type FriendProfile } from '@/services/friend';

export type WakeFriendTarget = FriendProfile & {
  failureEntryId: string;
};

type FailureLogEntryRow = {
  id: string;
  profile_id: string;
};

function startOfLocalDayIso(now: Date): string {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
}

// Joins the existing friend list with today's unconsumed Failure Log Entries so
// screens only receive Friends whose remote alarm can currently be activated.
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
    .gte('created_at', startOfLocalDayIso(now));

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

export async function activateWakeFriendAlarm(
  failureEntryId: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('activate-alarm', {
    body: { entryId: failureEntryId },
  });

  if (error) {
    throw error;
  }
}
