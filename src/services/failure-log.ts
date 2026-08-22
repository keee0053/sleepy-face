import { supabase } from '@/lib/supabase';
import type { WakeChallengeFailureReason } from '@/services/wake-challenge-rules';

export type FailureLogServiceErrorCode =
  'not_authenticated' | 'unexpected_error';

export class FailureLogServiceError extends Error {
  constructor(
    public readonly code: FailureLogServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FailureLogServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new FailureLogServiceError(
      'not_authenticated',
      'Recording a failure event requires an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

// Called from every Challenge Failure route, alongside recordFailureAccessOutcome, to
// create a Failure Log Entry -- separate from Failure Card, carries no photo, and does
// not affect Friends Feed Access. Powers Alarm Activation targeting only.
export async function recordFailureEvent(
  reason: WakeChallengeFailureReason,
): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase.from('failure_log_entries').insert({
    failure_reason: reason,
    profile_id: profileId,
  });

  if (error) {
    throw new FailureLogServiceError(
      'unexpected_error',
      'Could not record the failure event.',
      error,
    );
  }
}

export type UnconsumedFailureLogEntry = {
  id: string;
  profileId: string;
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

// Powers the Friends-screen Alarm Activation gating query: which of the given Friends
// currently has an unconsumed Failure Log Entry for today, and which entry to target.
export async function listUnconsumedFailureLogEntries(
  friendProfileIds: string[],
  now: Date = new Date(),
): Promise<UnconsumedFailureLogEntry[]> {
  if (friendProfileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('failure_log_entries')
    .select('id, profile_id')
    .in('profile_id', friendProfileIds)
    .is('activated_at', null)
    .gte('created_at', startOfLocalDayIso(now));

  if (error) {
    throw new FailureLogServiceError(
      'unexpected_error',
      'Could not load unconsumed failure log entries.',
      error,
    );
  }

  return ((data ?? []) as FailureLogEntryRow[]).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
  }));
}

// Calls the activate-alarm edge function, which atomically consumes the given Failure
// Log Entry and pushes an Alarm Activation to its owner's registered devices.
export async function activateAlarm(entryId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('activate-alarm', {
    body: { entryId },
  });

  if (error) {
    throw new FailureLogServiceError(
      'unexpected_error',
      'Could not activate the alarm.',
      error,
    );
  }
}
