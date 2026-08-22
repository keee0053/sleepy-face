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

  // Upserts by token, not by profile: a token identifies an app install, so if the same
  // install re-registers under a different profile (e.g. a new user logs in on this
  // device), the row is reassigned to the current profile rather than duplicated.
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { profile_id: profileId, token: expoPushToken },
      { onConflict: 'token' },
    );

  if (error) {
    throw new PushTokenServiceError(
      'unexpected_error',
      'Could not save the push notification token.',
      error,
    );
  }

  return 'registered';
}
