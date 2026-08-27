import AsyncStorage from '@react-native-async-storage/async-storage';

const DEV_MODE_STORAGE_KEY = 'sleepy-face:dev-mode';

// __DEV__ is React Native's own dev-vs-release build flag (true for a debug/dev-client
// build, false for any release build, EAS production included) -- unlike
// isDevUserId(profile?.userId) in profile.tsx, which just checks whether the user's
// public ID happens to contain "dev" and is trivially chosen by anyone, this is a real
// build-time guarantee. Without it, the debug shortcuts these functions gate (instant
// quiz pass/fail, fake block/unblock, mock friends, a 20s test alarm) would be reachable
// in the shipped app by anyone who picks a userId containing "dev".
export async function getDevMode(): Promise<boolean> {
  if (!__DEV__) {
    return false;
  }

  const storedValue = await AsyncStorage.getItem(DEV_MODE_STORAGE_KEY);

  return storedValue === 'true';
}

export async function setDevMode(isEnabled: boolean): Promise<void> {
  if (!__DEV__) {
    return;
  }

  await AsyncStorage.setItem(DEV_MODE_STORAGE_KEY, String(isEnabled));
}

export async function toggleDevMode(): Promise<boolean> {
  if (!__DEV__) {
    return false;
  }

  const nextValue = !(await getDevMode());

  await setDevMode(nextValue);

  return nextValue;
}
