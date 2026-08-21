import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';

export type RegisterPushTokenResult = 'registered' | 'skipped';

export type PushTokenServiceErrorCode =
  'not_authenticated' | 'unexpected_error';

export type NotificationPermissionsProvider = {
  getExpoPushTokenAsync(): Promise<{ data: string }>;
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
};

const expoNotificationsProvider: NotificationPermissionsProvider = {
  getExpoPushTokenAsync: () => Notifications.getExpoPushTokenAsync(),
  getPermissionsAsync: () => Notifications.getPermissionsAsync(),
  requestPermissionsAsync: () => Notifications.requestPermissionsAsync(),
};

export class PushTokenServiceError extends Error {
  constructor(
    public readonly code: PushTokenServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PushTokenServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new PushTokenServiceError(
      'not_authenticated',
      'Push token registration requires an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

// Only asks the OS for permission when it hasn't been decided yet — a prior grant or
// denial is respected as-is, so this never re-prompts the user.
export async function registerPushToken(
  provider: NotificationPermissionsProvider = expoNotificationsProvider,
): Promise<RegisterPushTokenResult> {
  const profileId = await getRequiredProfileId();

  const currentPermissions = await provider.getPermissionsAsync();
  const permissions =
    currentPermissions.status === 'undetermined'
      ? await provider.requestPermissionsAsync()
      : currentPermissions;

  if (permissions.status !== 'granted') {
    return 'skipped';
  }

  const { data: expoPushToken } = await provider.getExpoPushTokenAsync();

  const { error } = await supabase
    .from('profiles')
    .update({ push_token: expoPushToken })
    .eq('id', profileId);

  if (error) {
    throw new PushTokenServiceError(
      'unexpected_error',
      'Could not save the push notification token.',
      error,
    );
  }

  return 'registered';
}
