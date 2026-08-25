import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppRegistry, InteractionManager } from 'react-native';

import { resyncAllScheduledAlarms } from '@/services/alarm';
import { getCurrentUserId } from '@/services/auth';
import { getMyProfile } from '@/services/user';
import {
  clearWakeChallengeAttempt,
  getAbandonedWakeChallengeAttemptOutcome,
  getWakeChallengeAttempt,
} from '@/services/wake-challenge-attempt';
import { registerWakeFriendNotificationHandlers } from '@/services/wake-friend-notifications';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans-jp';

const SAVED_ALARM_BOOT_RESYNC_TASK_NAME = 'SavedAlarmBootResync';

SplashScreen.setOptions({
  duration: 300,
  fade: true,
});

AppRegistry.registerHeadlessTask(
  SAVED_ALARM_BOOT_RESYNC_TASK_NAME,
  () => () => resyncAllScheduledAlarms(),
);

const DEV_TEST_ROUTES = new Set([
  '/dev-menu',
  '/alarm-ring-test',
  '/ringing',
  '/timer-test',
]);
const AUTH_ROUTES = new Set(['/signin', '/signup']);
// The Google OAuth redirect (sleepyface://google-auth) lands here before the Supabase
// session is necessarily set — signin.tsx's own handler owns the post-login redirect once
// login actually resolves, so the gate must not race ahead and bounce back to /signin.
const OAUTH_CALLBACK_ROUTE = '/google-auth';

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.has(pathname);
}

function isInitialSetupRoute(pathname: string): boolean {
  return pathname === '/profile-setup';
}

function isIndexRoute(pathname: string): boolean {
  return pathname === '/';
}

function shouldSkipProfileGate(pathname: string): boolean {
  return pathname === OAUTH_CALLBACK_ROUTE || DEV_TEST_ROUTES.has(pathname);
}

let hasCheckedAbandonedWakeChallengeAttempt = false;

async function checkAbandonedWakeChallengeAttempt(
  isStillActive: () => boolean,
) {
  if (hasCheckedAbandonedWakeChallengeAttempt) {
    return;
  }

  hasCheckedAbandonedWakeChallengeAttempt = true;

  const record = await getWakeChallengeAttempt();
  const outcome = getAbandonedWakeChallengeAttemptOutcome(record);

  if (!outcome.abandoned) {
    return;
  }

  await clearWakeChallengeAttempt();

  if (!isStillActive()) {
    return;
  }

  router.replace({
    pathname: '/quiz-failure',
    params: { reason: 'app-quit' },
  });
}

export default function RootLayout() {
  const pathname = usePathname();
  useFonts({
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
    NotoSansJP_700Bold,
  });
  //todo:ロードの完了/未完了を判定して、未完了の場合はローディングを入れる

  useEffect(() => {
    return registerWakeFriendNotificationHandlers();
  }, []);

  useEffect(() => {
    let isActive = true;

    async function protectRoute() {
      await checkAbandonedWakeChallengeAttempt(() => isActive);

      if (!isActive) {
        return;
      }

      if (shouldSkipProfileGate(pathname)) {
        return;
      }

      const authUserId = await getCurrentUserId();

      if (!isActive) {
        return;
      }

      if (!authUserId) {
        if (!isAuthRoute(pathname)) {
          router.replace('/signin');
        }

        return;
      }

      const profile = await getMyProfile();

      if (!isActive) {
        return;
      }

      if (!profile) {
        if (!isInitialSetupRoute(pathname)) {
          router.replace('/profile-setup');
        }

        return;
      }

      if (
        isAuthRoute(pathname) ||
        isInitialSetupRoute(pathname) ||
        isIndexRoute(pathname)
      ) {
        // Home is typically the first screen mounted this session; replacing to it
        // synchronously here can catch Expo Router's native Stack mid-commit and briefly
        // render the built-in "Unmatched Route" screen before it settles (a known upstream
        // timing issue: https://github.com/expo/expo/issues/47687). Defer until after the
        // current interaction/commit settles to avoid the flash.
        InteractionManager.runAfterInteractions(() => {
          if (isActive) {
            router.replace('/home');
          }
        });
      }
    }

    protectRoute().catch(() => {
      if (pathname !== '/signin') {
        router.replace('/signin');
      }
    });

    return () => {
      isActive = false;
    };
  }, [pathname]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
