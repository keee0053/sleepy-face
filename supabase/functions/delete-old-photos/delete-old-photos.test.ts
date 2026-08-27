import { describe, expect, it, vi } from 'vitest';

import {
  deleteOldPhotos,
  PHOTO_RETENTION_DAYS,
  type DeleteOldPhotosDeps,
} from './delete-old-photos';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function buildDeps(
  overrides: Partial<DeleteOldPhotosDeps> = {},
): DeleteOldPhotosDeps {
  return {
    listStalePhotos: vi.fn().mockResolvedValue([]),
    removeStorageObjects: vi.fn().mockResolvedValue(undefined),
    deletePhotoRows: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('deleteOldPhotos', () => {
  it('queries with the retention-window cutoff', async () => {
    const listStalePhotos = vi.fn().mockResolvedValue([]);
    const deps = buildDeps({ listStalePhotos });

    await deleteOldPhotos(deps, NOW);

    const cutoff = listStalePhotos.mock.calls[0][0] as Date;

    expect(cutoff.toISOString()).toBe(
      new Date(
        NOW.getTime() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  });

  it('does nothing when there are no stale photos', async () => {
    const deps = buildDeps();

    await expect(deleteOldPhotos(deps, NOW)).resolves.toBe(0);
    expect(deps.deletePhotoRows).not.toHaveBeenCalled();
    expect(deps.removeStorageObjects).not.toHaveBeenCalled();
  });

  it('deletes the DB rows and the matching Storage objects', async () => {
    const deps = buildDeps({
      listStalePhotos: vi.fn().mockResolvedValue([
        {
          id: 'photo-1',
          image_url:
            'https://example.supabase.co/storage/v1/object/public/failure-photos/profile-a/one.jpg',
        },
        {
          id: 'photo-2',
          image_url:
            'https://example.supabase.co/storage/v1/object/public/failure-photos/profile-b/two.jpg?v=1',
        },
      ]),
    });

    await expect(deleteOldPhotos(deps, NOW)).resolves.toBe(2);

    expect(deps.deletePhotoRows).toHaveBeenCalledWith(['photo-1', 'photo-2']);
    expect(deps.removeStorageObjects).toHaveBeenCalledWith('failure-photos', [
      'profile-a/one.jpg',
      'profile-b/two.jpg',
    ]);
  });

  it('deletes DB rows even when a Storage URL has no recognizable path', async () => {
    const deps = buildDeps({
      listStalePhotos: vi
        .fn()
        .mockResolvedValue([
          { id: 'photo-1', image_url: 'https://example.com/unrelated.jpg' },
        ]),
    });

    await expect(deleteOldPhotos(deps, NOW)).resolves.toBe(1);
    expect(deps.deletePhotoRows).toHaveBeenCalledWith(['photo-1']);
    expect(deps.removeStorageObjects).not.toHaveBeenCalled();
  });

  it('does not throw when Storage cleanup fails', async () => {
    const deps = buildDeps({
      listStalePhotos: vi.fn().mockResolvedValue([
        {
          id: 'photo-1',
          image_url:
            'https://example.supabase.co/storage/v1/object/public/failure-photos/profile-a/one.jpg',
        },
      ]),
      removeStorageObjects: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(deleteOldPhotos(deps, NOW)).resolves.toBe(1);
    expect(deps.deletePhotoRows).toHaveBeenCalledWith(['photo-1']);
  });
});
