import AsyncStorage from '@react-native-async-storage/async-storage';

const WAKE_CHALLENGE_ATTEMPT_STORAGE_KEY = 'sleepy-face:wake-challenge-attempt';

export type WakeChallengeAttemptRecord = {
  alarmId: string | null;
  localDay: string;
  startedAt: string;
};

export type WakeChallengeAttemptServiceErrorCode =
  | 'storage_clear_failed'
  | 'storage_parse_failed'
  | 'storage_read_failed'
  | 'storage_write_failed';

type StoredWakeChallengeAttemptRow = {
  alarmId: unknown;
  localDay: unknown;
  startedAt: unknown;
};

export class WakeChallengeAttemptServiceError extends Error {
  constructor(
    public readonly code: WakeChallengeAttemptServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WakeChallengeAttemptServiceError';
  }
}

export function getLocalDay(now: Date): string {
  const year = now.getFullYear().toString().padStart(4, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function mapStoredRecord(value: unknown): WakeChallengeAttemptRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WakeChallengeAttemptServiceError(
      'storage_parse_failed',
      'Stored Wake Challenge Attempt data has an invalid shape.',
      value,
    );
  }

  const row = value as StoredWakeChallengeAttemptRow;

  if (
    typeof row.localDay !== 'string' ||
    typeof row.startedAt !== 'string' ||
    (row.alarmId !== null && typeof row.alarmId !== 'string')
  ) {
    throw new WakeChallengeAttemptServiceError(
      'storage_parse_failed',
      'Stored Wake Challenge Attempt data has an invalid shape.',
      value,
    );
  }

  return {
    alarmId: row.alarmId,
    localDay: row.localDay,
    startedAt: row.startedAt,
  };
}

export async function startWakeChallengeAttempt(
  input: { alarmId?: string | null } = {},
  now: Date = new Date(),
): Promise<WakeChallengeAttemptRecord> {
  const record: WakeChallengeAttemptRecord = {
    alarmId: input.alarmId ?? null,
    localDay: getLocalDay(now),
    startedAt: now.toISOString(),
  };

  try {
    await AsyncStorage.setItem(
      WAKE_CHALLENGE_ATTEMPT_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch (error) {
    throw new WakeChallengeAttemptServiceError(
      'storage_write_failed',
      'Could not write the Wake Challenge Attempt record to local storage.',
      error,
    );
  }

  return record;
}

export async function getWakeChallengeAttempt(): Promise<WakeChallengeAttemptRecord | null> {
  let rawRecord: string | null;

  try {
    rawRecord = await AsyncStorage.getItem(WAKE_CHALLENGE_ATTEMPT_STORAGE_KEY);
  } catch (error) {
    throw new WakeChallengeAttemptServiceError(
      'storage_read_failed',
      'Could not read the Wake Challenge Attempt record from local storage.',
      error,
    );
  }

  if (!rawRecord) {
    return null;
  }

  try {
    const parsedRecord: unknown = JSON.parse(rawRecord);

    return mapStoredRecord(parsedRecord);
  } catch (error) {
    if (error instanceof WakeChallengeAttemptServiceError) {
      throw error;
    }

    throw new WakeChallengeAttemptServiceError(
      'storage_parse_failed',
      'Could not parse the Wake Challenge Attempt record.',
      error,
    );
  }
}

export async function clearWakeChallengeAttempt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WAKE_CHALLENGE_ATTEMPT_STORAGE_KEY);
  } catch (error) {
    throw new WakeChallengeAttemptServiceError(
      'storage_clear_failed',
      'Could not clear the Wake Challenge Attempt record from local storage.',
      error,
    );
  }
}

export type AbandonedWakeChallengeAttemptOutcome =
  | {
      abandoned: true;
      blockedLocalDay: string;
    }
  | {
      abandoned: false;
    };

// Generous grace period covering the full Wake Up Challenge timer (see
// ALARM_TIMER_SECONDS in wake-challenge-ui.tsx) plus slack for photo upload/quiz
// interaction lag. A record found younger than this could still be a genuinely active
// attempt whose process merely restarted (e.g. the OS reclaimed memory in the
// background) rather than one the user actually walked away from -- treating it as
// abandoned this early would show a false "you quit" failure screen the moment they
// reopen the app, even though nothing has actually gone wrong yet.
//
// The JS countdown timer is deliberately paused for parts of every normal attempt
// (face-check.tsx pauses it while checkFaceProof() runs, and it stays paused through
// face-check-success.tsx's 5-second countdown, only resuming once quiz.tsx mounts), so
// real wall-clock elapsed time routinely exceeds ALARM_TIMER_SECONDS even for a
// legitimate, still-in-progress attempt. The extra buffer below covers that pause time
// on top of the full nominal timer, rather than merely matching it.
const ABANDONED_GRACE_PERIOD_MS = 120 * 1000 + 90 * 1000;

export function getAbandonedWakeChallengeAttemptOutcome(
  record: WakeChallengeAttemptRecord | null,
  now: Date = new Date(),
): AbandonedWakeChallengeAttemptOutcome {
  if (!record) {
    return { abandoned: false };
  }

  const startedAtMs = Date.parse(record.startedAt);
  const elapsedMs = Number.isFinite(startedAtMs)
    ? now.getTime() - startedAtMs
    : Infinity;

  if (elapsedMs < ABANDONED_GRACE_PERIOD_MS) {
    return { abandoned: false };
  }

  return { abandoned: true, blockedLocalDay: record.localDay };
}
