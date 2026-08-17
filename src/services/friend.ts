import { supabase } from '@/lib/supabase';

export type FriendSearchProfile = {
  id: string;
  userId: string;
  displayName: string;
  iconUrl: string | null;
  createdAt: string;
};

export type FriendRelation = {
  id: string;
  profileId: string;
  friendProfileId: string;
  createdAt: string;
};

export type FriendProfile = FriendSearchProfile & {
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
    iconUrl: row.icon_url,
    id: row.id,
    userId: row.user_id,
  };
}

function mapFriendRelation(row: FriendRelationRow): FriendRelation {
  return {
    createdAt: row.created_at,
    friendProfileId: row.friend_profile_id,
    id: row.id,
    profileId: row.profile_id,
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

  // Public User IDは前方一致、表示名は部分一致で探す。自分自身は候補から外す。
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, display_name, icon_url, created_at')
    .or(`user_id.ilike.${searchValue}%,display_name.ilike.%${searchValue}%`)
    .neq('id', profileId)
    .limit(FRIEND_SEARCH_LIMIT);

  if (error) {
    throw mapFriendServiceError(error);
  }

  return (data ?? []).map(mapProfile);
}

export async function listFriendRelations(): Promise<FriendRelation[]> {
  const profileId = await getRequiredProfileId();

  const { data, error } = await supabase
    .from('friends_relations')
    .select('id, profile_id, friend_profile_id, created_at')
    .or(`profile_id.eq.${profileId},friend_profile_id.eq.${profileId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw mapFriendServiceError(error);
  }

  return (data ?? []).map(mapFriendRelation);
}

export async function listFriends(): Promise<FriendProfile[]> {
  const profileId = await getRequiredProfileId();
  const relations = await listFriendRelations();
  const friendProfileIds = relations.map((relation) =>
    relation.profileId === profileId
      ? relation.friendProfileId
      : relation.profileId,
  );

  if (friendProfileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, display_name, icon_url, created_at')
    .in('id', friendProfileIds);

  if (error) {
    throw mapFriendServiceError(error);
  }

  const relationByFriendProfileId = new Map(
    relations.map((relation) => [
      relation.profileId === profileId
        ? relation.friendProfileId
        : relation.profileId,
      relation,
    ]),
  );

  return (data ?? []).map((row) => {
    const profile = mapProfile(row);
    const relation = relationByFriendProfileId.get(profile.id);

    return {
      ...profile,
      relationId: relation?.id ?? '',
    };
  });
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
    .select('id, profile_id, friend_profile_id, created_at')
    .single();

  if (error) {
    throw mapFriendServiceError(error);
  }

  return mapFriendRelation(data);
}
