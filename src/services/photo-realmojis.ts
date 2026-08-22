import { isRealMojiEmoji, type RealMojiEmoji } from '@/constants/realmojis';
import { supabase } from '@/lib/supabase';
import { toProfileIconValue } from '@/services/user';

const REALMOJI_PHOTO_BUCKET = 'realmoji-photos';
const REALMOJI_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PhotoRealMoji = {
  id: string;
  photoId: string;
  profileId: string;
  emoji: RealMojiEmoji;
  imageUrl: string;
  displayName: string;
  iconId: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
};

export type PhotoRealMojiServiceErrorCode =
  'invalid_emoji' | 'not_authenticated' | 'unexpected_error';

type RealMojiRow = {
  id: string;
  photo_id: string;
  profile_id: string;
  emoji: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  icon_url: string | null;
};

export class PhotoRealMojiServiceError extends Error {
  constructor(
    public readonly code: PhotoRealMojiServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PhotoRealMojiServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new PhotoRealMojiServiceError(
      'not_authenticated',
      'Using a RealMoji requires an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

function mapUnexpectedError(
  message: string,
  cause?: unknown,
): PhotoRealMojiServiceError {
  return new PhotoRealMojiServiceError('unexpected_error', message, cause);
}

function getRequiredEmoji(emoji: string): RealMojiEmoji {
  if (!isRealMojiEmoji(emoji)) {
    throw new PhotoRealMojiServiceError(
      'invalid_emoji',
      'The selected RealMoji emoji is not supported.',
      emoji,
    );
  }

  return emoji;
}

async function createSignedImageUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(REALMOJI_PHOTO_BUCKET)
    .createSignedUrl(storagePath, REALMOJI_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw mapUnexpectedError(
      'Could not create a signed RealMoji photo URL.',
      error,
    );
  }

  return data.signedUrl;
}

async function mapRows(
  rows: RealMojiRow[],
  viewerProfileId: string,
): Promise<PhotoRealMoji[]> {
  if (rows.length === 0) {
    return [];
  }

  const profileIds = [...new Set(rows.map((row) => row.profile_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, icon_url')
    .in('id', profileIds);

  if (profileError) {
    throw mapUnexpectedError(
      'Could not load RealMoji author profiles.',
      profileError,
    );
  }

  const profileById = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const imageUrls = await Promise.all(
    rows.map((row) => createSignedImageUrl(row.storage_path)),
  );

  return rows.flatMap((row, index) => {
    if (!isRealMojiEmoji(row.emoji)) {
      return [];
    }

    const profile = profileById.get(row.profile_id);

    return [
      {
        createdAt: row.created_at,
        displayName: profile?.display_name ?? '不明なユーザー',
        emoji: row.emoji,
        iconId: toProfileIconValue(profile?.icon_url),
        id: row.id,
        imageUrl: imageUrls[index],
        isOwn: row.profile_id === viewerProfileId,
        photoId: row.photo_id,
        profileId: row.profile_id,
        updatedAt: row.updated_at,
      },
    ];
  });
}

export async function listPhotoRealMojis(
  photoIds: string[],
): Promise<PhotoRealMoji[]> {
  if (photoIds.length === 0) {
    return [];
  }

  const profileId = await getRequiredProfileId();
  const { data, error } = await supabase
    .from('photo_realmojis')
    .select(
      'id, photo_id, profile_id, emoji, storage_path, created_at, updated_at',
    )
    .in('photo_id', photoIds)
    .order('created_at', { ascending: true });

  if (error) {
    throw mapUnexpectedError('Could not load photo RealMojis.', error);
  }

  return mapRows((data ?? []) as RealMojiRow[], profileId);
}

export async function upsertPhotoRealMoji(input: {
  photoId: string;
  emoji: RealMojiEmoji;
  localPhotoUri: string;
}): Promise<PhotoRealMoji> {
  const profileId = await getRequiredProfileId();
  const emoji = getRequiredEmoji(input.emoji);
  const { data: existingRow, error: existingError } = await supabase
    .from('photo_realmojis')
    .select('storage_path')
    .eq('photo_id', input.photoId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (existingError) {
    throw mapUnexpectedError(
      'Could not inspect the existing photo RealMoji.',
      existingError,
    );
  }

  const storagePath = `${profileId}/${input.photoId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`;
  let photoBody: ArrayBuffer;

  try {
    const photoResponse = await fetch(input.localPhotoUri);
    photoBody = await photoResponse.arrayBuffer();
  } catch (error) {
    throw mapUnexpectedError(
      'Could not read the captured RealMoji photo.',
      error,
    );
  }

  const { error: uploadError } = await supabase.storage
    .from(REALMOJI_PHOTO_BUCKET)
    .upload(storagePath, photoBody, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    throw mapUnexpectedError(
      'Could not upload the RealMoji photo.',
      uploadError,
    );
  }

  const now = new Date().toISOString();
  const { data: savedRow, error: saveError } = await supabase
    .from('photo_realmojis')
    .upsert(
      {
        emoji,
        photo_id: input.photoId,
        profile_id: profileId,
        storage_path: storagePath,
        updated_at: now,
      },
      { onConflict: 'photo_id,profile_id' },
    )
    .select(
      'id, photo_id, profile_id, emoji, storage_path, created_at, updated_at',
    )
    .single();

  if (saveError || !savedRow) {
    await supabase.storage.from(REALMOJI_PHOTO_BUCKET).remove([storagePath]);
    throw mapUnexpectedError('Could not save the photo RealMoji.', saveError);
  }

  const previousStoragePath = (existingRow as { storage_path?: string } | null)
    ?.storage_path;

  if (previousStoragePath && previousStoragePath !== storagePath) {
    // The DB already points at the replacement, so stale-file cleanup is best-effort.
    await supabase.storage
      .from(REALMOJI_PHOTO_BUCKET)
      .remove([previousStoragePath]);
  }

  const [realMoji] = await mapRows([savedRow as RealMojiRow], profileId);

  if (!realMoji) {
    throw mapUnexpectedError('The saved photo RealMoji has an invalid shape.');
  }

  return realMoji;
}

export async function removePhotoRealMoji(photoId: string): Promise<void> {
  const profileId = await getRequiredProfileId();
  const { data: existingRow, error: existingError } = await supabase
    .from('photo_realmojis')
    .select('storage_path')
    .eq('photo_id', photoId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (existingError) {
    throw mapUnexpectedError(
      'Could not inspect the photo RealMoji before deleting it.',
      existingError,
    );
  }

  const { error: deleteError } = await supabase
    .from('photo_realmojis')
    .delete()
    .eq('photo_id', photoId)
    .eq('profile_id', profileId);

  if (deleteError) {
    throw mapUnexpectedError(
      'Could not delete the photo RealMoji.',
      deleteError,
    );
  }

  const storagePath = (existingRow as { storage_path?: string } | null)
    ?.storage_path;

  if (storagePath) {
    // The user-facing delete is complete once the row is gone. A stale private object
    // is inaccessible without a row-backed signed URL and can be cleaned up later.
    await supabase.storage.from(REALMOJI_PHOTO_BUCKET).remove([storagePath]);
  }
}
