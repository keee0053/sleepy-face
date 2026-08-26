import { supabase } from '@/lib/supabase';
import { toProfileIconValue } from '@/services/user';

export const REACTION_EMOJIS = ['😂', '🤣', '😍', '😮', '😢', '👍'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

export type PhotoReactionDetail = {
  profileId: string;
  displayName: string;
  // Either a preset icon identifier or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
  emoji: ReactionEmoji;
  isOwn: boolean;
};

export type PhotoReactionServiceErrorCode =
  'not_authenticated' | 'unexpected_error';

export class PhotoReactionServiceError extends Error {
  constructor(
    public readonly code: PhotoReactionServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PhotoReactionServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new PhotoReactionServiceError(
      'not_authenticated',
      'Reacting to a photo requires an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

// Who reacted with what, for a "see who reacted" list and for the Photo Detail screen's
// own reaction button state (unlike the Home feed, it doesn't already have this joined
// in from listFriendsFeed).
export async function listPhotoReactions(
  photoId: string,
): Promise<PhotoReactionDetail[]> {
  const viewerProfileId = await getRequiredProfileId();

  const { data, error } = await supabase
    .from('photo_reactions')
    .select('profile_id, emoji')
    .eq('photo_id', photoId);

  if (error) {
    throw new PhotoReactionServiceError(
      'unexpected_error',
      'Could not load photo reactions.',
      error,
    );
  }

  const rows = (data ?? []) as { profile_id: string; emoji: string }[];

  if (rows.length === 0) {
    return [];
  }

  const profileIds = [...new Set(rows.map((row) => row.profile_id))];

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, icon_url')
    .in('id', profileIds);

  if (profileError) {
    throw new PhotoReactionServiceError(
      'unexpected_error',
      'Could not load the reactors.',
      profileError,
    );
  }

  const profileById = new Map(
    (
      (profileRows ?? []) as {
        id: string;
        display_name: string;
        icon_url: string | null;
      }[]
    ).map((profile) => [profile.id, profile]),
  );

  return rows.map((row) => {
    const profile = profileById.get(row.profile_id);

    return {
      displayName: profile?.display_name ?? '不明なユーザー',
      emoji: isReactionEmoji(row.emoji) ? row.emoji : REACTION_EMOJIS[0],
      iconId: toProfileIconValue(profile?.icon_url),
      isOwn: row.profile_id === viewerProfileId,
      profileId: row.profile_id,
    };
  });
}

// One reaction per (photo, profile) — picking a different emoji overwrites the viewer's
// existing reaction rather than adding a second one.
export async function setPhotoReaction(
  photoId: string,
  emoji: ReactionEmoji,
): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase
    .from('photo_reactions')
    .upsert(
      { emoji, photo_id: photoId, profile_id: profileId },
      { onConflict: 'photo_id,profile_id' },
    );

  if (error) {
    throw new PhotoReactionServiceError(
      'unexpected_error',
      'Could not set the photo reaction.',
      error,
    );
  }
}

export async function removePhotoReaction(photoId: string): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase
    .from('photo_reactions')
    .delete()
    .eq('photo_id', photoId)
    .eq('profile_id', profileId);

  if (error) {
    throw new PhotoReactionServiceError(
      'unexpected_error',
      'Could not remove the photo reaction.',
      error,
    );
  }
}
