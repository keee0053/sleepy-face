import { supabase } from '@/lib/supabase';

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

// One reaction per (photo, profile) — the unique constraint makes a duplicate add a
// no-op rather than an error, so a double-tap race is harmless.
export async function addPhotoReaction(photoId: string): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase
    .from('photo_reactions')
    .upsert(
      { photo_id: photoId, profile_id: profileId },
      { ignoreDuplicates: true, onConflict: 'photo_id,profile_id' },
    );

  if (error) {
    throw new PhotoReactionServiceError(
      'unexpected_error',
      'Could not add the photo reaction.',
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
