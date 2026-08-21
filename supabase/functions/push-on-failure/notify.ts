export type FriendRelationRow = {
  profile_id: string;
  friend_profile_id: string;
};

export type FailedProfile = {
  id: string;
  display_name: string;
};

export type FriendPushToken = {
  id: string;
  push_token: string | null;
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
};

export type NotifyDeps = {
  getFailedProfile(profileId: string): Promise<FailedProfile | null>;
  listFriendRelations(profileId: string): Promise<FriendRelationRow[]>;
  listPushTokens(profileIds: string[]): Promise<FriendPushToken[]>;
  sendPush(messages: PushMessage[]): Promise<void>;
};

const FAILURE_PUSH_BODY = 'failed their wake-up challenge 😴';

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
  friendPushTokens: (string | null)[],
): PushMessage[] {
  return friendPushTokens
    .filter((token): token is string => Boolean(token))
    .map((token) => ({
      body: FAILURE_PUSH_BODY,
      title: failedDisplayName,
      to: token,
    }));
}

// Given the profile a new Failure Card was just created for, resolves that profile's
// Friends, builds one push message per friend that has a registered token (friends
// without one are silently skipped), and sends them. Never notifies the failed user's
// own token — friend relations by construction never name the profile as its own friend.
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

  const friendProfiles = await deps.listPushTokens(friendProfileIds);
  const messages = buildFailurePushMessages(
    failedProfile.display_name,
    friendProfiles.map((profile) => profile.push_token),
  );

  if (messages.length > 0) {
    await deps.sendPush(messages);
  }

  return messages;
}
