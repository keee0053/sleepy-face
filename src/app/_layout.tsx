import { Stack, router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { getCurrentUserId } from '@/services/auth';
import { getMyProfile } from '@/services/user';

const DEV_INDEX_ROUTE = '/';
const DEV_TEST_ROUTES = new Set([
  '/alarm-ring-test',
  '/ringing',
  '/timer-test',
]);
const AUTH_ROUTES = new Set(['/signin', '/signup']);

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.has(pathname);
}

function isInitialSetupRoute(pathname: string): boolean {
  return pathname === '/profile-setup';
}

function shouldSkipProfileGate(pathname: string): boolean {
  return pathname === DEV_INDEX_ROUTE || DEV_TEST_ROUTES.has(pathname);
}

export default function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    let isActive = true;

    async function protectRoute() {
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

      if (isAuthRoute(pathname)) {
        router.replace('/home');
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
