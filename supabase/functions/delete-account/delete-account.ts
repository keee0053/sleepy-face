// Deletes everything an account owns. Storage objects (failure-photos/{userId}/*,
// profile-icon-photos/{userId}/*) aren't covered by any DB foreign key, so they're
// removed explicitly here; every other table cascades from auth.users(id) once the
// user row is deleted (see supabase/sql/2026-08-26_account_deletion_cascades.sql).
export const ACCOUNT_STORAGE_BUCKETS = [
  'failure-photos',
  'profile-icon-photos',
] as const;

export type StorageObject = {
  name: string;
};

export type DeleteAccountDeps = {
  listStorageObjects: (
    bucket: string,
    prefix: string,
  ) => Promise<StorageObject[]>;
  removeStorageObjects: (bucket: string, paths: string[]) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
};

export async function deleteAccount(
  userId: string,
  deps: DeleteAccountDeps,
): Promise<void> {
  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    const objects = await deps.listStorageObjects(bucket, userId);

    if (objects.length === 0) {
      continue;
    }

    await deps.removeStorageObjects(
      bucket,
      objects.map((object) => `${userId}/${object.name}`),
    );
  }

  // Cascades to profiles and every table referencing it (photos, friends_relations,
  // push_tokens, photo_reactions, comments, failure_log_entries, wake_attempt_log).
  await deps.deleteAuthUser(userId);
}
