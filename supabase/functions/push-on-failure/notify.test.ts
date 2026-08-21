import { describe, expect, it, vi } from 'vitest';

import {
  buildFailurePushMessages,
  notifyFriendsOfFailure,
  resolveFriendProfileId,
  type NotifyDeps,
} from './notify';

describe('resolveFriendProfileId', () => {
  it('resolves the other side of the relation regardless of which side is the profile', () => {
    expect(
      resolveFriendProfileId(
        { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        'profile-a',
      ),
    ).toBe('profile-b');

    expect(
      resolveFriendProfileId(
        { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        'profile-b',
      ),
    ).toBe('profile-a');
  });
});

describe('buildFailurePushMessages', () => {
  it('builds one message per non-null token, skipping missing tokens', () => {
    expect(
      buildFailurePushMessages('Sleepy User', ['token-1', null, 'token-2']),
    ).toEqual([
      {
        body: 'failed their wake-up challenge 😴',
        title: 'Sleepy User',
        to: 'token-1',
      },
      {
        body: 'failed their wake-up challenge 😴',
        title: 'Sleepy User',
        to: 'token-2',
      },
    ]);
  });

  it('returns no messages when no friend has a token', () => {
    expect(buildFailurePushMessages('Sleepy User', [null, null])).toEqual([]);
  });
});

function makeDeps(overrides: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    getFailedProfile: vi.fn().mockResolvedValue({
      display_name: 'Sleepy User',
      id: 'profile-a',
    }),
    listFriendRelations: vi.fn().mockResolvedValue([]),
    listPushTokens: vi.fn().mockResolvedValue([]),
    sendPush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('notifyFriendsOfFailure', () => {
  it('notifies every friend that has a token', async () => {
    const deps = makeDeps({
      listFriendRelations: vi.fn().mockResolvedValue([
        { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        { friend_profile_id: 'profile-a', profile_id: 'profile-c' },
      ]),
      listPushTokens: vi.fn().mockResolvedValue([
        { id: 'profile-b', push_token: 'token-b' },
        { id: 'profile-c', push_token: 'token-c' },
      ]),
    });

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages).toEqual([
      {
        body: 'failed their wake-up challenge 😴',
        title: 'Sleepy User',
        to: 'token-b',
      },
      {
        body: 'failed their wake-up challenge 😴',
        title: 'Sleepy User',
        to: 'token-c',
      },
    ]);
    expect(deps.listPushTokens).toHaveBeenCalledWith([
      'profile-b',
      'profile-c',
    ]);
    expect(deps.sendPush).toHaveBeenCalledWith(messages);
  });

  it('skips a friend with no token while still notifying the others', async () => {
    const deps = makeDeps({
      listFriendRelations: vi.fn().mockResolvedValue([
        { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        { friend_profile_id: 'profile-c', profile_id: 'profile-a' },
      ]),
      listPushTokens: vi.fn().mockResolvedValue([
        { id: 'profile-b', push_token: null },
        { id: 'profile-c', push_token: 'token-c' },
      ]),
    });

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages).toEqual([
      {
        body: 'failed their wake-up challenge 😴',
        title: 'Sleepy User',
        to: 'token-c',
      },
    ]);
  });

  it('does nothing when the failed user has no friends', async () => {
    const deps = makeDeps();

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages).toEqual([]);
    expect(deps.listPushTokens).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('never includes the failed user themselves as a recipient', async () => {
    const deps = makeDeps({
      listFriendRelations: vi
        .fn()
        .mockResolvedValue([
          { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        ]),
      listPushTokens: vi
        .fn()
        .mockResolvedValue([{ id: 'profile-b', push_token: 'token-b' }]),
    });

    await notifyFriendsOfFailure('profile-a', deps);

    expect(deps.listPushTokens).toHaveBeenCalledWith(['profile-b']);
  });

  it('does nothing when the failed profile cannot be found', async () => {
    const deps = makeDeps({
      getFailedProfile: vi.fn().mockResolvedValue(null),
    });

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages).toEqual([]);
    expect(deps.listFriendRelations).not.toHaveBeenCalled();
  });

  it('does not call sendPush when there are friends but none have a token', async () => {
    const deps = makeDeps({
      listFriendRelations: vi
        .fn()
        .mockResolvedValue([
          { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        ]),
      listPushTokens: vi
        .fn()
        .mockResolvedValue([{ id: 'profile-b', push_token: null }]),
    });

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages).toEqual([]);
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
