import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_ALARMS_STORAGE_KEY = 'sleepy-face:saved-alarms';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SavedAlarm = {
  id: string;
  hour: number;
  minute: number;
  weekdays: Weekday[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveAlarmInput = {
  hour: number;
  minute: number;
  weekdays: number[];
};

export type AlarmServiceErrorCode =
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

  return {
    hour: input.hour,
    minute: input.minute,
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
    minute: row.minute as number,
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

export async function listSavedAlarms(): Promise<SavedAlarm[]> {
  const savedAlarms = await readSavedAlarms();
  const now = new Date();

  return [...savedAlarms].sort((left, right) =>
    compareSavedAlarmsByNextOccurrence(left, right, now),
  );
}

export async function createSavedAlarm(
  input: SaveAlarmInput,
): Promise<SavedAlarm> {
  const savedAlarms = await readSavedAlarms();
  const validatedInput = validateAlarmInput(input);

  assertNoWeekdayConflicts(savedAlarms, validatedInput.weekdays);

  const now = new Date().toISOString();
  const savedAlarm: SavedAlarm = {
    createdAt: now,
    hour: validatedInput.hour,
    id: generateSavedAlarmId(),
    isEnabled: true,
    minute: validatedInput.minute,
    updatedAt: now,
    weekdays: validatedInput.weekdays,
  };

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
    updatedAt: new Date().toISOString(),
    weekdays: validatedInput.weekdays,
  };

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
  let nextOccurrence: Date | null = null;

  for (const weekday of alarm.weekdays) {
    const daysUntilWeekday = (weekday - currentWeekday + 7) % 7;
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + daysUntilWeekday);
    candidate.setHours(alarm.hour, alarm.minute, 0, 0);

    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }

    if (!nextOccurrence || candidate.getTime() < nextOccurrence.getTime()) {
      nextOccurrence = candidate;
    }
  }

  return nextOccurrence as Date;
}
