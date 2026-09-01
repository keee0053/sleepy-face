import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FriendServiceError,
  acceptFriendRequest,
  addFriend,
  declineFriendRequest,
  listFriendRelations,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  normalizeFriendSearchQuery,
  searchProfiles,
} from '../friend';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  ilike: vi.fn(),
  insert: vi.fn(),
  limit: vi.fn(),
  in: vi.fn(),
  listBlockedProfileIds: vi.fn(),
  neq: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

vi.mock('@/services/moderation', () => ({
  listBlockedProfileIds: mocks.listBlockedProfileIds,
}));

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
  mocks.listBlockedProfileIds.mockResolvedValue([]);
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

  it('searches profiles by public User ID only', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ ilike: mocks.ilike });
    mocks.ilike.mockReturnValue({ neq: mocks.neq });
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
        iconId: 'human',
        id: 'profile-b',
        userId: 'sleepy-friend',
      },
    ]);
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.ilike).toHaveBeenCalledWith('user_id', 'sleepy%');
    expect(mocks.neq).toHaveBeenCalledWith('id', 'profile-a');
    expect(mocks.limit).toHaveBeenCalledWith(20);
  });

  it('preserves a custom profile photo URL instead of collapsing it to a preset icon', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ ilike: mocks.ilike });
    mocks.ilike.mockReturnValue({ neq: mocks.neq });
    mocks.neq.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          display_name: 'Sleepy Friend',
          icon_url: 'https://example.com/storage/photo.jpg',
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
        iconId: 'https://example.com/storage/photo.jpg',
        id: 'profile-b',
        userId: 'sleepy-friend',
      },
    ]);
  });

  it('excludes profiles the viewer has blocked', async () => {
    mockAuthenticatedUser();
    mocks.listBlockedProfileIds.mockResolvedValue(['profile-b']);
    const notFn = vi.fn().mockReturnThis();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ ilike: mocks.ilike });
    mocks.ilike.mockReturnValue({ neq: mocks.neq });
    mocks.neq.mockReturnValue({ limit: mocks.limit, not: notFn });
    mocks.limit.mockResolvedValue({ data: [], error: null });

    await searchProfiles('sleepy');

    expect(notFn).toHaveBeenCalledWith('id', 'in', '(profile-b)');
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
          status: 'accepted',
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
        status: 'accepted',
      },
    ]);
    expect(mocks.or).toHaveBeenCalledWith(
      'profile_id.eq.profile-a,friend_profile_id.eq.profile-a',
    );
  });

  it('lists only accepted friend profiles from existing relations', async () => {
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
          status: 'accepted',
        },
        {
          created_at: '2026-08-18T00:00:01.000Z',
          friend_profile_id: 'profile-c',
          id: 'relation-2',
          profile_id: 'profile-a',
          status: 'pending',
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
        iconId: 'human',
        id: 'profile-b',
        relationId: 'relation-1',
        userId: 'sleepy-friend',
      },
    ]);
    expect(mocks.in).toHaveBeenCalledWith('id', ['profile-b']);
  });

  it('lists incoming pending requests sent to the viewer', async () => {
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
          friend_profile_id: 'profile-a',
          id: 'relation-1',
          profile_id: 'profile-b',
          status: 'pending',
        },
        {
          created_at: '2026-08-18T00:00:01.000Z',
          friend_profile_id: 'profile-c',
          id: 'relation-2',
          profile_id: 'profile-a',
          status: 'pending',
        },
      ],
      error: null,
    });
    mocks.in.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          display_name: 'Requester',
          icon_url: null,
          id: 'profile-b',
          user_id: 'requester',
        },
      ],
      error: null,
    });

    await expect(listIncomingFriendRequests()).resolves.toEqual([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        displayName: 'Requester',
        iconId: 'human',
        id: 'profile-b',
        relationId: 'relation-1',
        userId: 'requester',
      },
    ]);
    expect(mocks.in).toHaveBeenCalledWith('id', ['profile-b']);
  });

  it('lists outgoing pending requests the viewer sent', async () => {
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
          status: 'pending',
        },
        {
          created_at: '2026-08-18T00:00:01.000Z',
          friend_profile_id: 'profile-a',
          id: 'relation-2',
          profile_id: 'profile-c',
          status: 'pending',
        },
      ],
      error: null,
    });
    mocks.in.mockResolvedValue({
      data: [
        {
          created_at: '2026-08-18T00:00:00.000Z',
          display_name: 'Recipient',
          icon_url: null,
          id: 'profile-b',
          user_id: 'recipient',
        },
      ],
      error: null,
    });

    await expect(listOutgoingFriendRequests()).resolves.toEqual([
      {
        createdAt: '2026-08-18T00:00:00.000Z',
        displayName: 'Recipient',
        iconId: 'human',
        id: 'profile-b',
        relationId: 'relation-1',
        userId: 'recipient',
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
        status: 'pending',
      },
      error: null,
    });

    await expect(addFriend('profile-b')).resolves.toEqual({
      createdAt: '2026-08-18T00:00:00.000Z',
      friendProfileId: 'profile-b',
      id: 'relation-1',
      profileId: 'profile-a',
      status: 'pending',
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

  it('accepts a pending friend request', async () => {
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: {
        created_at: '2026-08-18T00:00:00.000Z',
        friend_profile_id: 'profile-a',
        id: 'relation-1',
        profile_id: 'profile-b',
        status: 'accepted',
      },
      error: null,
    });

    await expect(acceptFriendRequest('relation-1')).resolves.toEqual({
      createdAt: '2026-08-18T00:00:00.000Z',
      friendProfileId: 'profile-a',
      id: 'relation-1',
      profileId: 'profile-b',
      status: 'accepted',
    });
    expect(mocks.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'relation-1');
  });

  it('deletes a relation when declining or canceling a request', async () => {
    mocks.from.mockReturnValue({ delete: mocks.delete });
    mocks.delete.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });

    await declineFriendRequest('relation-1');

    expect(mocks.delete).toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith('id', 'relation-1');
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
