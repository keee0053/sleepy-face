import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isAlarmSoundId,
  toAlarmSoundId,
  type AlarmSoundId,
} from '@/constants/alarm-sounds';

import {
  cancelAlarmOccurrence,
  scheduleAlarmOccurrence,
} from './android-alarm-mechanics';
import { getLocalDay } from './wake-challenge-attempt';

const SAVED_ALARMS_STORAGE_KEY = 'sleepy-face:saved-alarms';
// Tracks the local day of the user's last Daily Alarm Attempt independent of any single
// alarm's id, so deleting and recreating the alarm that fired can't re-open today's attempt.
const LAST_ALARM_ATTEMPT_LOCAL_DAY_STORAGE_KEY =
  'sleepy-face:last-alarm-attempt-local-day';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MIN_QUIZ_QUESTION_COUNT = 5;
export const MAX_QUIZ_QUESTION_COUNT = 30;
export const DEFAULT_QUIZ_QUESTION_COUNT = 5;

export type SavedAlarm = {
  id: string;
  hour: number;
  minute: number;
  weekdays: Weekday[];
  isEnabled: boolean;
  soundId: AlarmSoundId;
  questionCount: number;
  lastFiredLocalDay: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveAlarmInput = {
  hour: number;
  minute: number;
  weekdays: number[];
  soundId: string;
  questionCount: number;
};

export type AlarmServiceErrorCode =
  | 'alarm_scheduling_failed'
  | 'invalid_alarm_input'
  | 'saved_alarm_not_found'
  | 'storage_clear_failed'
  | 'storage_parse_failed'
  | 'storage_read_failed'
  | 'storage_write_failed'
  | 'weekday_already_used';

type WeekdayConflict = {
  alarmId: string;
  weekdays: Weekday[];
};

type StoredAlarmRow = {
  id: unknown;
  hour: unknown;
  minute: unknown;
  weekdays: unknown;
  isEnabled?: unknown;
  soundId?: unknown;
  questionCount?: unknown;
  lastFiredLocalDay?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

export class AlarmServiceError extends Error {
  constructor(
    public readonly code: AlarmServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AlarmServiceError';
  }
}

function isValidTimePart(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidQuestionCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_QUIZ_QUESTION_COUNT &&
    value <= MAX_QUIZ_QUESTION_COUNT
  );
}

function normalizeWeekdays(
  weekdays: number[],
  errorCode: Extract<
    AlarmServiceErrorCode,
    'invalid_alarm_input' | 'storage_parse_failed'
  >,
): Weekday[] {
  const seenWeekdays = new Set<number>();

  for (const weekday of weekdays) {
    if (!isWeekday(weekday)) {
      throw new AlarmServiceError(
        errorCode,
        'Saved Alarm weekdays must be integers from 0 to 6.',
      );
    }

    if (seenWeekdays.has(weekday)) {
      throw new AlarmServiceError(
        errorCode,
        'Saved Alarm weekdays must not contain duplicates.',
      );
    }

    seenWeekdays.add(weekday);
  }

  return [...seenWeekdays].sort((left, right) => left - right) as Weekday[];
}

function validateAlarmInput(input: SaveAlarmInput): {
  hour: number;
  minute: number;
  weekdays: Weekday[];
  soundId: AlarmSoundId;
  questionCount: number;
} {
  if (!isValidTimePart(input.hour, 0, 23)) {
    throw new AlarmServiceError(
      'invalid_alarm_input',
      'Saved Alarm hour must be an integer from 0 to 23.',
    );
  }

  if (!isValidTimePart(input.minute, 0, 59)) {
    throw new AlarmServiceError(
      'invalid_alarm_input',
      'Saved Alarm minute must be an integer from 0 to 59.',
    );
  }

  if (!Array.isArray(input.weekdays) || input.weekdays.length === 0) {
    throw new AlarmServiceError(
      'invalid_alarm_input',
      'Saved Alarm must include at least one weekday.',
    );
  }

  if (!isAlarmSoundId(input.soundId)) {
    throw new AlarmServiceError(
      'invalid_alarm_input',
      'Saved Alarm sound must be a known Alarm Sound identifier.',
    );
  }

  if (!isValidQuestionCount(input.questionCount)) {
    throw new AlarmServiceError(
      'invalid_alarm_input',
      `Saved Alarm question count must be an integer from ${MIN_QUIZ_QUESTION_COUNT} to ${MAX_QUIZ_QUESTION_COUNT}.`,
    );
  }

  return {
    hour: input.hour,
    minute: input.minute,
    questionCount: input.questionCount,
    soundId: input.soundId,
    weekdays: normalizeWeekdays(input.weekdays, 'invalid_alarm_input'),
  };
}

function assertStoredAlarmShape(
  value: unknown,
): asserts value is StoredAlarmRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AlarmServiceError(
      'storage_parse_failed',
      'Stored Saved Alarm data has an invalid shape.',
      value,
    );
  }
}

function mapStoredAlarm(value: unknown): SavedAlarm {
  assertStoredAlarmShape(value);

  const row = value as StoredAlarmRow;

  if (
    typeof row.id !== 'string' ||
    !isValidTimePart(row.hour, 0, 23) ||
    !isValidTimePart(row.minute, 0, 59) ||
    typeof row.createdAt !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    !Array.isArray(row.weekdays)
  ) {
    throw new AlarmServiceError(
      'storage_parse_failed',
      'Stored Saved Alarm data has an invalid shape.',
      value,
    );
  }

  return {
    createdAt: row.createdAt,
    hour: row.hour as number,
    id: row.id,
    isEnabled: typeof row.isEnabled === 'boolean' ? row.isEnabled : true,
    lastFiredLocalDay:
      typeof row.lastFiredLocalDay === 'string' ? row.lastFiredLocalDay : null,
    minute: row.minute as number,
    // Older local alarms saved before this option existed are treated as the default
    // question count.
    questionCount: isValidQuestionCount(row.questionCount)
      ? row.questionCount
      : DEFAULT_QUIZ_QUESTION_COUNT,
    // Older local alarms saved before this option existed are treated as the default
    // sound, same fallback as an unrecognized id.
    soundId: toAlarmSoundId(
      typeof row.soundId === 'string' ? row.soundId : null,
    ),
    updatedAt: row.updatedAt,
    weekdays: normalizeWeekdays(row.weekdays, 'storage_parse_failed'),
  };
}

async function readSavedAlarms(): Promise<SavedAlarm[]> {
  let rawSavedAlarms: string | null;

  try {
    rawSavedAlarms = await AsyncStorage.getItem(SAVED_ALARMS_STORAGE_KEY);
  } catch (error) {
    throw new AlarmServiceError(
      'storage_read_failed',
      'Could not read Saved Alarms from local storage.',
      error,
    );
  }

  if (!rawSavedAlarms) {
    return [];
  }

  try {
    const parsedAlarms: unknown = JSON.parse(rawSavedAlarms);

    if (!Array.isArray(parsedAlarms)) {
      throw new AlarmServiceError(
        'storage_parse_failed',
        'Stored Saved Alarm data must be an array.',
        parsedAlarms,
      );
    }

    return parsedAlarms.map(mapStoredAlarm);
  } catch (error) {
    if (error instanceof AlarmServiceError) {
      throw error;
    }

    throw new AlarmServiceError(
      'storage_parse_failed',
      'Could not parse Saved Alarm data.',
      error,
    );
  }
}

async function writeSavedAlarms(savedAlarms: SavedAlarm[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SAVED_ALARMS_STORAGE_KEY,
      JSON.stringify(savedAlarms),
    );
  } catch (error) {
    throw new AlarmServiceError(
      'storage_write_failed',
      'Could not write Saved Alarms to local storage.',
      error,
    );
  }
}

async function readLastAlarmAttemptLocalDay(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ALARM_ATTEMPT_LOCAL_DAY_STORAGE_KEY);
  } catch (error) {
    throw new AlarmServiceError(
      'storage_read_failed',
      'Could not read the last alarm attempt local day from local storage.',
      error,
    );
  }
}

async function writeLastAlarmAttemptLocalDay(localDay: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_ALARM_ATTEMPT_LOCAL_DAY_STORAGE_KEY,
      localDay,
    );
  } catch (error) {
    throw new AlarmServiceError(
      'storage_write_failed',
      'Could not write the last alarm attempt local day to local storage.',
      error,
    );
  }
}

function generateSavedAlarmId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function findWeekdayConflicts(
  savedAlarms: SavedAlarm[],
  weekdays: Weekday[],
  excludingAlarmId?: string,
): WeekdayConflict[] {
  const conflicts: WeekdayConflict[] = [];

  for (const alarm of savedAlarms) {
    if (alarm.id === excludingAlarmId) {
      continue;
    }

    const conflictingWeekdays = alarm.weekdays.filter((weekday) =>
      weekdays.includes(weekday),
    );

    if (conflictingWeekdays.length > 0) {
      conflicts.push({
        alarmId: alarm.id,
        weekdays: conflictingWeekdays,
      });
    }
  }

  return conflicts;
}

function assertNoWeekdayConflicts(
  savedAlarms: SavedAlarm[],
  weekdays: Weekday[],
  excludingAlarmId?: string,
): void {
  const conflicts = findWeekdayConflicts(
    savedAlarms,
    weekdays,
    excludingAlarmId,
  );

  if (conflicts.length === 0) {
    return;
  }

  throw new AlarmServiceError(
    'weekday_already_used',
    'Selected weekdays are already used by another Saved Alarm.',
    undefined,
    { conflicts },
  );
}

function compareSavedAlarmsByNextOccurrence(
  left: SavedAlarm,
  right: SavedAlarm,
  now: Date,
): number {
  const leftOccurrence = getNextAlarmOccurrence(left, now).getTime();
  const rightOccurrence = getNextAlarmOccurrence(right, now).getTime();

  if (leftOccurrence !== rightOccurrence) {
    return leftOccurrence - rightOccurrence;
  }

  if (left.hour !== right.hour) {
    return left.hour - right.hour;
  }

  if (left.minute !== right.minute) {
    return left.minute - right.minute;
  }

  return left.id.localeCompare(right.id);
}

async function syncScheduledAlarm(alarm: SavedAlarm): Promise<void> {
  try {
    if (!alarm.isEnabled) {
      await cancelAlarmOccurrence(alarm.id);
      return;
    }

    const nextOccurrence = getNextAlarmOccurrence(alarm);
    await scheduleAlarmOccurrence(
      alarm.id,
      nextOccurrence.getTime(),
      alarm.soundId,
    );
  } catch (error) {
    throw new AlarmServiceError(
      'alarm_scheduling_failed',
      "Could not sync the Saved Alarm with this device's alarm scheduler.",
      error,
    );
  }
}

async function cancelScheduledAlarm(alarmId: string): Promise<void> {
  try {
    await cancelAlarmOccurrence(alarmId);
  } catch (error) {
    throw new AlarmServiceError(
      'alarm_scheduling_failed',
      "Could not cancel the Saved Alarm on this device's alarm scheduler.",
      error,
    );
  }
}

export async function resyncAllScheduledAlarms(): Promise<void> {
  const savedAlarms = await readSavedAlarms();

  await Promise.allSettled(
    savedAlarms
      .filter((alarm) => alarm.isEnabled)
      .map((alarm) => syncScheduledAlarm(alarm)),
  );
}

export async function listSavedAlarms(): Promise<SavedAlarm[]> {
  const savedAlarms = await readSavedAlarms();
  const now = new Date();

  return [...savedAlarms].sort((left, right) =>
    compareSavedAlarmsByNextOccurrence(left, right, now),
  );
}

export async function getSavedAlarm(id: string): Promise<SavedAlarm | null> {
  const savedAlarms = await readSavedAlarms();

  return savedAlarms.find((alarm) => alarm.id === id) ?? null;
}

export async function createSavedAlarm(
  input: SaveAlarmInput,
): Promise<SavedAlarm> {
  const savedAlarms = await readSavedAlarms();
  const validatedInput = validateAlarmInput(input);

  assertNoWeekdayConflicts(savedAlarms, validatedInput.weekdays);

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const lastAlarmAttemptLocalDay = await readLastAlarmAttemptLocalDay();
  const savedAlarm: SavedAlarm = {
    createdAt: now,
    hour: validatedInput.hour,
    id: generateSavedAlarmId(),
    isEnabled: true,
    lastFiredLocalDay:
      lastAlarmAttemptLocalDay === getLocalDay(nowDate)
        ? lastAlarmAttemptLocalDay
        : null,
    minute: validatedInput.minute,
    questionCount: validatedInput.questionCount,
    soundId: validatedInput.soundId,
    updatedAt: now,
    weekdays: validatedInput.weekdays,
  };

  await syncScheduledAlarm(savedAlarm);
  await writeSavedAlarms([...savedAlarms, savedAlarm]);

  return savedAlarm;
}

export async function updateSavedAlarm(
  id: string,
  input: SaveAlarmInput,
): Promise<SavedAlarm> {
  const savedAlarms = await readSavedAlarms();
  const targetAlarm = savedAlarms.find((alarm) => alarm.id === id);

  if (!targetAlarm) {
    throw new AlarmServiceError(
      'saved_alarm_not_found',
      'Saved Alarm could not be found.',
    );
  }

  const validatedInput = validateAlarmInput(input);

  assertNoWeekdayConflicts(savedAlarms, validatedInput.weekdays, id);

  const updatedAlarm: SavedAlarm = {
    ...targetAlarm,
    hour: validatedInput.hour,
    minute: validatedInput.minute,
    questionCount: validatedInput.questionCount,
    soundId: validatedInput.soundId,
    updatedAt: new Date().toISOString(),
    weekdays: validatedInput.weekdays,
  };

  await syncScheduledAlarm(updatedAlarm);
  await writeSavedAlarms(
    savedAlarms.map((alarm) => (alarm.id === id ? updatedAlarm : alarm)),
  );

  return updatedAlarm;
}

export async function setSavedAlarmEnabled(
  id: string,
  isEnabled: boolean,
): Promise<SavedAlarm> {
  const savedAlarms = await readSavedAlarms();
  const targetAlarm = savedAlarms.find((alarm) => alarm.id === id);

  if (!targetAlarm) {
    throw new AlarmServiceError(
      'saved_alarm_not_found',
      'Saved Alarm could not be found.',
    );
  }

  const updatedAlarm: SavedAlarm = {
    ...targetAlarm,
    isEnabled,
    updatedAt: new Date().toISOString(),
  };

  await syncScheduledAlarm(updatedAlarm);
  await writeSavedAlarms(
    savedAlarms.map((alarm) => (alarm.id === id ? updatedAlarm : alarm)),
  );

  return updatedAlarm;
}

const RESCHEDULE_RETRY_DELAY_MS = 2000;

// recordSavedAlarmFired is called fire-and-forget from ringing.tsx (there's no
// interactive UI to retry from mid-Wake-Up-Challenge), so a single transient failure of
// the native reschedule call -- which cancels the alarm's old occurrence before it can
// arm the new one, see AlarmRingingModule.kt's scheduleSavedAlarmOccurrence -- would
// otherwise silently leave the alarm with nothing armed until the device reboots or
// someone happens to reopen the Alarms screen. One short-delayed retry absorbs a one-off
// transient failure without masking a persistent one.
async function syncScheduledAlarmWithRetry(alarm: SavedAlarm): Promise<void> {
  try {
    await syncScheduledAlarm(alarm);
  } catch {
    await new Promise((resolve) =>
      setTimeout(resolve, RESCHEDULE_RETRY_DELAY_MS),
    );
    await syncScheduledAlarm(alarm);
  }
}

// Called by the ringing flow when a Saved Alarm fires, so its already-passed slot for
// today is skipped rather than re-armed. A no-op for unknown IDs (e.g. the dev test alarm).
export async function recordSavedAlarmFired(
  alarmId: string,
  now: Date = new Date(),
): Promise<SavedAlarm | null> {
  const savedAlarms = await readSavedAlarms();
  const targetAlarm = savedAlarms.find((alarm) => alarm.id === alarmId);

  if (!targetAlarm) {
    return null;
  }

  const updatedAlarm: SavedAlarm = {
    ...targetAlarm,
    lastFiredLocalDay: getLocalDay(now),
    updatedAt: now.toISOString(),
  };

  await writeLastAlarmAttemptLocalDay(getLocalDay(now));
  await syncScheduledAlarmWithRetry(updatedAlarm);
  await writeSavedAlarms(
    savedAlarms.map((alarm) => (alarm.id === alarmId ? updatedAlarm : alarm)),
  );

  return updatedAlarm;
}

// DEV-ONLY: lets a developer reset the skip-today state without waiting for the next day.
export async function clearAlarmFiredToday(id: string): Promise<SavedAlarm> {
  const savedAlarms = await readSavedAlarms();
  const targetAlarm = savedAlarms.find((alarm) => alarm.id === id);

  if (!targetAlarm) {
    throw new AlarmServiceError(
      'saved_alarm_not_found',
      'Saved Alarm could not be found.',
    );
  }

  const updatedAlarm: SavedAlarm = {
    ...targetAlarm,
    lastFiredLocalDay: null,
    updatedAt: new Date().toISOString(),
  };

  await syncScheduledAlarm(updatedAlarm);
  await writeSavedAlarms(
    savedAlarms.map((alarm) => (alarm.id === id ? updatedAlarm : alarm)),
  );

  return updatedAlarm;
}

export async function deleteSavedAlarm(id: string): Promise<void> {
  const savedAlarms = await readSavedAlarms();
  const nextSavedAlarms = savedAlarms.filter((alarm) => alarm.id !== id);

  if (nextSavedAlarms.length === savedAlarms.length) {
    throw new AlarmServiceError(
      'saved_alarm_not_found',
      'Saved Alarm could not be found.',
    );
  }

  await cancelScheduledAlarm(id);
  await writeSavedAlarms(nextSavedAlarms);
}

export async function clearSavedAlarms(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVED_ALARMS_STORAGE_KEY);
  } catch (error) {
    throw new AlarmServiceError(
      'storage_clear_failed',
      'Could not clear Saved Alarms from local storage.',
      error,
    );
  }
}

export function getNextAlarmOccurrence(
  alarm: SavedAlarm,
  now = new Date(),
): Date {
  const currentWeekday = now.getDay();
  const firedToday = alarm.lastFiredLocalDay === getLocalDay(now);
  let nextOccurrence: Date | null = null;

  for (const weekday of alarm.weekdays) {
    const daysUntilWeekday = (weekday - currentWeekday + 7) % 7;
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + daysUntilWeekday);
    candidate.setHours(alarm.hour, alarm.minute, 0, 0);

    const isTodaysSlot = daysUntilWeekday === 0;

    if (candidate.getTime() <= now.getTime() || (isTodaysSlot && firedToday)) {
      candidate.setDate(candidate.getDate() + 7);
    }

    if (!nextOccurrence || candidate.getTime() < nextOccurrence.getTime()) {
      nextOccurrence = candidate;
    }
  }

  return nextOccurrence as Date;
}

// True when this alarm would normally ring again today but already fired today, so its
// next occurrence has skipped ahead to next week instead.
export function alarmWillSkipToday(
  alarm: SavedAlarm,
  now: Date = new Date(),
): boolean {
  return (
    alarm.isEnabled &&
    alarm.weekdays.includes(now.getDay() as Weekday) &&
    alarm.lastFiredLocalDay === getLocalDay(now)
  );
}
