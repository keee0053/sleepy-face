import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AlarmServiceError,
  clearSavedAlarms,
  createSavedAlarm,
  deleteSavedAlarm,
  getNextAlarmOccurrence,
  listSavedAlarms,
  setSavedAlarmEnabled,
  updateSavedAlarm,
  type SavedAlarm,
} from '../alarm';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    removeItem: mocks.removeItem,
    setItem: mocks.setItem,
  },
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
    minute: 30,
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
      }),
    ).resolves.toEqual({
      createdAt: '2026-08-17T00:00:00.000Z',
      hour: 7,
      id: '00000000-0000-4000-8000-000000000001',
      isEnabled: true,
      minute: 30,
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
          minute: 30,
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
      }),
    ).resolves.toEqual({
      createdAt: '2026-08-17T00:00:00.000Z',
      hour: 8,
      id: 'alarm-1',
      isEnabled: true,
      minute: 45,
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
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 60,
        weekdays: [1],
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [],
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [1, 1],
      }),
    ).rejects.toMatchObject({ code: 'invalid_alarm_input' });

    await expect(
      createSavedAlarm({
        hour: 7,
        minute: 30,
        weekdays: [7],
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
});
