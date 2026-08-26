import { requireOptionalNativeModule } from 'expo-modules-core';

export type AndroidAlarmMechanicsErrorCode =
  | 'already_ringing'
  | 'exact_alarm_unavailable'
  | 'native_alarm_error'
  | 'notification_permission_denied'
  | 'unsupported_platform';

export type NotificationPermissionStatus =
  'denied' | 'granted' | 'undetermined';

export type RingingAlarmSchedule = {
  alarmId: string;
  scheduledFor: string;
};

export type RingingAlarmState = {
  alarmId: string;
  startedAt: string;
};

type NativeAndroidAlarmMechanicsModule = {
  cancelSavedAlarmOccurrence(alarmId: string): Promise<void>;
  cancelScheduledTestAlarm(): Promise<void>;
  canScheduleExactAlarms(): Promise<boolean>;
  getNotificationPermissionStatus(): Promise<NotificationPermissionStatus>;
  getRingingAlarmState(): Promise<RingingAlarmState | null>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  requestNotificationPermission(): Promise<NotificationPermissionStatus>;
  scheduleSavedAlarmOccurrence(
    alarmId: string,
    triggerAtMillis: number,
    soundId: string | null,
  ): Promise<RingingAlarmSchedule>;
  scheduleTestAlarmAfterSeconds(
    seconds: number,
    soundId: string | null,
  ): Promise<RingingAlarmSchedule>;
  stopRingingAlarm(): Promise<void>;
};

const TEST_ALARM_DELAY_SECONDS = 20;

const nativeModule =
  requireOptionalNativeModule<NativeAndroidAlarmMechanicsModule>(
    'AndroidAlarmMechanics',
  );

export class AndroidAlarmMechanicsError extends Error {
  constructor(
    public readonly code: AndroidAlarmMechanicsErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AndroidAlarmMechanicsError';
  }
}

function getNativeModule(): NativeAndroidAlarmMechanicsModule {
  if (!nativeModule) {
    throw new AndroidAlarmMechanicsError(
      'unsupported_platform',
      'Android Alarm Mechanics are only available in the native Android app.',
    );
  }

  return nativeModule;
}

function isKnownErrorCode(
  code: unknown,
): code is AndroidAlarmMechanicsErrorCode {
  return (
    code === 'already_ringing' ||
    code === 'exact_alarm_unavailable' ||
    code === 'native_alarm_error' ||
    code === 'notification_permission_denied' ||
    code === 'unsupported_platform'
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Android Alarm Mechanics failed.';
}

function toAndroidAlarmMechanicsError(
  error: unknown,
): AndroidAlarmMechanicsError {
  if (error instanceof AndroidAlarmMechanicsError) {
    return error;
  }

  const maybeCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;

  return new AndroidAlarmMechanicsError(
    isKnownErrorCode(maybeCode) ? maybeCode : 'native_alarm_error',
    getErrorMessage(error),
    error,
  );
}

async function callNative<T>(
  operation: (module: NativeAndroidAlarmMechanicsModule) => Promise<T>,
): Promise<T> {
  try {
    return await operation(getNativeModule());
  } catch (error) {
    throw toAndroidAlarmMechanicsError(error);
  }
}

export function canScheduleExactAlarms(): Promise<boolean> {
  return callNative((module) => module.canScheduleExactAlarms());
}

export function openExactAlarmSettings(): Promise<void> {
  return callNative((module) => module.openExactAlarmSettings());
}

export function isIgnoringBatteryOptimizations(): Promise<boolean> {
  return callNative((module) => module.isIgnoringBatteryOptimizations());
}

export function requestIgnoreBatteryOptimizations(): Promise<void> {
  return callNative((module) => module.requestIgnoreBatteryOptimizations());
}

export function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  return callNative((module) => module.getNotificationPermissionStatus());
}

export function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  return callNative((module) => module.requestNotificationPermission());
}

export function scheduleTestAlarm(
  soundId: string | null = null,
): Promise<RingingAlarmSchedule> {
  return callNative((module) =>
    module.scheduleTestAlarmAfterSeconds(TEST_ALARM_DELAY_SECONDS, soundId),
  );
}

export function cancelScheduledTestAlarm(): Promise<void> {
  return callNative((module) => module.cancelScheduledTestAlarm());
}

export function getRingingAlarmState(): Promise<RingingAlarmState | null> {
  return callNative((module) => module.getRingingAlarmState());
}

export function scheduleAlarmOccurrence(
  alarmId: string,
  triggerAtMillis: number,
  soundId: string | null = null,
): Promise<RingingAlarmSchedule> {
  return callNative((module) =>
    module.scheduleSavedAlarmOccurrence(alarmId, triggerAtMillis, soundId),
  );
}

export function cancelAlarmOccurrence(alarmId: string): Promise<void> {
  return callNative((module) => module.cancelSavedAlarmOccurrence(alarmId));
}

export function stopRingingAlarm(): Promise<void> {
  return callNative((module) => module.stopRingingAlarm());
}

export type EnsureAlarmPermissionsResult =
  | { granted: true }
  | {
      granted: false;
      reason:
        | 'exact_alarm_unavailable'
        | 'notification_permission_denied'
        | 'battery_optimization_enabled';
    };

// Requested last, after the two blocking permissions: unlike those, being excluded from
// battery optimization doesn't stop an alarm this device already knows about from
// firing (AlarmManager.setAlarmClock is Doze-exempt on its own) -- it only affects how
// promptly a wake-friend push (see wake-friend-notifications.ts) reaches this device to
// schedule that alarm in the first place, so it's presented as one more step rather
// than a hard blocker.
export async function ensureAlarmPermissions(): Promise<EnsureAlarmPermissionsResult> {
  const notificationStatus = await getNotificationPermissionStatus();

  if (notificationStatus !== 'granted') {
    const nextNotificationStatus = await requestNotificationPermission();

    if (nextNotificationStatus !== 'granted') {
      return { granted: false, reason: 'notification_permission_denied' };
    }
  }

  if (!(await canScheduleExactAlarms())) {
    await openExactAlarmSettings();
    return { granted: false, reason: 'exact_alarm_unavailable' };
  }

  if (!(await isIgnoringBatteryOptimizations())) {
    await requestIgnoreBatteryOptimizations();
    return { granted: false, reason: 'battery_optimization_enabled' };
  }

  return { granted: true };
}
