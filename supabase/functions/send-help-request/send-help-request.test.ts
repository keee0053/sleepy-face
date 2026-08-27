import { describe, expect, it, vi } from 'vitest';

import {
  SendHelpRequestError,
  sendHelpRequest,
  type SendHelpRequestDeps,
} from './send-help-request';

function buildDeps(
  overrides: Partial<SendHelpRequestDeps> = {},
): SendHelpRequestDeps {
  return {
    listFriendProfileIds: vi.fn().mockResolvedValue(['friend-a', 'friend-b']),
    getRequesterProfile: vi
      .fn()
      .mockResolvedValue({ display_name: 'Requester' }),
    listPushTokens: vi.fn().mockImplementation(async (profileIds: string[]) =>
      [
        { profile_id: 'friend-a', token: 'ExponentPushToken[a]' },
        { profile_id: 'friend-b', token: 'ExponentPushToken[b]' },
      ].filter((row) => profileIds.includes(row.profile_id)),
    ),
    sendPush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('sendHelpRequest', () => {
  it('sends a push to every valid Friend and reports the counts', async () => {
    const deps = buildDeps();

    await expect(
      sendHelpRequest(
        'requester',
        ['friend-a', 'friend-b'],
        '7:10にもう一度起こして',
        deps,
      ),
    ).resolves.toEqual({ notifiedFriendCount: 2, notifiedTokenCount: 2 });

    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({
        title: 'Requester',
        body: '7:10にもう一度起こして',
        to: 'ExponentPushToken[a]',
        data: { requesterProfileId: 'requester', type: 'help-request' },
      }),
      expect.objectContaining({ to: 'ExponentPushToken[b]' }),
    ]);
  });

  it('trims the message', async () => {
    const deps = buildDeps();

    await sendHelpRequest('requester', ['friend-a'], '  help!  ', deps);

    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ body: 'help!' }),
    ]);
  });

  it('deduplicates requested friend ids', async () => {
    const deps = buildDeps();

    await sendHelpRequest('requester', ['friend-a', 'friend-a'], 'help', deps);

    expect(deps.listPushTokens).toHaveBeenCalledWith(['friend-a']);
  });

  it('filters out ids that are not actually Friends', async () => {
    const deps = buildDeps({
      listFriendProfileIds: vi.fn().mockResolvedValue(['friend-a']),
    });

    await sendHelpRequest(
      'requester',
      ['friend-a', 'not-a-friend'],
      'help',
      deps,
    );

    expect(deps.listPushTokens).toHaveBeenCalledWith(['friend-a']);
  });

  it('falls back to a generic display name when the requester profile is missing', async () => {
    const deps = buildDeps({
      getRequesterProfile: vi.fn().mockResolvedValue(null),
    });

    await sendHelpRequest('requester', ['friend-a'], 'help', deps);

    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ title: '友達' }),
    ]);
  });

  it('throws invalid_message for an empty message', async () => {
    const deps = buildDeps();

    await expect(
      sendHelpRequest('requester', ['friend-a'], '   ', deps),
    ).rejects.toMatchObject({ code: 'invalid_message' });
  });

  it('throws invalid_message for an overly long message', async () => {
    const deps = buildDeps();

    await expect(
      sendHelpRequest('requester', ['friend-a'], 'x'.repeat(201), deps),
    ).rejects.toMatchObject({ code: 'invalid_message' });
  });

  it('throws no_recipients for an empty friend list', async () => {
    const deps = buildDeps();

    await expect(
      sendHelpRequest('requester', [], 'help', deps),
    ).rejects.toMatchObject({ code: 'no_recipients' });
  });

  it('throws no_valid_friends when none of the ids are actual Friends', async () => {
    const deps = buildDeps({
      listFriendProfileIds: vi.fn().mockResolvedValue([]),
    });

    await expect(
      sendHelpRequest('requester', ['not-a-friend'], 'help', deps),
    ).rejects.toMatchObject({ code: 'no_valid_friends' });
  });

  it('skips sending a push when no valid friend has a registered token', async () => {
    const deps = buildDeps({ listPushTokens: vi.fn().mockResolvedValue([]) });

    await expect(
      sendHelpRequest('requester', ['friend-a'], 'help', deps),
    ).resolves.toEqual({ notifiedFriendCount: 1, notifiedTokenCount: 0 });
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('is a SendHelpRequestError instance on failure', async () => {
    const deps = buildDeps();

    const error = await sendHelpRequest('requester', [], 'help', deps).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SendHelpRequestError);
  });
});
