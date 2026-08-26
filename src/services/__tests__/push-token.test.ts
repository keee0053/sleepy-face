import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PushTokenServiceError, registerPushToken } from '../push-token';

const mocks = vi.hoisted(() => ({
  getExpoPushTokenAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  getUser: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    rpc: mocks.rpc,
  },
}));

vi.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

function expectServiceError(
  error: unknown,
  code: PushTokenServiceError['code'],
) {
  expect(error).toBeInstanceOf(PushTokenServiceError);
  expect((error as PushTokenServiceError).code).toBe(code);
}

const provider = {
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  getPermissionsAsync: mocks.getPermissionsAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
};

describe('push token service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it('requests permission and registers the token when already granted', async () => {
    mockAuthenticatedUser();
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token-1' });

    await expect(registerPushToken(provider)).resolves.toBe('registered');

    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_token', {
      p_token: 'expo-token-1',
    });
  });

  it('requests permission when undetermined, then registers on grant', async () => {
    mockAuthenticatedUser();
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mocks.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token-2' });

    await expect(registerPushToken(provider)).resolves.toBe('registered');

    expect(mocks.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_token', {
      p_token: 'expo-token-2',
    });
  });

  it('skips without writing when the user denies permission', async () => {
    mockAuthenticatedUser();
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mocks.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(registerPushToken(provider)).resolves.toBe('skipped');

    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('skips without re-prompting when already denied', async () => {
    mockAuthenticatedUser();
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(registerPushToken(provider)).resolves.toBe('skipped');

    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires authentication before requesting permission', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await registerPushToken(provider).catch((error: unknown) => {
      expectServiceError(error, 'not_authenticated');
    });
    expect(mocks.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('wraps a Supabase error while saving the token', async () => {
    mockAuthenticatedUser();
    mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'expo-token-3' });
    mocks.rpc.mockResolvedValue({ error: new Error('boom') });

    await registerPushToken(provider).catch((error: unknown) => {
      expectServiceError(error, 'unexpected_error');
    });
  });
});
