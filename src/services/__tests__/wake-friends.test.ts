import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateWakeFriendAlarm,
  getAndClearPendingWakeFriendRingInfo,
  listWakeFriendTargets,
} from '../wake-friends';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  functionsInvoke: vi.fn(),
  getUser: vi.fn(),
  gte: vi.fn(),
  in: vi.fn(),
  is: vi.fn(),
  listFriends: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/services/friend', () => ({
  listFriends: mocks.listFriends,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
    functions: {
      invoke: mocks.functionsInvoke,
    },
  },
}));

const friendA = {
  createdAt: '2026-08-20T00:00:00.000Z',
  displayName: '友達A',
  iconId: 'human' as const,
  id: 'profile-a',
  relationId: 'relation-a',
  userId: 'friend_a',
};

const friendB = {
  createdAt: '2026-08-21T00:00:00.000Z',
  displayName: '友達B',
  iconId: 'woman' as const,
  id: 'profile-b',
  relationId: 'relation-b',
  userId: 'friend_b',
};

describe('listWakeFriendTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ in: mocks.in });
    mocks.in.mockReturnValue({ is: mocks.is });
    mocks.is.mockReturnValue({ gte: mocks.gte });
  });

  it('returns only Friends with an unconsumed failure entry', async () => {
    mocks.listFriends.mockResolvedValue([friendA, friendB]);
    mocks.gte.mockResolvedValue({
      data: [{ id: 'entry-b', profile_id: 'profile-b' }],
      error: null,
    });

    await expect(
      listWakeFriendTargets(new Date('2026-08-23T02:00:00.000Z')),
    ).resolves.toEqual([{ ...friendB, failureEntryId: 'entry-b' }]);
    expect(mocks.from).toHaveBeenCalledWith('failure_log_entries');
    expect(mocks.select).toHaveBeenCalledWith('id, profile_id');
    expect(mocks.in).toHaveBeenCalledWith('profile_id', [
      'profile-a',
      'profile-b',
    ]);
    expect(mocks.is).toHaveBeenCalledWith('activated_at', null);
    expect(mocks.gte).toHaveBeenCalledWith(
      'created_at',
      '2026-08-23T01:30:00.000Z',
    );
  });

  it('keeps one card per Friend when multiple failures are unconsumed', async () => {
    mocks.listFriends.mockResolvedValue([friendA]);
    mocks.gte.mockResolvedValue({
      data: [
        { id: 'entry-newest', profile_id: 'profile-a' },
        { id: 'entry-older', profile_id: 'profile-a' },
      ],
      error: null,
    });

    await expect(listWakeFriendTargets()).resolves.toEqual([
      { ...friendA, failureEntryId: 'entry-newest' },
    ]);
  });

  it('skips the failure query when there are no Friends', async () => {
    mocks.listFriends.mockResolvedValue([]);

    await expect(listWakeFriendTargets()).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('surfaces a failure-log query error', async () => {
    mocks.listFriends.mockResolvedValue([friendA]);
    mocks.gte.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(listWakeFriendTargets()).rejects.toThrow('boom');
  });
});

describe('activateWakeFriendAlarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates activation to the existing remote alarm service', async () => {
    mocks.functionsInvoke.mockResolvedValue({ data: { sent: 1 }, error: null });

    await activateWakeFriendAlarm('entry-a', 12);

    expect(mocks.functionsInvoke).toHaveBeenCalledWith('activate-alarm', {
      body: { entryId: 'entry-a', questionCount: 12 },
    });
  });

  it('surfaces an alarm activation error', async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: new Error('boom'),
    });

    await expect(activateWakeFriendAlarm('entry-a')).rejects.toThrow('boom');
  });
});

describe('getAndClearPendingWakeFriendRingInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'my-profile' } },
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle, eq: mocks.eq });
    mocks.update.mockReturnValue({ eq: mocks.eq });
  });

  it('returns and clears a pending question count and ringer name', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        pending_wake_friend_activated_by: '友達A',
        pending_wake_friend_question_count: 12,
      },
      error: null,
    });

    await expect(getAndClearPendingWakeFriendRingInfo()).resolves.toEqual({
      activatedByDisplayName: '友達A',
      questionCount: 12,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      pending_wake_friend_activated_by: null,
      pending_wake_friend_question_count: null,
    });
  });

  it('returns nulls when nothing is pending', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        pending_wake_friend_activated_by: null,
        pending_wake_friend_question_count: null,
      },
      error: null,
    });

    await expect(getAndClearPendingWakeFriendRingInfo()).resolves.toEqual({
      activatedByDisplayName: null,
      questionCount: null,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns nulls when there is no signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getAndClearPendingWakeFriendRingInfo()).resolves.toEqual({
      activatedByDisplayName: null,
      questionCount: null,
    });
  });
});
