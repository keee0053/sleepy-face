import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

const GOOGLE_AUTH_REDIRECT_URL = 'sleepyface://google-auth';

export type GoogleLoginErrorCode =
  | 'provider_error'
  | 'oauth_url_missing'
  | 'login_interrupted'
  | 'missing_auth_tokens'
  | 'session_set_failed'
  | 'unexpected_error';

export class GoogleLoginError extends Error {
  constructor(
    public readonly code: GoogleLoginErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GoogleLoginError';
  }
}

export type GoogleLoginResult = {
  userId: string;
};

export type OAuthTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export function extractOAuthTokensFromUrl(url: string): OAuthTokens {
  try {
    const parsedUrl = new URL(url);
    const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
    const queryParams = parsedUrl.searchParams;

    return {
      accessToken:
        hashParams.get('access_token') ?? queryParams.get('access_token'),
      refreshToken:
        hashParams.get('refresh_token') ?? queryParams.get('refresh_token'),
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
    };
  }
}

export async function warmUpGoogleLogin(): Promise<void> {
  await WebBrowser.warmUpAsync();
}

export async function coolDownGoogleLogin(): Promise<void> {
  await WebBrowser.coolDownAsync();
}

export async function startGoogleLogin(): Promise<GoogleLoginResult> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: GOOGLE_AUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      throw new GoogleLoginError(
        'provider_error',
        'Google Login could not be started.',
        error,
      );
    }

    if (!data.url) {
      throw new GoogleLoginError(
        'oauth_url_missing',
        'Google Login did not return an OAuth URL.',
      );
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.url,
      GOOGLE_AUTH_REDIRECT_URL,
    );

    if (browserResult.type !== 'success') {
      throw new GoogleLoginError(
        'login_interrupted',
        'Google Login was interrupted.',
      );
    }

    const tokens = extractOAuthTokensFromUrl(browserResult.url);

    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new GoogleLoginError(
        'missing_auth_tokens',
        'Google Login completed without auth tokens.',
      );
    }

    const sessionResult = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    if (sessionResult.error) {
      throw new GoogleLoginError(
        'session_set_failed',
        'Google Login could not establish a Supabase session.',
        sessionResult.error,
      );
    }

    const userId = sessionResult.data.session?.user.id;

    if (!userId) {
      throw new GoogleLoginError(
        'session_set_failed',
        'Google Login did not establish an authenticated user.',
      );
    }

    return { userId };
  } catch (error) {
    if (error instanceof GoogleLoginError) {
      throw error;
    }

    throw new GoogleLoginError(
      'unexpected_error',
      'Google Login failed unexpectedly.',
      error,
    );
  }
}

export class SignOutError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SignOutError';
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new SignOutError('Sign out failed.', error);
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user?.id ?? null;
}

export function onAuthStateChange(callback: (userId: string | null) => void): {
  unsubscribe: () => void;
} {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user.id ?? null);
  });

  return {
    unsubscribe: () => subscription.unsubscribe(),
  };
}
