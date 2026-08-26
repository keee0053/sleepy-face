import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { scheduleTestAlarm } from '@/services/android-alarm-mechanics';

const WAKE_FRIEND_ACTIVATE_TYPE = 'wake-friend-activate';

// Named per Expo's background-notification-task convention (registerTaskAsync). Must be
// defined at module scope, not inside a component/effect -- expo-task-manager can invoke
// it headlessly (no React tree, no app already running) when a push arrives while the
// app is backgrounded or fully killed, same as AppRegistry.registerHeadlessTask's
// SavedAlarmBootResync task in _layout.tsx, and that only works if the task is already
// known to the native side before any such headless launch.
const BACKGROUND_NOTIFICATION_TASK = 'wake-friend-background-notification-task';

// expo-notifications requires a handler to be set before it will show a notification
// (or even deliver its data) while the app is in the foreground -- without this, a
// wake-friend-activate push arriving while the screen is open is silently dropped.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type WakeFriendActivateData = {
  type: typeof WAKE_FRIEND_ACTIVATE_TYPE;
  failureEntryId: string;
  activatedByDisplayName: string;
};

function isWakeFriendActivateData(
  data: unknown,
): data is WakeFriendActivateData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === WAKE_FRIEND_ACTIVATE_TYPE
  );
}

// A friend "activating" this device's alarm (src/app/wake-friends.tsx on their end,
// supabase/functions/activate-alarm on the server) arrives here as a data-only push --
// there is no separate "remote alarm" mechanism on-device, this just rings the same
// local test-alarm path the dev-menu's テストアラーム button already uses. The push
// itself carries no title/body (see activate.ts), so the "someone woke you" banner is
// posted here instead of relying on the OS to auto-display it.
async function handleWakeFriendActivateData(data: unknown): Promise<void> {
  if (!isWakeFriendActivateData(data)) {
    return;
  }

  await scheduleTestAlarm(null).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    content: {
      body: `${data.activatedByDisplayName}があなたのアラームを鳴らしました。`,
      title: '起こしてもらいました！',
    },
    trigger: null,
  }).catch(() => {});
}

// The task payload is either a NotificationResponse (the user tapped a notification --
// not relevant here, this push never shows an OS-level notification of its own) or the
// raw remote message, whose `data` field carries every FCM data entry as a string
// (see expo-notifications' RemoteMessageSerializer on Android).
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (
      error ||
      !data ||
      typeof data !== 'object' ||
      'actionIdentifier' in data
    ) {
      return;
    }

    await handleWakeFriendActivateData((data as { data?: unknown }).data).catch(
      () => {},
    );
  },
);

// Registered once from the app root (see src/app/_layout.tsx). Unlike a plain JS
// notification listener, a registered background-notification task keeps firing
// regardless of whether the app is foregrounded, backgrounded, or fully killed --
// Android delivers a data-only push to it either way, which is the whole reason the
// push was made data-only rather than a title/body notification (see activate.ts).
// Startup can race with the headless JS bundle load right after a fresh push wakes the
// app from fully killed ("No task registered for key expo-task-manager" in logcat when
// it loses that race) -- best-effort, matching this app's existing tolerance for
// background alarm behavior; it reliably wins the race once the process is already warm
// (foregrounded or recently backgrounded).
export function registerWakeFriendNotificationHandlers(): () => void {
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});

  return () => {
    // Intentionally a no-op: the task must keep running for the lifetime of the app
    // install (including while this screen/component isn't mounted at all), not just
    // while whatever effect called this is active.
  };
}
