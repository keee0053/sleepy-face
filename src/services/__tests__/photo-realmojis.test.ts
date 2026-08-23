import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PhotoRealMojiServiceError,
  listPhotoRealMojis,
  upsertPhotoRealMoji,
} from '../photo-realmojis';

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  remove: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
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
  code: PhotoRealMojiServiceError['code'],
) {
  expect(error).toBeInstanceOf(PhotoRealMojiServiceError);
  expect((error as PhotoRealMojiServiceError).code).toBe(code);
}

describe('photo RealMoji service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    );
    mocks.storageFrom.mockReturnValue({
      createSignedUrl: mocks.createSignedUrl,
      remove: mocks.remove,
      upload: mocks.upload,
    });
    mocks.createSignedUrl.mockImplementation((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://signed.example/${path}` },
        error: null,
      }),
    );
    mocks.remove.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ error: null });
  });

  it('returns no rows without querying when there are no photo IDs', async () => {
    await expect(listPhotoRealMojis([])).resolves.toEqual([]);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('lists RealMojis with signed image URLs and author details', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-08-23T00:00:00.000Z',
          emoji: '😂',
          id: 'realmoji-1',
          photo_id: 'photo-1',
          profile_id: 'profile-a',
          storage_path: 'profile-a/photo-1/reaction.jpg',
          updated_at: '2026-08-23T00:01:00.000Z',
        },
      ],
      error: null,
    });
    const realMojiIn = vi.fn().mockReturnValue({ order });
    const profileIn = vi.fn().mockResolvedValue({
      data: [
        {
          display_name: 'Sleepy User',
          icon_url: 'woman',
          id: 'profile-a',
        },
      ],
      error: null,
    });

    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        in: table === 'photo_realmojis' ? realMojiIn : profileIn,
      }),
    }));

    await expect(listPhotoRealMojis(['photo-1'])).resolves.toEqual([
      {
        createdAt: '2026-08-23T00:00:00.000Z',
        displayName: 'Sleepy User',
        emoji: '😂',
        iconId: 'woman',
        id: 'realmoji-1',
        imageUrl: 'https://signed.example/profile-a/photo-1/reaction.jpg',
        isOwn: true,
        photoId: 'photo-1',
        profileId: 'profile-a',
        updatedAt: '2026-08-23T00:01:00.000Z',
      },
    ]);
    expect(realMojiIn).toHaveBeenCalledWith('photo_id', ['photo-1']);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      'profile-a/photo-1/reaction.jpg',
      3600,
    );
  });

  it('uploads and replaces the current users RealMoji for the photo', async () => {
    const existingMaybeSingle = vi.fn().mockResolvedValue({
      data: { storage_path: 'profile-a/photo-1/old.jpg' },
      error: null,
    });
    const existingProfileEq = vi.fn().mockReturnValue({
      maybeSingle: existingMaybeSingle,
    });
    const existingPhotoEq = vi.fn().mockReturnValue({
      eq: existingProfileEq,
    });
    const savedSingle = vi.fn().mockResolvedValue({
      data: {
        created_at: '2026-08-23T00:00:00.000Z',
        emoji: '😏',
        id: 'realmoji-1',
        photo_id: 'photo-1',
        profile_id: 'profile-a',
        storage_path: 'profile-a/photo-1/new.jpg',
        updated_at: '2026-08-23T00:01:00.000Z',
      },
      error: null,
    });
    const savedSelect = vi.fn().mockReturnValue({ single: savedSingle });
    const upsert = vi.fn().mockReturnValue({ select: savedSelect });
    const profileIn = vi.fn().mockResolvedValue({
      data: [
        {
          display_name: 'Sleepy User',
          icon_url: 'human',
          id: 'profile-a',
        },
      ],
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({ in: profileIn }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({ eq: existingPhotoEq }),
        upsert,
      };
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/new.jpg' },
      error: null,
    });

    const result = await upsertPhotoRealMoji({
      emoji: '😏',
      localPhotoUri: 'file://reaction.jpg',
      photoId: 'photo-1',
    });

    expect(result).toMatchObject({
      emoji: '😏',
      imageUrl: 'https://signed.example/new.jpg',
      isOwn: true,
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^profile-a\/photo-1\/.+\.jpg$/),
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: false },
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        emoji: '😏',
        photo_id: 'photo-1',
        profile_id: 'profile-a',
      }),
      { onConflict: 'photo_id,profile_id' },
    );
    expect(mocks.remove).toHaveBeenCalledWith(['profile-a/photo-1/old.jpg']);
  });

  it('rejects an unsupported emoji before uploading', async () => {
    await upsertPhotoRealMoji({
      emoji: '💩' as '😂',
      localPhotoUri: 'file://reaction.jpg',
      photoId: 'photo-1',
    }).catch((error: unknown) => {
      expectServiceError(error, 'invalid_emoji');
    });

    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('requires authentication before listing RealMojis', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await listPhotoRealMojis(['photo-1']).catch((error: unknown) => {
      expectServiceError(error, 'not_authenticated');
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
