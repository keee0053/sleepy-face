import { supabase } from '@/lib/supabase';
import { listFriendRelations, resolveFriendProfileId } from '@/services/friend';
import {
  listPhotoRealMojis,
  type PhotoRealMoji,
} from '@/services/photo-realmojis';
import { toProfileIconValue } from '@/services/user';

export type FriendsFeedItem = {
  photoId: string;
  imageUrl: string;
  createdAt: string;
  profileId: string;
  displayName: string;
  // Either a preset icon identifier or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
  realMojis: PhotoRealMoji[];
  commentCount: number;
};

export type HomeFeedServiceErrorCode = 'not_authenticated' | 'unexpected_error';

type PhotoRow = {
  id: string;
  image_url: string;
  created_at: string;
  profile_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  icon_url: string | null;
};

type CommentCountRow = {
  photo_id: string;
};

export class HomeFeedServiceError extends Error {
  constructor(
    public readonly code: HomeFeedServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HomeFeedServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new HomeFeedServiceError(
      'not_authenticated',
      'The Friends Feed requires an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

function mapHomeFeedError(error: unknown): HomeFeedServiceError {
  return new HomeFeedServiceError(
    'unexpected_error',
    'Could not load the Friends Feed.',
    error,
  );
}

// Friends Feed items are the friends' own uploaded Failure Cards, newest first.
export async function listFriendsFeed(): Promise<FriendsFeedItem[]> {
  const profileId = await getRequiredProfileId();
  const relations = await listFriendRelations();

  const friendProfileIds = relations.map((relation) =>
    resolveFriendProfileId(relation, profileId),
  );

  if (friendProfileIds.length === 0) {
    return [];
  }

  const { data: photoRows, error: photoError } = await supabase
    .from('photos')
    .select('id, image_url, created_at, profile_id')
    .in('profile_id', friendProfileIds)
    .order('created_at', { ascending: false });

  if (photoError) {
    throw mapHomeFeedError(photoError);
  }

  const photos = (photoRows ?? []) as PhotoRow[];

  if (photos.length === 0) {
    return [];
  }

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, icon_url')
    .in('id', friendProfileIds);

  if (profileError) {
    throw mapHomeFeedError(profileError);
  }

  const profileById = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const photoIds = photos.map((photo) => photo.id);

  let realMojis: PhotoRealMoji[];

  try {
    realMojis = await listPhotoRealMojis(photoIds);
  } catch (error) {
    throw mapHomeFeedError(error);
  }

  const realMojisByPhotoId = new Map<string, PhotoRealMoji[]>();

  for (const realMoji of realMojis) {
    const photoRealMojis = realMojisByPhotoId.get(realMoji.photoId) ?? [];
    photoRealMojis.push(realMoji);
    realMojisByPhotoId.set(realMoji.photoId, photoRealMojis);
  }

  const { data: commentRows, error: commentError } = await supabase
    .from('comments')
    .select('photo_id')
    .in('photo_id', photoIds);

  if (commentError) {
    throw mapHomeFeedError(commentError);
  }

  const commentCountByPhotoId = new Map<string, number>();

  for (const comment of (commentRows ?? []) as CommentCountRow[]) {
    commentCountByPhotoId.set(
      comment.photo_id,
      (commentCountByPhotoId.get(comment.photo_id) ?? 0) + 1,
    );
  }

  return photos.map((photo) => {
    const profile = profileById.get(photo.profile_id);

    return {
      commentCount: commentCountByPhotoId.get(photo.id) ?? 0,
      createdAt: photo.created_at,
      displayName: profile?.display_name ?? '不明なユーザー',
      iconId: toProfileIconValue(profile?.icon_url),
      imageUrl: photo.image_url,
      photoId: photo.id,
      profileId: photo.profile_id,
      realMojis: realMojisByPhotoId.get(photo.id) ?? [],
    };
  });
}
