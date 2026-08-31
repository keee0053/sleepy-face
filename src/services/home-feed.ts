import { supabase } from '@/lib/supabase';
import { listFriendRelations, resolveFriendProfileId } from '@/services/friend';
import {
  isReactionEmoji,
  REACTION_EMOJIS,
  type ReactionEmoji,
} from '@/services/photo-reactions';
import { toProfileIconValue } from '@/services/user';

export type ReactionEmojiGroup = {
  emoji: ReactionEmoji;
  count: number;
};

export type FriendsFeedItem = {
  photoId: string;
  imageUrl: string;
  createdAt: string;
  profileId: string;
  displayName: string;
  // Either a preset icon identifier or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
  reactionCount: number;
  viewerReactionEmoji: ReactionEmoji | null;
  // Every reaction (including the viewer's own), grouped by emoji, for the badge row
  // shown next to the ReactionButton.
  reactionGroups: ReactionEmojiGroup[];
  commentCount: number;
};

export type HomeFeedServiceErrorCode = 'not_authenticated' | 'unexpected_error';

const FEED_QUERY_LIMIT = 200;

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

type ReactionRow = {
  photo_id: string;
  profile_id: string;
  emoji: string;
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

// Friends Feed items are the viewer's own and their friends' uploaded Failure Cards,
// newest first.
export async function listFriendsFeed(): Promise<FriendsFeedItem[]> {
  const profileId = await getRequiredProfileId();
  const relations = await listFriendRelations();

  const friendProfileIds = relations
    .filter((relation) => relation.status === 'accepted')
    .map((relation) => resolveFriendProfileId(relation, profileId));
  // Includes the viewer's own posts alongside their friends', not just friends'.
  const feedProfileIds = [...friendProfileIds, profileId];

  const { data: photoRows, error: photoError } = await supabase
    .from('photos')
    .select('id, image_url, created_at, profile_id')
    .in('profile_id', feedProfileIds)
    .order('created_at', { ascending: false })
    // Defense in depth: photos already age out after 14 days (see
    // delete-old-photos), so this normally never binds, but caps the query in case
    // that cleanup ever lags or a viewer has an unusually large/active friend group.
    .limit(FEED_QUERY_LIMIT);

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
    .in('id', feedProfileIds);

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

  const { data: reactionRows, error: reactionError } = await supabase
    .from('photo_reactions')
    .select('photo_id, profile_id, emoji')
    .in('photo_id', photoIds);

  if (reactionError) {
    throw mapHomeFeedError(reactionError);
  }

  const reactionCountByPhotoId = new Map<string, number>();
  const viewerEmojiByPhotoId = new Map<string, ReactionEmoji>();
  // Keyed by emoji, counting every reactor including the viewer -- the viewer's own pick
  // should be reflected in its emoji's tally, not hidden from it (only the ReactionButton
  // itself is the "this is your own reaction" indicator).
  const reactionEmojiCountsByPhotoId = new Map<
    string,
    Map<ReactionEmoji, number>
  >();

  for (const reaction of (reactionRows ?? []) as ReactionRow[]) {
    reactionCountByPhotoId.set(
      reaction.photo_id,
      (reactionCountByPhotoId.get(reaction.photo_id) ?? 0) + 1,
    );

    if (!isReactionEmoji(reaction.emoji)) {
      continue;
    }

    if (reaction.profile_id === profileId) {
      viewerEmojiByPhotoId.set(reaction.photo_id, reaction.emoji);
    }

    const emojiCounts =
      reactionEmojiCountsByPhotoId.get(reaction.photo_id) ??
      new Map<ReactionEmoji, number>();
    emojiCounts.set(reaction.emoji, (emojiCounts.get(reaction.emoji) ?? 0) + 1);
    reactionEmojiCountsByPhotoId.set(reaction.photo_id, emojiCounts);
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
    const emojiCounts = reactionEmojiCountsByPhotoId.get(photo.id);
    const reactionGroups: ReactionEmojiGroup[] = emojiCounts
      ? REACTION_EMOJIS.filter((emoji) => emojiCounts.has(emoji)).map(
          (emoji) => ({ count: emojiCounts.get(emoji)!, emoji }),
        )
      : [];

    return {
      commentCount: commentCountByPhotoId.get(photo.id) ?? 0,
      createdAt: photo.created_at,
      displayName: profile?.display_name ?? '不明なユーザー',
      iconId: toProfileIconValue(profile?.icon_url),
      imageUrl: photo.image_url,
      photoId: photo.id,
      profileId: photo.profile_id,
      reactionCount: reactionCountByPhotoId.get(photo.id) ?? 0,
      reactionGroups,
      viewerReactionEmoji: viewerEmojiByPhotoId.get(photo.id) ?? null,
    };
  });
}
