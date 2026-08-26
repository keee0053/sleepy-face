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

// Deliberately data-only (no title/body) -- on Android, a push carrying a `notification`
// payload only reaches the app's JS via a tap once backgrounded/killed (the OS just shows
// it directly instead), which is why the alarm used to fail to fire unless the app was
// already open. A data-only message is always delivered to
// registerWakeFriendNotificationHandlers's background task regardless of app state, which
// schedules the alarm and posts its own local notification for the "you were woken" banner.
export type PushMessage = {
  to: string;
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
  // Marks every one of the target Profile's still-unconsumed Failure Log Entries
  // activated, not just the one named by entryId -- a Profile can rack up more than one
  // unconsumed entry in a day (e.g. failing the Wake Up Challenge more than once before
  // being woken), and activating their alarm once should resolve all of them, or the
  // target would immediately reappear as an activatable Wake Friend Target for their
  // other entries.
  markActivated(targetProfileId: string, now: Date): Promise<void>;
  setPendingQuestionCount(
    targetProfileId: string,
    questionCount: number | null,
  ): Promise<void>;
  setPendingActivatedBy(
    targetProfileId: string,
    activatedByDisplayName: string,
  ): Promise<void>;
  listPushTokens(profileId: string): Promise<PushTokenRow[]>;
  sendPush(messages: PushMessage[]): Promise<void>;
};

const ENTRY_VALIDITY_WINDOW_MS = 30 * 60 * 1000;

// Kept in sync with MIN/MAX_QUIZ_QUESTION_COUNT in src/services/alarm.ts.
const MIN_QUIZ_QUESTION_COUNT = 5;
const MAX_QUIZ_QUESTION_COUNT = 30;

export function isValidQuestionCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_QUIZ_QUESTION_COUNT &&
    value <= MAX_QUIZ_QUESTION_COUNT
  );
}

// A Failure Log Entry is only valid to activate for 30 minutes after it was logged --
// listWakeFriendTargets in src/services/wake-friends.ts already filters to the same
// rolling window for display, but that alone isn't trustworthy server-side (a stale or
// tampered request could still name an old entryId directly).
function isWithinValidityWindow(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= ENTRY_VALIDITY_WINDOW_MS;
}

export function buildWakeFriendPushMessages(
  failureEntryId: string,
  activatedByDisplayName: string,
  tokens: string[],
): PushMessage[] {
  return tokens.map((token) => ({
    data: {
      activatedByDisplayName,
      failureEntryId,
      type: 'wake-friend-activate',
    },
    priority: 'high',
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
  questionCount: number | null = null,
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

  const requesterProfile = await deps.getRequesterProfile(requesterProfileId);
  const activatedByDisplayName = requesterProfile?.display_name ?? '友達';

  await deps.markActivated(entry.profile_id, now);
  await deps.setPendingQuestionCount(entry.profile_id, questionCount);
  await deps.setPendingActivatedBy(entry.profile_id, activatedByDisplayName);

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
