import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FriendServiceError,
  addFriend,
  listFriends,
  listFriendRelations,
  normalizeFriendSearchQuery,
  searchProfiles,
} from '../friend';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
  limit: vi.fn(),
  in: vi.fn(),
  neq: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

function expectFriendServiceError(
  error: unknown,
  code: FriendServiceError['code'],
) {
  expect(error).toBeInstanceOf(FriendServiceError);
  expect((error as FriendServiceError).code).toBe(code);
}

describe('friend service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes friend search input', () => {
    expect(normalizeFriendSearchQuery('  sleepy   user  ')).toBe('sleepy user');
  });

  it('returns an empty search result for short queries', async () => {
    mockAuthenticatedUser();

    await expect(searchProfiles('a')).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('searches profiles by public User ID and Display Name', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ or: mocks.or });
    mocks.or.mockReturnValue({ neq: mocks.neq });
    mocks.neq.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          display_name: 'Sleepy Friend',
          icon_url: null,
          id: 'profile-b',
          user_id: 'sleepy-friend',
        },
      ],
      error: null,
    });

    await expect(searchProfiles(' sleepy ')).resolves.toEqual([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        displayName: 'Sleepy Friend',
        iconUrl: null,
        id: 'profile-b',
        userId: 'sleepy-friend',
      },
    ]);
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.neq).toHaveBeenCalledWith('id', 'profile-a');
    expect(mocks.limit).toHaveBeenCalledWith(20);
  });

  it('lists friend relations for either side of the relation', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ or: mocks.or });
    mocks.or.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          friend_profile_id: 'profile-b',
          id: 'relation-1',
          profile_id: 'profile-a',
        },
      ],
      error: null,
    });

    await expect(listFriendRelations()).resolves.toEqual([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        friendProfileId: 'profile-b',
        id: 'relation-1',
        profileId: 'profile-a',
      },
    ]);
    expect(mocks.or).toHaveBeenCalledWith(
      'profile_id.eq.profile-a,friend_profile_id.eq.profile-a',
    );
  });

  it('lists friend profiles from existing relations', async () => {
    mockAuthenticatedUser();
    mocks.from
      .mockReturnValueOnce({ select: mocks.select })
      .mockReturnValueOnce({ select: mocks.select });
    mocks.select
      .mockReturnValueOnce({ or: mocks.or })
      .mockReturnValueOnce({ in: mocks.in });
    mocks.or.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          friend_profile_id: 'profile-b',
          id: 'relation-1',
          profile_id: 'profile-a',
        },
      ],
      error: null,
    });
    mocks.in.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          display_name: 'Sleepy Friend',
          icon_url: null,
          id: 'profile-b',
          user_id: 'sleepy-friend',
        },
      ],
      error: null,
    });

    await expect(listFriends()).resolves.toEqual([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        displayName: 'Sleepy Friend',
        iconUrl: null,
        id: 'profile-b',
        relationId: 'relation-1',
        userId: 'sleepy-friend',
      },
    ]);
    expect(mocks.in).toHaveBeenCalledWith('id', ['profile-b']);
  });

  it('adds a friend relation from the current profile', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: {
        created_at: '2026-08-18T00:00:00.000Z',
        friend_profile_id: 'profile-b',
        id: 'relation-1',
        profile_id: 'profile-a',
      },
      error: null,
    });

    await expect(addFriend('profile-b')).resolves.toEqual({
      createdAt: '2026-08-18T00:00:00.000Z',
      friendProfileId: 'profile-b',
      id: 'relation-1',
      profileId: 'profile-a',
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      friend_profile_id: 'profile-b',
      profile_id: 'profile-a',
    });
  });

  it('rejects self-relations before calling Supabase insert', async () => {
    mockAuthenticatedUser();

    await addFriend('profile-a').catch((error: unknown) => {
      expectFriendServiceError(error, 'self_relation');
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('maps duplicate relation errors to already_friend', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    });

    await addFriend('profile-b').catch((error: unknown) => {
      expectFriendServiceError(error, 'already_friend');
    });
  });

  it('requires authentication for friend operations', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await searchProfiles('sleepy').catch((error: unknown) => {
      expectFriendServiceError(error, 'not_authenticated');
    });
  });
});
