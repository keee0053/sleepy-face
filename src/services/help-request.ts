import { supabase } from '@/lib/supabase';

export type HelpRequestServiceErrorCode =
  'invalid_message' | 'no_recipients' | 'no_valid_friends' | 'unexpected_error';

export class HelpRequestServiceError extends Error {
  constructor(
    public readonly code: HelpRequestServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HelpRequestServiceError';
  }
}

// A "help me" push to one or more Friends -- see send-help-request Edge Function for
// why this has no other side effect (no failure_log_entries, no alarm scheduling): the
// receiving Friend decides for themselves whether and when to act on it, e.g. via the
// existing Wake Friend "鳴らす" feature once the requester actually shows up as failed.
export async function sendHelpRequest(
  friendProfileIds: string[],
  message: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('send-help-request', {
    body: { friendProfileIds, message },
  });

  if (error) {
    throw new HelpRequestServiceError(
      'unexpected_error',
      'Could not send the help request.',
      error,
    );
  }
}
