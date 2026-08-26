import { describe, expect, it, vi } from 'vitest';

import { deleteAccount } from './delete-account';

function buildDeps(
  overrides: Partial<Parameters<typeof deleteAccount>[1]> = {},
) {
  return {
    deleteAuthUser: vi.fn().mockResolvedValue(undefined),
    listStorageObjects: vi.fn().mockResolvedValue([]),
    removeStorageObjects: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('deleteAccount', () => {
  it('removes storage objects from every account storage bucket, then deletes the auth user', async () => {
    const deps = buildDeps({
      listStorageObjects: vi.fn().mockResolvedValue([{ name: 'photo.jpg' }]),
    });

    await deleteAccount('user-1', deps);

    expect(deps.listStorageObjects).toHaveBeenCalledWith(
      'failure-photos',
      'user-1',
    );
    expect(deps.listStorageObjects).toHaveBeenCalledWith(
      'profile-icon-photos',
      'user-1',
    );
    expect(deps.removeStorageObjects).toHaveBeenCalledWith('failure-photos', [
      'user-1/photo.jpg',
    ]);
    expect(deps.removeStorageObjects).toHaveBeenCalledWith(
      'profile-icon-photos',
      ['user-1/photo.jpg'],
    );
    expect(deps.deleteAuthUser).toHaveBeenCalledWith('user-1');
  });

  it('skips removeStorageObjects for a bucket with no objects', async () => {
    const deps = buildDeps();

    await deleteAccount('user-1', deps);

    expect(deps.removeStorageObjects).not.toHaveBeenCalled();
    expect(deps.deleteAuthUser).toHaveBeenCalledWith('user-1');
  });

  it('propagates an error from deleteAuthUser', async () => {
    const deps = buildDeps({
      deleteAuthUser: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(deleteAccount('user-1', deps)).rejects.toThrow('boom');
  });
});
