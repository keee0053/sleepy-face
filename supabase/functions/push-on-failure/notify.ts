export type FriendRelationRow = {
  profile_id: string;
  friend_profile_id: string;
};

export type FailedProfile = {
  id: string;
  display_name: string;
};

export type PushTokenRow = {
  profile_id: string;
  token: string;
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
};

export type NotifyDeps = {
  getFailedProfile(profileId: string): Promise<FailedProfile | null>;
  listFriendRelations(profileId: string): Promise<FriendRelationRow[]>;
  listPushTokens(profileIds: string[]): Promise<PushTokenRow[]>;
  sendPush(messages: PushMessage[]): Promise<void>;
};

const FAILURE_PUSH_BODY = 'failed their wake-up challenge 😴';

// A failed query must not be treated the same as "no rows" — a DB/RLS error masquerading
// as an empty result silently drops real notifications. Callers pass their Supabase
// `{ data, error }` pair straight through; `error` always wins even if `data` is present.
export function unwrapRowsOrThrow<T>(
  data: T[] | null,
  error: unknown,
  message: string,
): T[] {
  if (error) {
    throw new Error(message, { cause: error });
  }

  return data ?? [];
}

// Same policy as unwrapRowsOrThrow, for a single-row lookup (e.g. `.maybeSingle()`) where
// a null result legitimately means "no such row" rather than "no rows in a list."
export function unwrapRowOrThrow<T>(
  data: T | null,
  error: unknown,
  message: string,
): T | null {
  if (error) {
    throw new Error(message, { cause: error });
  }

  return data;
}

// Mirrors the app's friend.ts resolveFriendProfileId: a friends_relations row names
// both sides of the mutual relation, so the "other" profile depends on which side
// the failed profile is on.
export function resolveFriendProfileId(
  relation: FriendRelationRow,
  profileId: string,
): string {
  return relation.profile_id === profileId
    ? relation.friend_profile_id
    : relation.profile_id;
}

export function buildFailurePushMessages(
  failedDisplayName: string,
  tokens: string[],
): PushMessage[] {
  return tokens.map((token) => ({
    body: FAILURE_PUSH_BODY,
    title: failedDisplayName,
    to: token,
  }));
}

// Given the profile a new Failure Card was just created for, resolves that profile's
// Friends, builds one push message per registered device token across those friends
// (a friend with several devices gets notified on each; a friend with none is silently
// skipped, since there's no row for them), and sends them. Never notifies the failed
// user's own token — friend relations by construction never name the profile as its own
// friend.
export async function notifyFriendsOfFailure(
  failedProfileId: string,
  deps: NotifyDeps,
): Promise<PushMessage[]> {
  const failedProfile = await deps.getFailedProfile(failedProfileId);

  if (!failedProfile) {
    return [];
  }

  const relations = await deps.listFriendRelations(failedProfileId);
  const friendProfileIds = relations.map((relation) =>
    resolveFriendProfileId(relation, failedProfileId),
  );

  if (friendProfileIds.length === 0) {
    return [];
  }

  const tokenRows = await deps.listPushTokens(friendProfileIds);
  const messages = buildFailurePushMessages(
    failedProfile.display_name,
    tokenRows.map((row) => row.token),
  );

  if (messages.length > 0) {
    await deps.sendPush(messages);
  }

  return messages;
}
