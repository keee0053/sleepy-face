// A "help me" push: purely a message to one or more Friends, with no side effects on
// any other table (no failure_log_entries, no alarm scheduling, no approval step). The
// receiving Friend decides entirely for themselves whether and when to act on it --
// e.g. by using the existing Wake Friend "鳴らす" feature once the requester actually
// shows up as failed (see src/services/wake-friends.ts), which this function never
// touches.
export type RequesterProfile = {
  display_name: string;
};

export type PushTokenRow = {
  profile_id: string;
  token: string;
};

// A normal (title+body) push, unlike wake-friend's data-only one -- there's no
// time-critical automatic action tied to this arriving (see
// WakeFriendFirebaseMessagingService.kt's doc comment for why THAT one needs to survive
// an app-killed state reliably); a help request is just a message to read soon, so the
// OS's own notification display is enough.
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: {
    type: 'help-request';
    requesterProfileId: string;
  };
  priority: 'high';
};

export const MAX_HELP_REQUEST_MESSAGE_LENGTH = 200;

export type SendHelpRequestErrorCode =
  'invalid_message' | 'no_recipients' | 'no_valid_friends';

export class SendHelpRequestError extends Error {
  constructor(
    public readonly code: SendHelpRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SendHelpRequestError';
  }
}

export type SendHelpRequestDeps = {
  listFriendProfileIds(requesterProfileId: string): Promise<string[]>;
  getRequesterProfile(
    requesterProfileId: string,
  ): Promise<RequesterProfile | null>;
  listPushTokens(profileIds: string[]): Promise<PushTokenRow[]>;
  sendPush(messages: PushMessage[]): Promise<void>;
};

export type SendHelpRequestResult = {
  notifiedFriendCount: number;
  notifiedTokenCount: number;
};

export function buildHelpRequestPushMessages(
  requesterProfileId: string,
  requesterDisplayName: string,
  message: string,
  tokens: string[],
): PushMessage[] {
  return tokens.map((token) => ({
    body: message,
    data: {
      requesterProfileId,
      type: 'help-request',
    },
    priority: 'high',
    title: requesterDisplayName,
    to: token,
  }));
}

export async function sendHelpRequest(
  requesterProfileId: string,
  friendProfileIds: string[],
  message: string,
  deps: SendHelpRequestDeps,
): Promise<SendHelpRequestResult> {
  const trimmedMessage = message.trim();

  if (
    trimmedMessage.length === 0 ||
    trimmedMessage.length > MAX_HELP_REQUEST_MESSAGE_LENGTH
  ) {
    throw new SendHelpRequestError(
      'invalid_message',
      `Message must be 1 to ${MAX_HELP_REQUEST_MESSAGE_LENGTH} characters.`,
    );
  }

  const uniqueRequestedIds = [...new Set(friendProfileIds)];

  if (uniqueRequestedIds.length === 0) {
    throw new SendHelpRequestError(
      'no_recipients',
      'At least one Friend must be selected.',
    );
  }

  // Never trust the client's own idea of who its Friends are -- re-derive the
  // requester's actual Friend list server-side and only notify the intersection.
  const actualFriendIds = new Set(
    await deps.listFriendProfileIds(requesterProfileId),
  );
  const validFriendIds = uniqueRequestedIds.filter((id) =>
    actualFriendIds.has(id),
  );

  if (validFriendIds.length === 0) {
    throw new SendHelpRequestError(
      'no_valid_friends',
      'None of the selected Profiles are Friends.',
    );
  }

  const requesterProfile = await deps.getRequesterProfile(requesterProfileId);
  const requesterDisplayName = requesterProfile?.display_name ?? '友達';
  const tokenRows = await deps.listPushTokens(validFriendIds);
  const messages = buildHelpRequestPushMessages(
    requesterProfileId,
    requesterDisplayName,
    trimmedMessage,
    tokenRows.map((row) => row.token),
  );

  if (messages.length > 0) {
    await deps.sendPush(messages);
  }

  return {
    notifiedFriendCount: validFriendIds.length,
    notifiedTokenCount: messages.length,
  };
}
