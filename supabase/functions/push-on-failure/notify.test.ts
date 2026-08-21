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
  it('builds one message per token', () => {
    expect(
      buildFailurePushMessages('Sleepy User', ['token-1', 'token-2']),
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

  it('returns no messages when there are no tokens', () => {
    expect(buildFailurePushMessages('Sleepy User', [])).toEqual([]);
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
  it('notifies every friend that has a registered device', async () => {
    const deps = makeDeps({
      listFriendRelations: vi.fn().mockResolvedValue([
        { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        { friend_profile_id: 'profile-a', profile_id: 'profile-c' },
      ]),
      listPushTokens: vi.fn().mockResolvedValue([
        { profile_id: 'profile-b', token: 'token-b' },
        { profile_id: 'profile-c', token: 'token-c' },
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

  it('notifies every device of a friend with multiple registered devices', async () => {
    const deps = makeDeps({
      listFriendRelations: vi
        .fn()
        .mockResolvedValue([
          { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        ]),
      listPushTokens: vi.fn().mockResolvedValue([
        { profile_id: 'profile-b', token: 'token-b-phone' },
        { profile_id: 'profile-b', token: 'token-b-tablet' },
      ]),
    });

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages.map((message) => message.to)).toEqual([
      'token-b-phone',
      'token-b-tablet',
    ]);
  });

  it('skips a friend with no registered device while still notifying the others', async () => {
    const deps = makeDeps({
      listFriendRelations: vi.fn().mockResolvedValue([
        { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        { friend_profile_id: 'profile-c', profile_id: 'profile-a' },
      ]),
      listPushTokens: vi
        .fn()
        .mockResolvedValue([{ profile_id: 'profile-c', token: 'token-c' }]),
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
        .mockResolvedValue([{ profile_id: 'profile-b', token: 'token-b' }]),
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

  it('does not call sendPush when there are friends but none have a registered device', async () => {
    const deps = makeDeps({
      listFriendRelations: vi
        .fn()
        .mockResolvedValue([
          { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        ]),
      listPushTokens: vi.fn().mockResolvedValue([]),
    });

    const messages = await notifyFriendsOfFailure('profile-a', deps);

    expect(messages).toEqual([]);
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
