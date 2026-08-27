import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDevMode, setDevMode, toggleDevMode } from '../dev-mode';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
  },
}));

describe('Dev Mode service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getItem.mockResolvedValue(null);
    mocks.setItem.mockResolvedValue(undefined);
  });

  it('reads disabled when nothing is stored', async () => {
    await expect(getDevMode()).resolves.toBe(false);
  });

  it('reads enabled when the stored flag is true', async () => {
    mocks.getItem.mockResolvedValue('true');

    await expect(getDevMode()).resolves.toBe(true);
  });

  it('reads disabled when the stored flag is false', async () => {
    mocks.getItem.mockResolvedValue('false');

    await expect(getDevMode()).resolves.toBe(false);
  });

  it('persists enabling dev mode', async () => {
    await setDevMode(true);

    expect(mocks.setItem).toHaveBeenCalledWith('sleepy-face:dev-mode', 'true');
  });

  it('persists disabling dev mode', async () => {
    await setDevMode(false);

    expect(mocks.setItem).toHaveBeenCalledWith('sleepy-face:dev-mode', 'false');
  });

  it('toggles from disabled to enabled', async () => {
    mocks.getItem.mockResolvedValue('false');

    await expect(toggleDevMode()).resolves.toBe(true);
    expect(mocks.setItem).toHaveBeenCalledWith('sleepy-face:dev-mode', 'true');
  });

  it('toggles from enabled to disabled', async () => {
    mocks.getItem.mockResolvedValue('true');

    await expect(toggleDevMode()).resolves.toBe(false);
    expect(mocks.setItem).toHaveBeenCalledWith('sleepy-face:dev-mode', 'false');
  });

  // __DEV__ is React Native's real build-type flag (false in any release build,
  // production EAS included) -- these confirm the dev-only shortcuts these functions
  // gate (instant quiz pass/fail, fake block/unblock, mock friends, a test alarm) stay
  // unreachable in a shipped build no matter what's in AsyncStorage.
  describe('in a release build (__DEV__ === false)', () => {
    beforeEach(() => {
      vi.stubGlobal('__DEV__', false);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reads disabled even when AsyncStorage says otherwise', async () => {
      mocks.getItem.mockResolvedValue('true');

      await expect(getDevMode()).resolves.toBe(false);
      expect(mocks.getItem).not.toHaveBeenCalled();
    });

    it('refuses to persist enabling dev mode', async () => {
      await setDevMode(true);

      expect(mocks.setItem).not.toHaveBeenCalled();
    });

    it('refuses to toggle dev mode on', async () => {
      await expect(toggleDevMode()).resolves.toBe(false);
      expect(mocks.setItem).not.toHaveBeenCalled();
    });
  });
});
