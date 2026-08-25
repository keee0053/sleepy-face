import * as Notifications from 'expo-notifications';

import { scheduleTestAlarm } from '@/services/android-alarm-mechanics';

const WAKE_FRIEND_ACTIVATE_TYPE = 'wake-friend-activate';

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

function isWakeFriendActivateData(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === WAKE_FRIEND_ACTIVATE_TYPE
  );
}

// A friend "activating" this device's alarm (src/app/wake-friends.tsx on their end,
// supabase/functions/activate-alarm on the server) arrives here as an ordinary push
// notification carrying a data.type marker -- there is no separate "remote alarm"
// mechanism on-device, this just rings the same local test-alarm path the dev-menu's
// テストアラーム button already uses.
async function handleWakeFriendActivateData(data: unknown): Promise<void> {
  if (!isWakeFriendActivateData(data)) {
    return;
  }

  await scheduleTestAlarm(null).catch(() => {});
}

// Registered once from the app root (see src/app/_layout.tsx). Covers two delivery
// paths:
//   - Foreground: the notification arrives while the app is already open, so ringing
//     starts immediately.
//   - Background/killed: only fires once the user taps the notification and the app
//     launches/resumes -- there is no reliable way to run this while fully backgrounded
//     without a native background-notification handler, so a tap is the floor here,
//     matching this app's existing best-effort tolerance for background alarm behavior.
export function registerWakeFriendNotificationHandlers(): () => void {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (event) => {
      handleWakeFriendActivateData(event.request.content.data).catch(() => {});
    },
  );

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((event) => {
      handleWakeFriendActivateData(
        event.notification.request.content.data,
      ).catch(() => {});
    });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
