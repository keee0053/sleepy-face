// Photos (the failure/wake-up photos shown in the Friends Feed, see photos table and
// src/services/profile-photos.ts) are only ever kept for a limited window -- a user can
// already delete their own early via deleteMyFailurePhoto, but nothing previously
// expired one automatically. Run on a schedule (see index.ts) so Storage usage doesn't
// grow forever.
const FAILURE_PHOTO_BUCKET = 'failure-photos';
export const PHOTO_RETENTION_DAYS = 14;

export type StalePhotoRow = {
  id: string;
  image_url: string;
};

export type DeleteOldPhotosDeps = {
  listStalePhotos: (olderThan: Date) => Promise<StalePhotoRow[]>;
  removeStorageObjects: (bucket: string, paths: string[]) => Promise<void>;
  deletePhotoRows: (ids: string[]) => Promise<void>;
};

// The public URL doesn't carry the Storage path as a distinct field, so it's recovered
// from the URL itself -- matches extractStoragePath in
// src/services/profile-photos.ts, which relies on the same upload convention
// (wakeChallenge.ts always writes `{bucket}/{profileId}/{filename}`).
function extractStoragePath(imageUrl: string): string | null {
  const marker = `/${FAILURE_PHOTO_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  return imageUrl.slice(markerIndex + marker.length).split('?')[0];
}

// Deletes the DB rows first (the source of truth for what's "posted", same ordering as
// deleteMyFailurePhoto) -- Storage object cleanup is best-effort and must never block on
// a Storage failure, since the rows being gone is what actually satisfies retention.
export async function deleteOldPhotos(
  deps: DeleteOldPhotosDeps,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const stalePhotos = await deps.listStalePhotos(cutoff);

  if (stalePhotos.length === 0) {
    return 0;
  }

  await deps.deletePhotoRows(stalePhotos.map((photo) => photo.id));

  const storagePaths = stalePhotos
    .map((photo) => extractStoragePath(photo.image_url))
    .filter((path): path is string => path !== null);

  if (storagePaths.length > 0) {
    await deps
      .removeStorageObjects(FAILURE_PHOTO_BUCKET, storagePaths)
      .catch(() => {});
  }

  return stalePhotos.length;
}
