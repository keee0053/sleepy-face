import { supabase } from '@/lib/supabase';

export type DeleteAccountErrorCode = 'not_authenticated' | 'unexpected_error';

export class DeleteAccountError extends Error {
  constructor(
    public readonly code: DeleteAccountErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DeleteAccountError';
  }
}

// Permanently deletes the signed-in user's account: their auth user, profile, photos
// (DB rows + Storage objects), comments, reactions, friend relations, push tokens, and
// wake-related logs (see supabase/functions/delete-account). Required by Google Play's
// User Data policy, which mandates in-app account deletion for apps that support
// account creation. Does not sign the user out locally -- callers should do that
// themselves once this resolves, since the session is no longer valid either way.
export async function deleteAccount(): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new DeleteAccountError(
      'not_authenticated',
      'Account deletion requires an authenticated user.',
      userError,
    );
  }

  const { error } = await supabase.functions.invoke('delete-account');

  if (error) {
    throw new DeleteAccountError(
      'unexpected_error',
      'Could not delete the account.',
      error,
    );
  }
}
