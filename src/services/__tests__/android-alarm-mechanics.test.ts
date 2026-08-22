import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockNativeAndroidAlarmMechanicsModule = {
  cancelSavedAlarmOccurrence: ReturnType<typeof vi.fn>;
  cancelScheduledTestAlarm: ReturnType<typeof vi.fn>;
  canScheduleExactAlarms: ReturnType<typeof vi.fn>;
  getNotificationPermissionStatus: ReturnType<typeof vi.fn>;
  getRingingAlarmState: ReturnType<typeof vi.fn>;
  openExactAlarmSettings: ReturnType<typeof vi.fn>;
  requestNotificationPermission: ReturnType<typeof vi.fn>;
  scheduleSavedAlarmOccurrence: ReturnType<typeof vi.fn>;
  scheduleTestAlarmAfterSeconds: ReturnType<typeof vi.fn>;
  stopRingingAlarm: ReturnType<typeof vi.fn>;
};

const nativeModule: MockNativeAndroidAlarmMechanicsModule = {
  cancelSavedAlarmOccurrence: vi.fn(),
  cancelScheduledTestAlarm: vi.fn(),
  canScheduleExactAlarms: vi.fn(),
  getNotificationPermissionStatus: vi.fn(),
  getRingingAlarmState: vi.fn(),
  openExactAlarmSettings: vi.fn(),
  requestNotificationPermission: vi.fn(),
  scheduleSavedAlarmOccurrence: vi.fn(),
  scheduleTestAlarmAfterSeconds: vi.fn(),
  stopRingingAlarm: vi.fn(),
};

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: vi.fn(() => nativeModule),
}));

describe('Android Alarm Mechanics service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks exact alarm access and opens exact alarm settings', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.canScheduleExactAlarms.mockResolvedValue(true);
    await expect(androidAlarmMechanics.canScheduleExactAlarms()).resolves.toBe(
      true,
    );
    expect(nativeModule.canScheduleExactAlarms).toHaveBeenCalledTimes(1);

    nativeModule.openExactAlarmSettings.mockResolvedValue(undefined);
    await expect(
      androidAlarmMechanics.openExactAlarmSettings(),
    ).resolves.toBeUndefined();
    expect(nativeModule.openExactAlarmSettings).toHaveBeenCalledTimes(1);
  });

  it('checks and requests notification permission status', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.getNotificationPermissionStatus.mockResolvedValue('denied');
    await expect(
      androidAlarmMechanics.getNotificationPermissionStatus(),
    ).resolves.toBe('denied');

    nativeModule.requestNotificationPermission.mockResolvedValue('granted');
    await expect(
      androidAlarmMechanics.requestNotificationPermission(),
    ).resolves.toBe('granted');
  });

  it('schedules a test alarm for 20 seconds and returns the schedule result', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');
    const schedule = {
      alarmId: 'test-alarm-1',
      scheduledFor: '2026-08-17T00:00:20.000Z',
    };

    nativeModule.scheduleTestAlarmAfterSeconds.mockResolvedValue(schedule);

    await expect(androidAlarmMechanics.scheduleTestAlarm()).resolves.toEqual(
      schedule,
    );
    expect(nativeModule.scheduleTestAlarmAfterSeconds).toHaveBeenCalledWith(
      20,
      null,
    );
  });

  it('maps native already-ringing errors to typed service errors', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.scheduleTestAlarmAfterSeconds.mockRejectedValue(
      Object.assign(new Error('Already ringing'), {
        code: 'already_ringing',
      }),
    );

    await expect(
      androidAlarmMechanics.scheduleTestAlarm(),
    ).rejects.toMatchObject({
      code: 'already_ringing',
      name: 'AndroidAlarmMechanicsError',
    });
  });

  it('maps native exact-alarm errors to typed service errors', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.scheduleTestAlarmAfterSeconds.mockRejectedValue(
      Object.assign(new Error('Exact alarm unavailable'), {
        code: 'exact_alarm_unavailable',
      }),
    );

    await expect(
      androidAlarmMechanics.scheduleTestAlarm(),
    ).rejects.toMatchObject({
      code: 'exact_alarm_unavailable',
    });
  });

  it('exposes cancel, ringing state, and stop as native calls', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');
    const ringingState = {
      alarmId: 'test-alarm-1',
      startedAt: '2026-08-17T00:00:20.000Z',
    };

    nativeModule.cancelScheduledTestAlarm.mockResolvedValue(undefined);
    await expect(
      androidAlarmMechanics.cancelScheduledTestAlarm(),
    ).resolves.toBeUndefined();

    nativeModule.getRingingAlarmState.mockResolvedValue(ringingState);
    await expect(androidAlarmMechanics.getRingingAlarmState()).resolves.toEqual(
      ringingState,
    );

    nativeModule.stopRingingAlarm.mockResolvedValue(undefined);
    await expect(
      androidAlarmMechanics.stopRingingAlarm(),
    ).resolves.toBeUndefined();
  });

  it('schedules a saved alarm occurrence at an exact time and returns the schedule result', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');
    const schedule = {
      alarmId: 'saved-alarm-1',
      scheduledFor: '2026-08-21T07:00:00.000Z',
    };

    nativeModule.scheduleSavedAlarmOccurrence.mockResolvedValue(schedule);

    await expect(
      androidAlarmMechanics.scheduleAlarmOccurrence(
        'saved-alarm-1',
        1755756000000,
      ),
    ).resolves.toEqual(schedule);
    expect(nativeModule.scheduleSavedAlarmOccurrence).toHaveBeenCalledWith(
      'saved-alarm-1',
      1755756000000,
      null,
    );
  });

  it('schedules multiple saved alarm occurrences independently by id', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.scheduleSavedAlarmOccurrence.mockImplementation(
      async (alarmId: string, triggerAtMillis: number) => ({
        alarmId,
        scheduledFor: new Date(triggerAtMillis).toISOString(),
      }),
    );

    await expect(
      androidAlarmMechanics.scheduleAlarmOccurrence('alarm-a', 1000),
    ).resolves.toEqual({
      alarmId: 'alarm-a',
      scheduledFor: new Date(1000).toISOString(),
    });
    await expect(
      androidAlarmMechanics.scheduleAlarmOccurrence('alarm-b', 2000),
    ).resolves.toEqual({
      alarmId: 'alarm-b',
      scheduledFor: new Date(2000).toISOString(),
    });

    expect(nativeModule.scheduleSavedAlarmOccurrence).toHaveBeenNthCalledWith(
      1,
      'alarm-a',
      1000,
      null,
    );
    expect(nativeModule.scheduleSavedAlarmOccurrence).toHaveBeenNthCalledWith(
      2,
      'alarm-b',
      2000,
      null,
    );
  });

  it('maps native errors when scheduling a saved alarm occurrence', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.scheduleSavedAlarmOccurrence.mockRejectedValue(
      Object.assign(new Error('Exact alarm unavailable'), {
        code: 'exact_alarm_unavailable',
      }),
    );

    await expect(
      androidAlarmMechanics.scheduleAlarmOccurrence('saved-alarm-1', 1000),
    ).rejects.toMatchObject({
      code: 'exact_alarm_unavailable',
      name: 'AndroidAlarmMechanicsError',
    });
  });

  it('cancels a saved alarm occurrence by id, succeeding as a no-op when nothing is scheduled', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.cancelSavedAlarmOccurrence.mockResolvedValue(undefined);

    await expect(
      androidAlarmMechanics.cancelAlarmOccurrence('saved-alarm-1'),
    ).resolves.toBeUndefined();
    expect(nativeModule.cancelSavedAlarmOccurrence).toHaveBeenCalledWith(
      'saved-alarm-1',
    );
  });

  it('reports permissions already granted without prompting', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.getNotificationPermissionStatus.mockResolvedValue('granted');
    nativeModule.canScheduleExactAlarms.mockResolvedValue(true);

    await expect(
      androidAlarmMechanics.ensureAlarmPermissions(),
    ).resolves.toEqual({ granted: true });
    expect(nativeModule.requestNotificationPermission).not.toHaveBeenCalled();
    expect(nativeModule.openExactAlarmSettings).not.toHaveBeenCalled();
  });

  it('requests notification permission when missing, then checks exact alarm access', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.getNotificationPermissionStatus.mockResolvedValue(
      'undetermined',
    );
    nativeModule.requestNotificationPermission.mockResolvedValue('granted');
    nativeModule.canScheduleExactAlarms.mockResolvedValue(true);

    await expect(
      androidAlarmMechanics.ensureAlarmPermissions(),
    ).resolves.toEqual({ granted: true });
    expect(nativeModule.requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('reports notification_permission_denied and skips the exact-alarm check when denied', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.getNotificationPermissionStatus.mockResolvedValue('denied');
    nativeModule.requestNotificationPermission.mockResolvedValue('denied');

    await expect(
      androidAlarmMechanics.ensureAlarmPermissions(),
    ).resolves.toEqual({
      granted: false,
      reason: 'notification_permission_denied',
    });
    expect(nativeModule.canScheduleExactAlarms).not.toHaveBeenCalled();
  });

  it('opens exact alarm settings and reports exact_alarm_unavailable when unavailable', async () => {
    const androidAlarmMechanics = await import('../android-alarm-mechanics');

    nativeModule.getNotificationPermissionStatus.mockResolvedValue('granted');
    nativeModule.canScheduleExactAlarms.mockResolvedValue(false);
    nativeModule.openExactAlarmSettings.mockResolvedValue(undefined);

    await expect(
      androidAlarmMechanics.ensureAlarmPermissions(),
    ).resolves.toEqual({
      granted: false,
      reason: 'exact_alarm_unavailable',
    });
    expect(nativeModule.openExactAlarmSettings).toHaveBeenCalledTimes(1);
  });
});
