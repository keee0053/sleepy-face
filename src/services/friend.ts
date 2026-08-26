import { supabase } from '@/lib/supabase';
import { listBlockedProfileIds } from '@/services/moderation';
import { toProfileIconId, type ProfileIconId } from '@/services/user';

export type FriendSearchProfile = {
  id: string;
  userId: string;
  displayName: string;
  iconId: ProfileIconId;
  createdAt: string;
};

export type FriendRelationStatus = 'pending' | 'accepted';

export type FriendRelation = {
  id: string;
  profileId: string;
  friendProfileId: string;
  status: FriendRelationStatus;
  createdAt: string;
};

export type FriendProfile = FriendSearchProfile & {
  relationId: string;
};

// A pending relation the viewer sent (profileId === viewer) or received
// (friendProfileId === viewer) — see resolveFriendProfileId for which side `id`/profile
// fields describe the OTHER person.
export type FriendRequest = FriendSearchProfile & {
  relationId: string;
};

export type FriendServiceErrorCode =
  'not_authenticated' | 'self_relation' | 'already_friend' | 'unexpected_error';

type ProfileSearchRow = {
  id: string;
  user_id: string;
  display_name: string;
  icon_url: string | null;
  created_at: string;
};

type FriendRelationRow = {
  id: string;
  profile_id: string;
  friend_profile_id: string;
  status: string;
  created_at: string;
};

const FRIEND_SEARCH_MIN_LENGTH = 2;
const FRIEND_SEARCH_LIMIT = 20;

export class FriendServiceError extends Error {
  constructor(
    public readonly code: FriendServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FriendServiceError';
  }
}

export function normalizeFriendSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function escapePostgrestSearchValue(value: string): string {
  return value.replace(/[%,()]/g, '').replace(/_/g, '\\_');
}

function mapProfile(row: ProfileSearchRow): FriendSearchProfile {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    iconId: toProfileIconId(row.icon_url),
    id: row.id,
    userId: row.user_id,
  };
}

export function resolveFriendProfileId(
  relation: FriendRelation,
  profileId: string,
): string {
  return relation.profileId === profileId
    ? relation.friendProfileId
    : relation.profileId;
}

function isFriendRelationStatus(value: string): value is FriendRelationStatus {
  return value === 'pending' || value === 'accepted';
}

function mapFriendRelation(row: FriendRelationRow): FriendRelation {
  return {
    createdAt: row.created_at,
    friendProfileId: row.friend_profile_id,
    id: row.id,
    profileId: row.profile_id,
    status: isFriendRelationStatus(row.status) ? row.status : 'pending',
  };
}

function mapFriendServiceError(error: unknown): FriendServiceError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;

  if (code === '23505') {
    return new FriendServiceError(
      'already_friend',
      'Friend relation already exists.',
      error,
    );
  }

  if (code === '23514') {
    return new FriendServiceError(
      'self_relation',
      'Cannot add yourself as a friend.',
      error,
    );
  }

  return new FriendServiceError(
    'unexpected_error',
    'Friend operation failed unexpectedly.',
    error,
  );
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new FriendServiceError(
      'not_authenticated',
      'Friend operations require an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

export async function searchProfiles(
  query: string,
): Promise<FriendSearchProfile[]> {
  const profileId = await getRequiredProfileId();
  const normalizedQuery = normalizeFriendSearchQuery(query);

  if (normalizedQuery.length < FRIEND_SEARCH_MIN_LENGTH) {
    return [];
  }

  const searchValue = escapePostgrestSearchValue(normalizedQuery.toLowerCase());
  const blockedProfileIds = await listBlockedProfileIds();

  // Public User IDの前方一致のみで探す。自分自身とブロック済みのユーザーは候補から外す。
  let profileQuery = supabase
    .from('profiles')
    .select('id, user_id, display_name, icon_url, created_at')
    .ilike('user_id', `${searchValue}%`)
    .neq('id', profileId);

  if (blockedProfileIds.length > 0) {
    profileQuery = profileQuery.not(
      'id',
      'in',
      `(${blockedProfileIds.join(',')})`,
    );
  }

  const { data, error } = await profileQuery.limit(FRIEND_SEARCH_LIMIT);

  if (error) {
    throw mapFriendServiceError(error);
  }

  return (data ?? []).map(mapProfile);
}

export async function listFriendRelations(): Promise<FriendRelation[]> {
  const profileId = await getRequiredProfileId();

  const { data, error } = await supabase
    .from('friends_relations')
    .select('id, profile_id, friend_profile_id, status, created_at')
    .or(`profile_id.eq.${profileId},friend_profile_id.eq.${profileId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw mapFriendServiceError(error);
  }

  return (data ?? []).map(mapFriendRelation);
}

// Fetches the profile for the OTHER party of each given relation (relative to
// viewerProfileId), pairing each one back up with its relationId.
async function loadProfilesForRelations(
  relations: FriendRelation[],
  viewerProfileId: string,
): Promise<FriendProfile[]> {
  const otherProfileIds = relations.map((relation) =>
    resolveFriendProfileId(relation, viewerProfileId),
  );

  if (otherProfileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, display_name, icon_url, created_at')
    .in('id', otherProfileIds);

  if (error) {
    throw mapFriendServiceError(error);
  }

  const relationByOtherProfileId = new Map(
    relations.map((relation) => [
      resolveFriendProfileId(relation, viewerProfileId),
      relation,
    ]),
  );

  return (data ?? []).map((row) => {
    const profile = mapProfile(row);
    const relation = relationByOtherProfileId.get(profile.id);

    return {
      ...profile,
      relationId: relation?.id ?? '',
    };
  });
}

export async function listFriends(): Promise<FriendProfile[]> {
  const profileId = await getRequiredProfileId();
  const relations = await listFriendRelations();

  return loadProfilesForRelations(
    relations.filter((relation) => relation.status === 'accepted'),
    profileId,
  );
}

// Requests sent TO the viewer, awaiting the viewer's approval.
export async function listIncomingFriendRequests(): Promise<FriendRequest[]> {
  const profileId = await getRequiredProfileId();
  const relations = await listFriendRelations();

  return loadProfilesForRelations(
    relations.filter(
      (relation) =>
        relation.status === 'pending' && relation.friendProfileId === profileId,
    ),
    profileId,
  );
}

// Requests the viewer sent, still awaiting the other side's approval.
export async function listOutgoingFriendRequests(): Promise<FriendRequest[]> {
  const profileId = await getRequiredProfileId();
  const relations = await listFriendRelations();

  return loadProfilesForRelations(
    relations.filter(
      (relation) =>
        relation.status === 'pending' && relation.profileId === profileId,
    ),
    profileId,
  );
}

export async function addFriend(
  friendProfileId: string,
): Promise<FriendRelation> {
  const profileId = await getRequiredProfileId();

  if (profileId === friendProfileId) {
    throw new FriendServiceError(
      'self_relation',
      'Cannot add yourself as a friend.',
    );
  }

  const { data, error } = await supabase
    .from('friends_relations')
    .insert({
      friend_profile_id: friendProfileId,
      profile_id: profileId,
    })
    .select('id, profile_id, friend_profile_id, status, created_at')
    .single();

  if (error) {
    throw mapFriendServiceError(error);
  }

  return mapFriendRelation(data);
}

// Only the recipient of a pending request may accept it (enforced by RLS — see
// 2026-08-25_friend_requests.sql).
export async function acceptFriendRequest(
  relationId: string,
): Promise<FriendRelation> {
  const { data, error } = await supabase
    .from('friends_relations')
    .update({ status: 'accepted' })
    .eq('id', relationId)
    .select('id, profile_id, friend_profile_id, status, created_at')
    .single();

  if (error) {
    throw mapFriendServiceError(error);
  }

  return mapFriendRelation(data);
}

// Removes a relation outright — declining an incoming request, canceling one the viewer
// sent, or unfriending an already-accepted relation.
export async function declineFriendRequest(relationId: string): Promise<void> {
  const { error } = await supabase
    .from('friends_relations')
    .delete()
    .eq('id', relationId);

  if (error) {
    throw mapFriendServiceError(error);
  }
}
