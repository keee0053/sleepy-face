export type FailureLogEntryOwner = {
  profile_id: string;
};

export type PushTokenRow = {
  profile_id: string;
  token: string;
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: { type: 'alarm-activation' };
};

export type ActivateAlarmDeps = {
  // Atomically marks the entry activated (activated_at/activated_by set) only if it is
  // not already activated, returning its owner. Returns null when the entry is already
  // activated or does not exist -- this single conditional update is what makes two
  // near-simultaneous calls on the same entry unable to both succeed.
  markActivated(
    entryId: string,
    activatedBy: string,
  ): Promise<FailureLogEntryOwner | null>;
  listPushTokens(profileId: string): Promise<PushTokenRow[]>;
  sendPush(messages: PushMessage[]): Promise<void>;
};

export type ActivateAlarmOutcome =
  | { status: 'activated'; messages: PushMessage[] }
  | { status: 'already-activated-or-not-found' };

const ACTIVATION_PUSH_TITLE = 'Wake up!';
const ACTIVATION_PUSH_BODY = 'A friend is activating your alarm 📣';

export function buildActivationPushMessages(tokens: string[]): PushMessage[] {
  return tokens.map((token) => ({
    body: ACTIVATION_PUSH_BODY,
    data: { type: 'alarm-activation' },
    title: ACTIVATION_PUSH_TITLE,
    to: token,
  }));
}

// Given a Failure Log Entry id and the activating Friend's profile id, consumes the
// entry (see markActivated) and pushes an activation-payload message to every device
// registered to the entry's owner. Sends nothing when the entry was already consumed,
// doesn't exist, or the owner has no registered devices.
export async function activateAlarm(
  entryId: string,
  activatedByProfileId: string,
  deps: ActivateAlarmDeps,
): Promise<ActivateAlarmOutcome> {
  const owner = await deps.markActivated(entryId, activatedByProfileId);

  if (!owner) {
    return { status: 'already-activated-or-not-found' };
  }

  const tokenRows = await deps.listPushTokens(owner.profile_id);
  const messages = buildActivationPushMessages(
    tokenRows.map((row) => row.token),
  );

  if (messages.length > 0) {
    await deps.sendPush(messages);
  }

  return { messages, status: 'activated' };
}
