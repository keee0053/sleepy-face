import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AlarmServiceError,
  alarmWillSkipToday,
  clearAlarmFiredToday,
  clearSavedAlarms,
  createSavedAlarm,
  deleteSavedAlarm,
  getNextAlarmOccurrence,
  listSavedAlarms,
  recordSavedAlarmFired,
  resyncAllScheduledAlarms,
  setSavedAlarmEnabled,
  updateSavedAlarm,
  type SavedAlarm,
} from '../alarm';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));

const alarmMechanicsMocks = vi.hoisted(() => ({
  cancelAlarmOccurrence: vi.fn(),
  scheduleAlarmOccurrence: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    removeItem: mocks.removeItem,
    setItem: mocks.setItem,
  },
}));

vi.mock('../android-alarm-mechanics', () => ({
  cancelAlarmOccurrence: alarmMechanicsMocks.cancelAlarmOccurrence,
  scheduleAlarmOccurrence: alarmMechanicsMocks.scheduleAlarmOccurrence,
}));

function expectAlarmServiceError(
  error: unknown,
  code: AlarmServiceError['code'],
) {
  expect(error).toBeInstanceOf(AlarmServiceError);
  expect((error as AlarmServiceError).code).toBe(code);
}

function storedAlarm(overrides: Partial<SavedAlarm> = {}): SavedAlarm {
  return {
    createdAt: '2026-08-17T00:00:00.000Z',
    hour: 7,
    id: 'alarm-1',
    isEnabled: true,
    lastFiredLocalDay: null,
    minute: 30,
    soundId: 'default',
    updatedAt: '2026-08-17T00:00:00.000Z',
    weekdays: [1, 3],
    ...overrides,
  };
}

describe('Saved Alarm service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'));
    mocks.getItem.mockResolvedValue(null);
    mocks.removeItem.mockResolvedValue(undefined);
    mocks.setItem.mockResolvedValue(undefined);
    alarmMechanicsMocks.cancelAlarmOccurrence.mockResolvedValue(undefined);
    alarmMechanicsMocks.scheduleAlarmOccurrence.mockResolvedValue({
      alarmId: 'unused',
      scheduledFor: 'unused',
    });
  });

  it('lists an empty array when no Saved Alarms are stored', async () => {
    await expect(listSavedAlarms()).resolves.toEqual([]);
    expect(mocks.getItem).toHaveBeenCalledWith('sleepy-face:saved-alarms');
  });

  it('creates a Saved Alarm with generated timestamps and sorted weekdays', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [5, 1, 3],
        soundId: 'default',
      }),
    ).resolves.toEqual({
      createdAt: '2026-08-17T00:00:00.000Z',
      hour: 7,
      id: '00000000-0000-4000-8000-000000000001',
      isEnabled: true,
      lastFiredLocalDay: null,
      minute: 30,
      soundId: 'default',
      updatedAt: '2026-08-17T00:00:00.000Z',
      weekdays: [1, 3, 5],
    });
    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:saved-alarms',
      JSON.stringify([
        {
          createdAt: '2026-08-17T00:00:00.000Z',
          hour: 7,
          id: '00000000-0000-4000-8000-000000000001',
          isEnabled: true,
          lastFiredLocalDay: null,
          minute: 30,
          soundId: 'default',
          updatedAt: '2026-08-17T00:00:00.000Z',
          weekdays: [1, 3, 5],
        },
      ]),
    );
  });

  it('updates a Saved Alarm while preserving its creation timestamp', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));
    vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));

    await expect(
      updateSavedAlarm('alarm-1', {
        hour: 8,
        minute: 45,
        weekdays: [3],
        soundId: 'default',
      }),
    ).resolves.toEqual({
      createdAt: '2026-08-17T00:00:00.000Z',
      hour: 8,
      id: 'alarm-1',
      isEnabled: true,
      lastFiredLocalDay: null,
      minute: 45,
      soundId: 'default',
      updatedAt: '2026-08-18T00:00:00.000Z',
      weekdays: [3],
    });
  });

  it('toggles a Saved Alarm enabled state', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));
    vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));

    await expect(setSavedAlarmEnabled('alarm-1', false)).resolves.toEqual({
      ...storedAlarm(),
      isEnabled: false,
      updatedAt: '2026-08-18T00:00:00.000Z',
    });
    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:saved-alarms',
      JSON.stringify([
        {
          ...storedAlarm(),
          isEnabled: false,
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ]),
    );
  });

  it('reads older Saved Alarms without enabled state as enabled', async () => {
    const { isEnabled: _isEnabled, ...legacyAlarm } = storedAlarm();
    mocks.getItem.mockResolvedValue(JSON.stringify([legacyAlarm]));

    await expect(listSavedAlarms()).resolves.toEqual([storedAlarm()]);
  });

  it('deletes a Saved Alarm and clears all Saved Alarms explicitly', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));

    await expect(deleteSavedAlarm('alarm-1')).resolves.toBeUndefined();
    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:saved-alarms',
      '[]',
    );

    await expect(clearSavedAlarms()).resolves.toBeUndefined();
    expect(mocks.removeItem).toHaveBeenCalledWith('sleepy-face:saved-alarms');
  });

  it('sorts listed Saved Alarms by next occurrence, then time and id', async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify([
        storedAlarm({ hour: 9, id: 'b', minute: 0, weekdays: [1] }),
        storedAlarm({ hour: 7, id: 'c', minute: 0, weekdays: [2] }),
        storedAlarm({ hour: 7, id: 'a', minute: 0, weekdays: [2] }),
      ]),
    );
    vi.setSystemTime(new Date('2026-08-17T08:00:00.000Z'));

    await expect(listSavedAlarms()).resolves.toEqual([
      storedAlarm({ hour: 7, id: 'a', minute: 0, weekdays: [2] }),
      storedAlarm({ hour: 7, id: 'c', minute: 0, weekdays: [2] }),
      storedAlarm({ hour: 9, id: 'b', minute: 0, weekdays: [1] }),
    ]);
  });

  it('rejects invalid create input with typed errors', async () => {
    await expect(
      createSavedAlarm({
        hour: 24,
        minute: 30,
        weekdays: [1],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 60,
        weekdays: [1],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [1, 1],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [7],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });
  });

  it('rejects weekdays already owned by another Saved Alarm', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));

    await expect(
      createSavedAlarm({
        hour: 8,
        minute: 0,
        weekdays: [3, 5],
        soundId: 'default',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectAlarmServiceError(error, 'weekday_already_used');
      expect((error as AlarmServiceError).details).toEqual({
        conflicts: [{ alarmId: 'alarm-1', weekdays: [3] }],
      });
      return true;
    });

    await expect(
      updateSavedAlarm('alarm-1', {
        hour: 8,
        minute: 0,
        weekdays: [1, 3],
        soundId: 'default',
      }),
    ).resolves.toMatchObject({
      hour: 8,
      weekdays: [1, 3],
    });
  });

  it('throws typed errors for missing alarms and storage failures', async () => {
    await expect(
      updateSavedAlarm('missing', {
        hour: 7,
        minute: 30,
        weekdays: [1],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({ code: 'saved_alarm_not_found' });

    await expect(deleteSavedAlarm('missing')).rejects.toMatchObject({
      code: 'saved_alarm_not_found',
    });

    await expect(setSavedAlarmEnabled('missing', false)).rejects.toMatchObject({
      code: 'saved_alarm_not_found',
    });

    mocks.getItem.mockRejectedValueOnce(new Error('read failed'));

    await expect(listSavedAlarms()).rejects.toMatchObject({
      code: 'storage_read_failed',
    });

    mocks.getItem.mockResolvedValueOnce('{');

    await expect(listSavedAlarms()).rejects.toMatchObject({
      code: 'storage_parse_failed',
    });

    mocks.getItem.mockResolvedValueOnce(
      JSON.stringify([storedAlarm({ weekdays: [1, 1] })]),
    );

    await expect(listSavedAlarms()).rejects.toMatchObject({
      code: 'storage_parse_failed',
    });

    mocks.getItem.mockResolvedValueOnce(null);
    mocks.setItem.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [1],
        soundId: 'default',
      }),
    ).rejects.toMatchObject({
      code: 'storage_write_failed',
    });

    mocks.removeItem.mockRejectedValueOnce(new Error('clear failed'));

    await expect(clearSavedAlarms()).rejects.toMatchObject({
      code: 'storage_clear_failed',
    });
  });

  it('calculates the next local occurrence at minute precision', () => {
    const alarm = storedAlarm({ hour: 7, minute: 30, weekdays: [1, 3] });

    expect(
      getNextAlarmOccurrence(alarm, new Date('2026-08-17T07:29:59.999')),
    ).toEqual(new Date('2026-08-17T07:30:00.000'));
    expect(
      getNextAlarmOccurrence(alarm, new Date('2026-08-17T07:30:00.000')),
    ).toEqual(new Date('2026-08-19T07:30:00.000'));
    expect(
      getNextAlarmOccurrence(alarm, new Date('2026-08-19T07:31:00.000')),
    ).toEqual(new Date('2026-08-24T07:30:00.000'));
  });

  it("skips today's slot when the alarm already fired today, even if the time has not passed yet", () => {
    const alarm = storedAlarm({
      hour: 7,
      lastFiredLocalDay: '2026-08-17',
      minute: 30,
      weekdays: [1],
    });

    expect(
      getNextAlarmOccurrence(alarm, new Date('2026-08-17T06:00:00.000')),
    ).toEqual(new Date('2026-08-24T07:30:00.000'));
  });

  it('does not skip today when a different day was recorded as fired', () => {
    const alarm = storedAlarm({
      hour: 7,
      lastFiredLocalDay: '2026-08-10',
      minute: 30,
      weekdays: [1],
    });

    expect(
      getNextAlarmOccurrence(alarm, new Date('2026-08-17T06:00:00.000')),
    ).toEqual(new Date('2026-08-17T07:30:00.000'));
  });

  it('reports whether an alarm will skip today', () => {
    const firedTodayAlarm = storedAlarm({
      lastFiredLocalDay: '2026-08-17',
      weekdays: [1, 3],
    });
    const notFiredAlarm = storedAlarm({
      lastFiredLocalDay: null,
      weekdays: [1, 3],
    });
    const disabledAlarm = storedAlarm({
      isEnabled: false,
      lastFiredLocalDay: '2026-08-17',
      weekdays: [1, 3],
    });
    const otherWeekdayAlarm = storedAlarm({
      lastFiredLocalDay: '2026-08-17',
      weekdays: [2],
    });
    const now = new Date('2026-08-17T06:00:00.000');

    expect(alarmWillSkipToday(firedTodayAlarm, now)).toBe(true);
    expect(alarmWillSkipToday(notFiredAlarm, now)).toBe(false);
    expect(alarmWillSkipToday(disabledAlarm, now)).toBe(false);
    expect(alarmWillSkipToday(otherWeekdayAlarm, now)).toBe(false);
  });

  it('records that a Saved Alarm fired today and resyncs it', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));
    vi.setSystemTime(new Date('2026-08-17T07:30:00.000Z'));

    const updated = await recordSavedAlarmFired('alarm-1');

    expect(updated).toMatchObject({ lastFiredLocalDay: '2026-08-17' });
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'alarm-1',
      expect.any(Number),
      'default',
    );
  });

  it('is a safe no-op recording a fire for an unknown alarm id (e.g. the dev test alarm)', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));

    await expect(recordSavedAlarmFired('unknown-id')).resolves.toBeNull();
    expect(mocks.setItem).not.toHaveBeenCalled();
  });

  it('clears the fired-today state on a Saved Alarm', async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify([storedAlarm({ lastFiredLocalDay: '2026-08-17' })]),
    );

    const cleared = await clearAlarmFiredToday('alarm-1');

    expect(cleared).toMatchObject({ lastFiredLocalDay: null });
  });

  it('throws a typed error clearing the fired-today state for a missing alarm', async () => {
    await expect(clearAlarmFiredToday('missing')).rejects.toMatchObject({
      code: 'saved_alarm_not_found',
    });
  });

  it('schedules a native occurrence for a newly created Saved Alarm', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );

    const created = await createSavedAlarm({
      hour: 7,
      minute: 30,
      weekdays: [1, 3],
      soundId: 'default',
    });

    const expectedNext = getNextAlarmOccurrence(created);
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expectedNext.getTime(),
      'default',
    );
    expect(alarmMechanicsMocks.cancelAlarmOccurrence).not.toHaveBeenCalled();
  });

  it('reschedules a Saved Alarm to its new time on update', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));

    const updated = await updateSavedAlarm('alarm-1', {
      hour: 8,
      minute: 45,
      soundId: 'default',
      weekdays: [3],
    });

    const expectedNext = getNextAlarmOccurrence(updated);
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'alarm-1',
      expectedNext.getTime(),
      'default',
    );
  });

  it('cancels a disabled Saved Alarm and reschedules it once re-enabled', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));

    await setSavedAlarmEnabled('alarm-1', false);
    expect(alarmMechanicsMocks.cancelAlarmOccurrence).toHaveBeenCalledWith(
      'alarm-1',
    );
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).not.toHaveBeenCalled();

    alarmMechanicsMocks.cancelAlarmOccurrence.mockClear();
    mocks.getItem.mockResolvedValue(
      JSON.stringify([storedAlarm({ isEnabled: false })]),
    );

    const reEnabled = await setSavedAlarmEnabled('alarm-1', true);
    const expectedNext = getNextAlarmOccurrence(reEnabled);
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'alarm-1',
      expectedNext.getTime(),
      'default',
    );
  });

  it('cancels a Saved Alarm native occurrence on delete without rescheduling', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));

    await deleteSavedAlarm('alarm-1');

    expect(alarmMechanicsMocks.cancelAlarmOccurrence).toHaveBeenCalledWith(
      'alarm-1',
    );
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).not.toHaveBeenCalled();
  });

  it('syncs only the mutated Saved Alarm, leaving other alarms untouched', async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify([storedAlarm({ id: 'alarm-1', weekdays: [1] })]),
    );
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000002',
    );

    await createSavedAlarm({
      hour: 6,
      minute: 0,
      soundId: 'default',
      weekdays: [2],
    });

    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledTimes(
      1,
    );
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000002',
      expect.any(Number),
      'default',
    );
    expect(alarmMechanicsMocks.cancelAlarmOccurrence).not.toHaveBeenCalled();
  });

  it('keeps a newly created Saved Alarm when native scheduling fails', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
    alarmMechanicsMocks.scheduleAlarmOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('Exact alarm unavailable'), {
        code: 'exact_alarm_unavailable',
      }),
    );

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        soundId: 'default',
        weekdays: [1],
      }),
    ).resolves.toMatchObject({
      hour: 7,
      id: '00000000-0000-4000-8000-000000000001',
      minute: 30,
      weekdays: [1],
    });

    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:saved-alarms',
      JSON.stringify([
        {
          createdAt: '2026-08-17T00:00:00.000Z',
          hour: 7,
          id: '00000000-0000-4000-8000-000000000001',
          isEnabled: true,
          lastFiredLocalDay: null,
          minute: 30,
          soundId: 'default',
          updatedAt: '2026-08-17T00:00:00.000Z',
          weekdays: [1],
        },
      ]),
    );
  });

  it('keeps a Saved Alarm edit when native rescheduling fails', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));
    alarmMechanicsMocks.scheduleAlarmOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('Exact alarm unavailable'), {
        code: 'exact_alarm_unavailable',
      }),
    );

    await expect(
      updateSavedAlarm('alarm-1', {
        hour: 8,
        minute: 45,
        soundId: 'default',
        weekdays: [3],
      }),
    ).resolves.toMatchObject({
      hour: 8,
      minute: 45,
      weekdays: [3],
    });

    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:saved-alarms',
      JSON.stringify([
        {
          ...storedAlarm(),
          hour: 8,
          minute: 45,
          weekdays: [3],
        },
      ]),
    );
  });

  it('keeps a Saved Alarm delete when native cancel fails', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify([storedAlarm()]));
    alarmMechanicsMocks.cancelAlarmOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('Native error'), {
        code: 'native_alarm_error',
      }),
    );

    await expect(deleteSavedAlarm('alarm-1')).resolves.toBeUndefined();

    expect(alarmMechanicsMocks.cancelAlarmOccurrence).toHaveBeenCalledWith(
      'alarm-1',
    );
    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:saved-alarms',
      JSON.stringify([]),
    );
  });

  it('resyncs every enabled Saved Alarm and skips disabled ones', async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify([
        storedAlarm({ id: 'enabled-1', isEnabled: true, weekdays: [1] }),
        storedAlarm({ id: 'disabled-1', isEnabled: false, weekdays: [2] }),
        storedAlarm({ id: 'enabled-2', isEnabled: true, weekdays: [3] }),
      ]),
    );

    await expect(resyncAllScheduledAlarms()).resolves.toBeUndefined();

    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledTimes(
      2,
    );
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'enabled-1',
      expect.any(Number),
      'default',
    );
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'enabled-2',
      expect.any(Number),
      'default',
    );
    expect(alarmMechanicsMocks.cancelAlarmOccurrence).not.toHaveBeenCalled();
  });

  it('BUG: deleting and recreating a fired Saved Alarm no longer bypasses the one-per-day skip', async () => {
    const store = new Map<string, string>([
      [
        'sleepy-face:saved-alarms',
        JSON.stringify([storedAlarm({ lastFiredLocalDay: null })]),
      ],
    ]);
    mocks.getItem.mockImplementation(
      async (key: string) => store.get(key) ?? null,
    );
    mocks.setItem.mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    });
    mocks.removeItem.mockImplementation(async (key: string) => {
      store.delete(key);
    });

    vi.setSystemTime(new Date('2026-08-17T07:30:00.000Z'));
    const now = new Date('2026-08-17T07:30:00.000Z');

    // The alarm rings and the user starts (and presumably finishes) today's attempt.
    const fired = await recordSavedAlarmFired('alarm-1', now);
    expect(alarmWillSkipToday(fired!, now)).toBe(true);

    // User deletes the alarm and recreates an identical one later the same day.
    await deleteSavedAlarm('alarm-1');
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000099',
    );
    const recreated = await createSavedAlarm({
      hour: fired!.hour,
      minute: fired!.minute,
      weekdays: fired!.weekdays,
      soundId: 'default',
    });

    // The one-Daily-Alarm-Attempt-per-day limit must survive delete+recreate.
    expect(alarmWillSkipToday(recreated, now)).toBe(true);
  });

  it('resyncs remaining Saved Alarms even when one fails to schedule', async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify([
        storedAlarm({ id: 'broken', isEnabled: true, weekdays: [1] }),
        storedAlarm({ id: 'ok', isEnabled: true, weekdays: [2] }),
      ]),
    );
    alarmMechanicsMocks.scheduleAlarmOccurrence.mockImplementation(
      async (alarmId: string) => {
        if (alarmId === 'broken') {
          throw Object.assign(new Error('Exact alarm unavailable'), {
            code: 'exact_alarm_unavailable',
          });
        }

        return { alarmId, scheduledFor: 'unused' };
      },
    );

    await expect(resyncAllScheduledAlarms()).resolves.toBeUndefined();

    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'broken',
      expect.any(Number),
      'default',
    );
    expect(alarmMechanicsMocks.scheduleAlarmOccurrence).toHaveBeenCalledWith(
      'ok',
      expect.any(Number),
      'default',
    );
  });
});
