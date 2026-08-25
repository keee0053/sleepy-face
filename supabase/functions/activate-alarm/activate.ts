export type FailureLogEntryRow = {
  id: string;
  profile_id: string;
  created_at: string;
  activated_at: string | null;
};

export type FriendRelationRow = {
  profile_id: string;
  friend_profile_id: string;
};

export type RequesterProfile = {
  display_name: string;
};

export type PushTokenRow = {
  token: string;
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: {
    type: 'wake-friend-activate';
    failureEntryId: string;
    activatedByDisplayName: string;
  };
  priority: 'high';
};

export type ActivateWakeFriendAlarmErrorCode =
  | 'entry_not_found'
  | 'cannot_activate_own_entry'
  | 'not_friends'
  | 'entry_expired';

export class ActivateWakeFriendAlarmError extends Error {
  constructor(
    public readonly code: ActivateWakeFriendAlarmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ActivateWakeFriendAlarmError';
  }
}

export type ActivateWakeFriendAlarmResult =
  | { status: 'activated'; notifiedTokenCount: number }
  | { status: 'already_activated' };

export type ActivateWakeFriendAlarmDeps = {
  getEntry(entryId: string): Promise<FailureLogEntryRow | null>;
  getRequesterProfile(
    requesterProfileId: string,
  ): Promise<RequesterProfile | null>;
  isFriend(
    requesterProfileId: string,
    targetProfileId: string,
  ): Promise<boolean>;
  markActivated(entryId: string, now: Date): Promise<void>;
  listPushTokens(profileId: string): Promise<PushTokenRow[]>;
  sendPush(messages: PushMessage[]): Promise<void>;
};

const ENTRY_VALIDITY_WINDOW_MS = 24 * 60 * 60 * 1000;

// A Failure Log Entry is only valid to activate for 24 hours after it was logged --
// listWakeFriendTargets in src/services/wake-friends.ts already filters to the client's
// local "today" for display, but that alone isn't trustworthy server-side (a stale or
// tampered request could still name an old entryId directly). A rolling 24h window
// avoids the ambiguity of "same calendar day" across the requester's and target's
// different local timezones.
function isWithinValidityWindow(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= ENTRY_VALIDITY_WINDOW_MS;
}

export function buildWakeFriendPushMessages(
  failureEntryId: string,
  activatedByDisplayName: string,
  tokens: string[],
): PushMessage[] {
  return tokens.map((token) => ({
    body: `${activatedByDisplayName}があなたのアラームを鳴らしました。`,
    data: {
      activatedByDisplayName,
      failureEntryId,
      type: 'wake-friend-activate',
    },
    priority: 'high',
    title: '起こしてもらいました！',
    to: token,
  }));
}

// Marks a Failure Log Entry activated and pushes a wake-friend-activate notification to
// every device the target Profile has registered. The receiving app treats that push as
// an instruction to ring the local alarm immediately (see
// src/services/wake-friend-notifications.ts), the same way any other locally-scheduled
// alarm rings -- this function only ever gets that ring started, it never rings anything
// itself.
export async function activateWakeFriendAlarm(
  entryId: string,
  requesterProfileId: string,
  deps: ActivateWakeFriendAlarmDeps,
  now: Date = new Date(),
): Promise<ActivateWakeFriendAlarmResult> {
  const entry = await deps.getEntry(entryId);

  if (!entry) {
    throw new ActivateWakeFriendAlarmError(
      'entry_not_found',
      'No Failure Log Entry exists for that ID.',
    );
  }

  if (entry.activated_at) {
    return { status: 'already_activated' };
  }

  if (entry.profile_id === requesterProfileId) {
    throw new ActivateWakeFriendAlarmError(
      'cannot_activate_own_entry',
      'A user cannot activate their own Failure Log Entry.',
    );
  }

  if (!isWithinValidityWindow(new Date(entry.created_at), now)) {
    throw new ActivateWakeFriendAlarmError(
      'entry_expired',
      'This Failure Log Entry is no longer from today.',
    );
  }

  const isFriend = await deps.isFriend(requesterProfileId, entry.profile_id);

  if (!isFriend) {
    throw new ActivateWakeFriendAlarmError(
      'not_friends',
      'Only a Friend of the failed Profile may activate this entry.',
    );
  }

  await deps.markActivated(entryId, now);

  const requesterProfile = await deps.getRequesterProfile(requesterProfileId);
  const activatedByDisplayName = requesterProfile?.display_name ?? '友達';
  const tokenRows = await deps.listPushTokens(entry.profile_id);
  const messages = buildWakeFriendPushMessages(
    entryId,
    activatedByDisplayName,
    tokenRows.map((row) => row.token),
  );

  if (messages.length > 0) {
    await deps.sendPush(messages);
  }

  return { status: 'activated', notifiedTokenCount: messages.length };
}
