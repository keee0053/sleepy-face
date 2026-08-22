import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeFeedServiceError, listFriendsFeed } from '../home-feed';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  in: vi.fn(),
  listFriendRelations: vi.fn(),
  listPhotoRealMojis: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

vi.mock('@/services/friend', async () => {
  const actual = await vi.importActual<typeof import('../friend')>('../friend');

  return {
    ...actual,
    listFriendRelations: mocks.listFriendRelations,
  };
});

vi.mock('@/services/photo-realmojis', () => ({
  listPhotoRealMojis: mocks.listPhotoRealMojis,
}));

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

function expectServiceError(
  error: unknown,
  code: HomeFeedServiceError['code'],
) {
  expect(error).toBeInstanceOf(HomeFeedServiceError);
  expect((error as HomeFeedServiceError).code).toBe(code);
}

describe('home feed service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPhotoRealMojis.mockResolvedValue([]);
  });

  it('returns an empty feed when the user has no friends', async () => {
    mockAuthenticatedUser();
    mocks.listFriendRelations.mockResolvedValue([]);

    await expect(listFriendsFeed()).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('lists friends photos newest first, joined with friend profile info', async () => {
    mockAuthenticatedUser();
    mocks.listFriendRelations.mockResolvedValue([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        friendProfileId: 'profile-b',
        id: 'relation-1',
        profileId: 'profile-a',
      },
    ]);

    const photosOrder = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-08-19T00:00:00.000Z',
          id: 'photo-1',
          image_url: 'https://storage.example/photo-1.jpg',
          profile_id: 'profile-b',
        },
      ],
      error: null,
    });
    const photosIn = vi.fn().mockReturnValue({ order: photosOrder });
    const photosSelect = vi.fn().mockReturnValue({ in: photosIn });

    const profilesIn = vi.fn().mockResolvedValue({
      data: [
        {
          display_name: 'Sleepy Friend',
          icon_url: 'woman',
          id: 'profile-b',
        },
      ],
      error: null,
    });
    const profilesSelect = vi.fn().mockReturnValue({ in: profilesIn });

    const realMojis = [
      {
        createdAt: '2026-08-19T00:01:00.000Z',
        displayName: '自分',
        emoji: '😂',
        iconId: 'human',
        id: 'realmoji-1',
        imageUrl: 'https://storage.example/realmoji-1.jpg',
        isOwn: true,
        photoId: 'photo-1',
        profileId: 'profile-a',
        updatedAt: '2026-08-19T00:01:00.000Z',
      },
    ];
    mocks.listPhotoRealMojis.mockResolvedValue(realMojis);

    const commentsIn = vi.fn().mockResolvedValue({
      data: [
        { photo_id: 'photo-1' },
        { photo_id: 'photo-1' },
        { photo_id: 'photo-1' },
      ],
      error: null,
    });
    const commentsSelect = vi.fn().mockReturnValue({ in: commentsIn });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'photos') {
        return { select: photosSelect };
      }

      if (table === 'profiles') {
        return { select: profilesSelect };
      }

      if (table === 'comments') {
        return { select: commentsSelect };
      }

      throw new Error(`unexpected table: ${table}`);
    });

    await expect(listFriendsFeed()).resolves.toEqual([
      {
        commentCount: 3,
        createdAt: '2026-08-19T00:00:00.000Z',
        displayName: 'Sleepy Friend',
        iconId: 'woman',
        imageUrl: 'https://storage.example/photo-1.jpg',
        photoId: 'photo-1',
        profileId: 'profile-b',
        realMojis,
      },
    ]);

    expect(photosIn).toHaveBeenCalledWith('profile_id', ['profile-b']);
    expect(photosOrder).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(profilesIn).toHaveBeenCalledWith('id', ['profile-b']);
    expect(mocks.listPhotoRealMojis).toHaveBeenCalledWith(['photo-1']);
    expect(commentsIn).toHaveBeenCalledWith('photo_id', ['photo-1']);
  });

  it('falls back to a default display name when the friend profile is missing', async () => {
    mockAuthenticatedUser();
    mocks.listFriendRelations.mockResolvedValue([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        friendProfileId: 'profile-b',
        id: 'relation-1',
        profileId: 'profile-a',
      },
    ]);

    const photosOrder = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-08-19T00:00:00.000Z',
          id: 'photo-1',
          image_url: 'https://storage.example/photo-1.jpg',
          profile_id: 'profile-b',
        },
      ],
      error: null,
    });
    const photosIn = vi.fn().mockReturnValue({ order: photosOrder });
    const photosSelect = vi.fn().mockReturnValue({ in: photosIn });

    const profilesIn = vi.fn().mockResolvedValue({ data: [], error: null });
    const profilesSelect = vi.fn().mockReturnValue({ in: profilesIn });

    mocks.from.mockImplementation((table: string) =>
      table === 'photos'
        ? { select: photosSelect }
        : { select: profilesSelect },
    );

    const feed = await listFriendsFeed();

    expect(feed[0]).toMatchObject({
      displayName: '不明なユーザー',
      iconId: 'human',
    });
  });

  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await expect(listFriendsFeed()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'not_authenticated');
      return true;
    });
    expect(mocks.listFriendRelations).not.toHaveBeenCalled();
  });

  it('wraps a Supabase error while fetching photos', async () => {
    mockAuthenticatedUser();
    mocks.listFriendRelations.mockResolvedValue([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        friendProfileId: 'profile-b',
        id: 'relation-1',
        profileId: 'profile-a',
      },
    ]);

    const photosOrder = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });
    const photosIn = vi.fn().mockReturnValue({ order: photosOrder });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: photosIn }),
    });

    await expect(listFriendsFeed()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'unexpected_error');
      return true;
    });
  });

  it('wraps a RealMoji loading failure', async () => {
    mockAuthenticatedUser();
    mocks.listFriendRelations.mockResolvedValue([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        friendProfileId: 'profile-b',
        id: 'relation-1',
        profileId: 'profile-a',
      },
    ]);

    const photosOrder = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-08-19T00:00:00.000Z',
          id: 'photo-1',
          image_url: 'https://storage.example/photo-1.jpg',
          profile_id: 'profile-b',
        },
      ],
      error: null,
    });
    const photosIn = vi.fn().mockReturnValue({ order: photosOrder });
    const profilesIn = vi.fn().mockResolvedValue({ data: [], error: null });

    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        in: table === 'photos' ? photosIn : profilesIn,
      }),
    }));
    mocks.listPhotoRealMojis.mockRejectedValue(new Error('RealMoji failed'));

    await expect(listFriendsFeed()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'unexpected_error');
      return true;
    });
  });
});
