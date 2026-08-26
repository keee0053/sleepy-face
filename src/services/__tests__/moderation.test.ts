import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ModerationServiceError,
  blockUser,
  listBlockedProfileIds,
  listBlockedProfiles,
  reportContent,
  unblockUser,
} from '../moderation';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  in: vi.fn(),
  insert: vi.fn(),
  or: vi.fn(),
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

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

describe('reportContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a report row for the authenticated user', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });

    await reportContent('photo', 'photo-1', 'inappropriate');

    expect(mocks.from).toHaveBeenCalledWith('reports');
    expect(mocks.insert).toHaveBeenCalledWith({
      details: null,
      reason: 'inappropriate',
      reporter_id: 'profile-a',
      target_id: 'photo-1',
      target_type: 'photo',
    });
  });

  it('throws unexpected_error when the insert fails', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: new Error('boom') });

    await expect(
      reportContent('comment', 'comment-1', 'spam'),
    ).rejects.toBeInstanceOf(ModerationServiceError);
  });
});

describe('blockUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a block row and removes any friend relation between the two', async () => {
    mockAuthenticatedUser();
    const insertResult = { error: null };
    const deleteChain = { or: mocks.or };
    mocks.or.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'blocks') {
        return { insert: vi.fn().mockResolvedValue(insertResult) };
      }
      return { delete: vi.fn().mockReturnValue(deleteChain) };
    });

    await blockUser('profile-b');

    expect(mocks.from).toHaveBeenCalledWith('blocks');
    expect(mocks.from).toHaveBeenCalledWith('friends_relations');
    expect(mocks.or).toHaveBeenCalledWith(
      'and(profile_id.eq.profile-a,friend_profile_id.eq.profile-b),and(profile_id.eq.profile-b,friend_profile_id.eq.profile-a)',
    );
  });

  it('throws unexpected_error when the block insert fails', async () => {
    mockAuthenticatedUser();
    mocks.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: new Error('boom') }),
    });

    await expect(blockUser('profile-b')).rejects.toBeInstanceOf(
      ModerationServiceError,
    );
  });
});

describe('unblockUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the block row scoped to the viewer', async () => {
    mockAuthenticatedUser();
    const eqChain = { eq: mocks.eq };
    mocks.eq
      .mockReturnValueOnce(eqChain)
      .mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValue({ delete: vi.fn().mockReturnValue(eqChain) });

    await unblockUser('profile-b');

    expect(mocks.from).toHaveBeenCalledWith('blocks');
  });
});

describe('listBlockedProfileIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the blocked ids for the viewer', async () => {
    mockAuthenticatedUser();
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({
      data: [{ blocked_id: 'profile-b' }],
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select });

    await expect(listBlockedProfileIds()).resolves.toEqual(['profile-b']);
  });
});

describe('listBlockedProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty list without querying profiles when there are no blocks', async () => {
    mockAuthenticatedUser();
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue({ select: mocks.select });

    await expect(listBlockedProfiles()).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('joins blocked ids with their profile info', async () => {
    mockAuthenticatedUser();
    mocks.select.mockReturnValueOnce({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [
        { blocked_id: 'profile-b', created_at: '2026-08-26T00:00:00.000Z' },
      ],
      error: null,
    });
    mocks.select.mockReturnValueOnce({ in: mocks.in });
    mocks.in.mockResolvedValue({
      data: [
        {
          display_name: '友達B',
          icon_url: null,
          id: 'profile-b',
          user_id: 'friend_b',
        },
      ],
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select });

    await expect(listBlockedProfiles()).resolves.toEqual([
      {
        blockedAt: '2026-08-26T00:00:00.000Z',
        displayName: '友達B',
        iconId: 'human',
        id: 'profile-b',
        userId: 'friend_b',
      },
    ]);
  });
});
