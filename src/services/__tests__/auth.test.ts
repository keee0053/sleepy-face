import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GoogleLoginError,
  SignOutError,
  coolDownGoogleLogin,
  extractOAuthTokensFromUrl,
  getCurrentUserId,
  onAuthStateChange as subscribeToAuthState,
  signOut,
  startGoogleLogin,
  warmUpGoogleLogin,
} from '../auth';

const mocks = vi.hoisted(() => ({
  coolDownAsync: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  setSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  warmUpAsync: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
      setSession: mocks.setSession,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock('expo-web-browser', () => ({
  coolDownAsync: mocks.coolDownAsync,
  openAuthSessionAsync: mocks.openAuthSessionAsync,
  warmUpAsync: mocks.warmUpAsync,
}));

function expectGoogleLoginError(
  error: unknown,
  code: GoogleLoginError['code'],
) {
  expect(error).toBeInstanceOf(GoogleLoginError);
  expect((error as GoogleLoginError).code).toBe(code);
}

describe('extractOAuthTokensFromUrl', () => {
  it('extracts tokens from hash params', () => {
    expect(
      extractOAuthTokensFromUrl(
        'sleepyface://google-auth#access_token=access&refresh_token=refresh',
      ),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('extracts tokens from query params', () => {
    expect(
      extractOAuthTokensFromUrl(
        'sleepyface://google-auth?access_token=access&refresh_token=refresh',
      ),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('returns null tokens when callback params are missing', () => {
    expect(
      extractOAuthTokensFromUrl('sleepyface://google-auth?error=access_denied'),
    ).toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  it('returns the available refresh token when access token is missing', () => {
    expect(
      extractOAuthTokensFromUrl(
        'sleepyface://google-auth#refresh_token=refresh',
      ),
    ).toEqual({
      accessToken: null,
      refreshToken: 'refresh',
    });
  });

  it('returns the available access token when refresh token is missing', () => {
    expect(
      extractOAuthTokensFromUrl('sleepyface://google-auth#access_token=access'),
    ).toEqual({
      accessToken: 'access',
      refreshToken: null,
    });
  });

  it('returns null tokens for malformed callback URLs', () => {
    expect(extractOAuthTokensFromUrl('not a callback url')).toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  it('ignores provider error params as auth tokens', () => {
    expect(
      extractOAuthTokensFromUrl(
        'sleepyface://google-auth#error=access_denied&error_description=Denied',
      ),
    ).toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });
});

describe('Google Login service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warms and cools the browser session through service helpers', async () => {
    mocks.warmUpAsync.mockResolvedValue(undefined);
    mocks.coolDownAsync.mockResolvedValue(undefined);

    await warmUpGoogleLogin();
    await coolDownGoogleLogin();

    expect(mocks.warmUpAsync).toHaveBeenCalledOnce();
    expect(mocks.coolDownAsync).toHaveBeenCalledOnce();
  });

  it('starts Supabase OAuth, opens the browser, sets the session, and returns Auth User ID', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://example.supabase.co/auth/v1/authorize' },
      error: null,
    });
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'sleepyface://google-auth#access_token=access&refresh_token=refresh',
    });
    mocks.setSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-id' } } },
      error: null,
    });

    await expect(startGoogleLogin()).resolves.toEqual({
      userId: 'auth-user-id',
    });
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'sleepyface://google-auth',
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    expect(mocks.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/authorize',
      'sleepyface://google-auth',
    );
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  it('throws provider_error when Supabase cannot start OAuth', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error('provider failed'),
    });

    await startGoogleLogin().catch((error: unknown) => {
      expectGoogleLoginError(error, 'provider_error');
    });
  });

  it('throws oauth_url_missing when Supabase returns no OAuth URL', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: null,
    });

    await startGoogleLogin().catch((error: unknown) => {
      expectGoogleLoginError(error, 'oauth_url_missing');
    });
  });

  it('throws login_interrupted when the browser session does not succeed', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://example.supabase.co/auth/v1/authorize' },
      error: null,
    });
    mocks.openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });

    await startGoogleLogin().catch((error: unknown) => {
      expectGoogleLoginError(error, 'login_interrupted');
    });
  });

  it('throws missing_auth_tokens when callback tokens are absent', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://example.supabase.co/auth/v1/authorize' },
      error: null,
    });
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'sleepyface://google-auth?error=access_denied',
    });

    await startGoogleLogin().catch((error: unknown) => {
      expectGoogleLoginError(error, 'missing_auth_tokens');
    });
  });

  it('throws session_set_failed when Supabase rejects the callback tokens', async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://example.supabase.co/auth/v1/authorize' },
      error: null,
    });
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'sleepyface://google-auth#access_token=access&refresh_token=refresh',
    });
    mocks.setSession.mockResolvedValue({
      data: { session: null },
      error: new Error('invalid tokens'),
    });

    await startGoogleLogin().catch((error: unknown) => {
      expectGoogleLoginError(error, 'session_set_failed');
    });
  });

  it('throws unexpected_error when an unexpected login failure occurs', async () => {
    mocks.signInWithOAuth.mockRejectedValue(new Error('unexpected failure'));

    await startGoogleLogin().catch((error: unknown) => {
      expectGoogleLoginError(error, 'unexpected_error');
    });
  });

  it('returns current Auth User ID when Supabase has an authenticated user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });

    await expect(getCurrentUserId()).resolves.toBe('auth-user-id');
  });

  it('returns null when there is no current authenticated user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it('signs out through Supabase', async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(signOut()).resolves.toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('throws a typed error when Supabase sign-out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('sign-out failed') });

    await signOut().catch((error: unknown) => {
      expect(error).toBeInstanceOf(SignOutError);
    });
  });

  it('maps auth state changes to Auth User ID presence', () => {
    const unsubscribe = vi.fn();
    mocks.onAuthStateChange.mockImplementation((callback) => {
      callback('SIGNED_IN', { user: { id: 'auth-user-id' } });
      callback('SIGNED_OUT', null);

      return {
        data: {
          subscription: { unsubscribe },
        },
      };
    });
    const callback = vi.fn();

    const subscription = subscribeToAuthState(callback);
    subscription.unsubscribe();

    expect(callback).toHaveBeenNthCalledWith(1, 'auth-user-id');
    expect(callback).toHaveBeenNthCalledWith(2, null);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
