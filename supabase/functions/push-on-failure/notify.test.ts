import { describe, expect, it, vi } from 'vitest';

import {
  buildFailurePushMessages,
  notifyFriendsOfFailure,
  resolveFriendProfileId,
  unwrapRowOrThrow,
  unwrapRowsOrThrow,
  type NotifyDeps,
} from './notify';

describe('unwrapRowOrThrow', () => {
  it('returns the row when there is no error', () => {
    expect(
      unwrapRowOrThrow({ id: '1' }, null, 'Could not load the row.'),
    ).toEqual({ id: '1' });
  });

  it('returns null when there is no error and no matching row', () => {
    expect(unwrapRowOrThrow(null, null, 'Could not load the row.')).toBeNull();
  });

  it('throws when there is an error, even if data is non-null', () => {
    const queryError = new Error('connection reset');

    expect(() =>
      unwrapRowOrThrow({ id: '1' }, queryError, 'Could not load the row.'),
    ).toThrowError('Could not load the row.');
  });

  it('throws when there is an error and data is null', () => {
    const queryError = new Error('connection reset');

    expect(() =>
      unwrapRowOrThrow(null, queryError, 'Could not load the row.'),
    ).toThrowError('Could not load the row.');
  });
});

describe('unwrapRowsOrThrow', () => {
  it('returns the rows when there is no error', () => {
    expect(
      unwrapRowsOrThrow([{ id: '1' }], null, 'Could not load rows.'),
    ).toEqual([{ id: '1' }]);
  });

  it('returns an empty array when there is no error and no rows', () => {
    expect(unwrapRowsOrThrow([], null, 'Could not load rows.')).toEqual([]);
  });

  it('throws when there is an error, even if data is non-null', () => {
    const queryError = new Error('connection reset');

    expect(() =>
      unwrapRowsOrThrow([{ id: '1' }], queryError, 'Could not load rows.'),
    ).toThrowError('Could not load rows.');
  });

  it('throws when there is an error and data is null', () => {
    const queryError = new Error('connection reset');

    expect(() =>
      unwrapRowsOrThrow(null, queryError, 'Could not load rows.'),
    ).toThrowError('Could not load rows.');
  });
});

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

  it('propagates a getFailedProfile failure instead of treating it as no such profile', async () => {
    const deps = makeDeps({
      getFailedProfile: vi
        .fn()
        .mockRejectedValue(new Error('Could not load the failed profile.')),
    });

    await expect(notifyFriendsOfFailure('profile-a', deps)).rejects.toThrow(
      'Could not load the failed profile.',
    );
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

  it('propagates a listFriendRelations failure instead of treating it as no friends', async () => {
    const deps = makeDeps({
      listFriendRelations: vi
        .fn()
        .mockRejectedValue(new Error('Could not load friend relations.')),
    });

    await expect(notifyFriendsOfFailure('profile-a', deps)).rejects.toThrow(
      'Could not load friend relations.',
    );
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('propagates a listPushTokens failure instead of treating it as no devices', async () => {
    const deps = makeDeps({
      listFriendRelations: vi
        .fn()
        .mockResolvedValue([
          { friend_profile_id: 'profile-b', profile_id: 'profile-a' },
        ]),
      listPushTokens: vi
        .fn()
        .mockRejectedValue(new Error('Could not load push tokens.')),
    });

    await expect(notifyFriendsOfFailure('profile-a', deps)).rejects.toThrow(
      'Could not load push tokens.',
    );
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
