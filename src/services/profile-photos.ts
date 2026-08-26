import { supabase } from '@/lib/supabase';

const FAILURE_PHOTO_BUCKET = 'failure-photos';

export type MyFailurePhoto = {
  photoId: string;
  imageUrl: string;
  createdAt: string;
};

export type ProfilePhotosServiceErrorCode =
  'not_authenticated' | 'unexpected_error';

type PhotoRow = {
  id: string;
  image_url: string;
  created_at: string;
};

export class ProfilePhotosServiceError extends Error {
  constructor(
    public readonly code: ProfilePhotosServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProfilePhotosServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ProfilePhotosServiceError(
      'not_authenticated',
      'The Profile photo list requires an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

// Profile shows the user's own failure photos, newest first — unlike the Friends Feed,
// this list is never blocked by Friends Feed Access.
export async function listMyFailurePhotos(): Promise<MyFailurePhoto[]> {
  const profileId = await getRequiredProfileId();

  const { data, error } = await supabase
    .from('photos')
    .select('id, image_url, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ProfilePhotosServiceError(
      'unexpected_error',
      'Could not load your failure photos.',
      error,
    );
  }

  return ((data ?? []) as PhotoRow[]).map((row) => ({
    createdAt: row.created_at,
    imageUrl: row.image_url,
    photoId: row.id,
  }));
}

// The public URL doesn't carry the Storage path as a distinct field, so it's recovered
// from the URL itself -- the wakeChallenge.ts upload always writes it as
// `{bucket}/{profileId}/{filename}` and getPublicUrl always embeds that same path.
function extractStoragePath(imageUrl: string): string | null {
  const marker = `/${FAILURE_PHOTO_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  return imageUrl.slice(markerIndex + marker.length).split('?')[0];
}

// Deletes the DB row first (the source of truth for what's "posted") -- the Storage
// object cleanup is best-effort and must never block deletion on a Storage failure,
// since the DB row being gone is what actually satisfies "the user deleted their post."
export async function deleteMyFailurePhoto(
  photo: MyFailurePhoto,
): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase
    .from('photos')
    .delete()
    .eq('id', photo.photoId)
    .eq('profile_id', profileId);

  if (error) {
    throw new ProfilePhotosServiceError(
      'unexpected_error',
      'Could not delete the photo.',
      error,
    );
  }

  const storagePath = extractStoragePath(photo.imageUrl);

  if (storagePath) {
    await supabase.storage
      .from(FAILURE_PHOTO_BUCKET)
      .remove([storagePath])
      .catch(() => {});
  }
}
