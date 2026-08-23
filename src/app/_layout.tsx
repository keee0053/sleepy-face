import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import {
  AppRegistry,
  AppState,
  InteractionManager,
  LogBox,
} from 'react-native';

import { resyncAllScheduledAlarms } from '@/services/alarm';
import { consumePendingWakeChallengeRoute } from '@/services/android-alarm-mechanics';
import { getCurrentUserId } from '@/services/auth';
import { getMyProfile } from '@/services/user';
import {
  clearWakeChallengeAttempt,
  getAbandonedWakeChallengeAttemptOutcome,
  getWakeChallengeAttempt,
  startWakeChallengeAttempt,
} from '@/services/wake-challenge-attempt';

const SAVED_ALARM_BOOT_RESYNC_TASK_NAME = 'SavedAlarmBootResync';

SplashScreen.setOptions({
  duration: 300,
  fade: true,
});

// supabase-js's own auto-refresh timer logs this to console.error whenever a token
// refresh races a locked Keychain (e.g. the app opening from a locked-screen alarm
// alert) -- our SecureStore adapter already treats that as "no saved session" and
// recovers, so this is expected noise, not a real crash. Left unignored it pops a
// full-screen LogBox in dev builds that can visually block whatever screen just
// navigated in behind it.
LogBox.ignoreLogs(['Auto refresh tick failed with error']);

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

// Checks the native pending-wake-challenge flag before anything else -- this is a
// fast local read (no network), and every second spent on the auth/profile checks
// first is a second the app can sit on /home instead of the photo screen right
// after the user taps 起床確認 on the lock screen alert.
async function routePendingWakeChallengeIfReady(
  isStillActive: () => boolean,
): Promise<boolean> {
  const pendingWakeChallenge = await consumePendingWakeChallengeRoute().catch(
    () => null,
  );

  if (!isStillActive() || !pendingWakeChallenge) {
    return false;
  }

  const authUserId = await getCurrentUserId();

  if (!isStillActive() || !authUserId) {
    return false;
  }

  const profile = await getMyProfile();

  if (!isStillActive() || !profile) {
    return false;
  }

  await startWakeChallengeAttempt({ alarmId: pendingWakeChallenge.alarmId });

  router.replace({
    pathname: '/face-check',
    params: {
      alarmId: pendingWakeChallenge.alarmId,
      badPhotoAttempts: '0',
      startedAt: pendingWakeChallenge.startedAt,
    },
  });

  return true;
}

export default function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    let isActive = true;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }

      routePendingWakeChallengeIfReady(() => isActive).catch(() => {});
    });

    // AlarmKit's secondary-button intent (起床確認) can fire while the app is
    // already in the foreground -- e.g. testing a Test Alarm without ever leaving
    // the app. In that case the AppState listener above never sees a transition to
    // 'active' (it was already active) and no navigation happens to change
    // `pathname` either, so nothing triggers a check. Poll while mounted as a
    // low-cost fallback (one local UserDefaults/SharedPreferences read per tick).
    const pollIntervalId = setInterval(() => {
      routePendingWakeChallengeIfReady(() => isActive).catch(() => {});
    }, 1000);

    return () => {
      isActive = false;
      subscription.remove();
      clearInterval(pollIntervalId);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function protectRoute() {
      await checkAbandonedWakeChallengeAttempt(() => isActive);

      if (!isActive) {
        return;
      }

      // Checked before the profile gate below: a fast local read (no network), so a
      // pending wake challenge gets to /face-check as soon as possible instead of
      // waiting behind the auth/profile round trip every other route goes through.
      const pendingWakeChallenge =
        await consumePendingWakeChallengeRoute().catch(() => null);

      if (!isActive) {
        return;
      }

      if (pendingWakeChallenge) {
        const authUserId = await getCurrentUserId();

        if (!isActive || !authUserId) {
          return;
        }

        const profile = await getMyProfile();

        if (!isActive || !profile) {
          return;
        }

        await startWakeChallengeAttempt({
          alarmId: pendingWakeChallenge.alarmId,
        });

        router.replace({
          pathname: '/face-check',
          params: {
            alarmId: pendingWakeChallenge.alarmId,
            badPhotoAttempts: '0',
            startedAt: pendingWakeChallenge.startedAt,
          },
        });
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
