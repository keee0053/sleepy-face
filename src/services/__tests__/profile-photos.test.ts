import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProfilePhotosServiceError,
  deleteMyFailurePhoto,
  listMyFailurePhotos,
} from '../profile-photos';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  order: vi.fn(),
  remove: vi.fn(),
  select: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
    storage: {
      from: mocks.storageFrom,
    },
  },
}));

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

function expectServiceError(
  error: unknown,
  code: ProfilePhotosServiceError['code'],
) {
  expect(error).toBeInstanceOf(ProfilePhotosServiceError);
  expect((error as ProfilePhotosServiceError).code).toBe(code);
}

describe('profile photos service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
  });

  it('lists the current user own failure photos, newest first', async () => {
    mockAuthenticatedUser();
    mocks.order.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-19T00:00:00.000Z',
          id: 'photo-1',
          image_url: 'https://storage.example/photo-1.jpg',
        },
      ],
      error: null,
    });

    await expect(listMyFailurePhotos()).resolves.toEqual([
      {
        createdAt: '2026-08-19T00:00:00.000Z',
        imageUrl: 'https://storage.example/photo-1.jpg',
        photoId: 'photo-1',
      },
    ]);

    expect(mocks.from).toHaveBeenCalledWith('photos');
    expect(mocks.eq).toHaveBeenCalledWith('profile_id', 'profile-a');
    expect(mocks.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('returns an empty list when there are no photos', async () => {
    mockAuthenticatedUser();
    mocks.order.mockResolvedValue({ data: null, error: null });

    await expect(listMyFailurePhotos()).resolves.toEqual([]);
  });

  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await expect(listMyFailurePhotos()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'not_authenticated');
      return true;
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('wraps a Supabase error', async () => {
    mockAuthenticatedUser();
    mocks.order.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(listMyFailurePhotos()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'unexpected_error');
      return true;
    });
  });
});

describe('deleteMyFailurePhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the DB row scoped to the viewer, then removes the Storage object', async () => {
    mockAuthenticatedUser();
    const eqChain = { eq: mocks.eq };
    mocks.eq
      .mockReturnValueOnce(eqChain)
      .mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValue({ delete: vi.fn().mockReturnValue(eqChain) });
    mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
    mocks.remove.mockResolvedValue({ error: null });

    await deleteMyFailurePhoto({
      createdAt: '2026-08-26T00:00:00.000Z',
      imageUrl:
        'https://example.supabase.co/storage/v1/object/public/failure-photos/profile-a/123.jpg',
      photoId: 'photo-1',
    });

    expect(mocks.from).toHaveBeenCalledWith('photos');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'photo-1');
    expect(mocks.eq).toHaveBeenCalledWith('profile_id', 'profile-a');
    expect(mocks.storageFrom).toHaveBeenCalledWith('failure-photos');
    expect(mocks.remove).toHaveBeenCalledWith(['profile-a/123.jpg']);
  });

  it('throws unexpected_error when the DB delete fails', async () => {
    mockAuthenticatedUser();
    const eqChain = { eq: mocks.eq };
    mocks.eq
      .mockReturnValueOnce(eqChain)
      .mockResolvedValueOnce({ error: new Error('boom') });
    mocks.from.mockReturnValue({ delete: vi.fn().mockReturnValue(eqChain) });

    await expect(
      deleteMyFailurePhoto({
        createdAt: '2026-08-26T00:00:00.000Z',
        imageUrl: 'https://example.supabase.co/failure-photos/profile-a/1.jpg',
        photoId: 'photo-1',
      }),
    ).rejects.toSatisfy((error) => {
      expectServiceError(error, 'unexpected_error');
      return true;
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });
});
