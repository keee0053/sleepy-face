import { describe, expect, it, vi } from 'vitest';

import {
  ActivateWakeFriendAlarmError,
  activateWakeFriendAlarm,
  buildWakeFriendPushMessages,
  type ActivateWakeFriendAlarmDeps,
  type FailureLogEntryRow,
} from './activate';

function buildEntry(
  overrides: Partial<FailureLogEntryRow> = {},
): FailureLogEntryRow {
  return {
    activated_at: null,
    created_at: '2026-08-25T00:00:00.000Z',
    id: 'entry-1',
    profile_id: 'failed-profile',
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<ActivateWakeFriendAlarmDeps> = {},
): ActivateWakeFriendAlarmDeps {
  return {
    getEntry: vi.fn().mockResolvedValue(buildEntry()),
    getRequesterProfile: vi
      .fn()
      .mockResolvedValue({ display_name: 'Requester' }),
    isFriend: vi.fn().mockResolvedValue(true),
    listPushTokens: vi
      .fn()
      .mockResolvedValue([{ token: 'ExponentPushToken[abc]' }]),
    markActivated: vi.fn().mockResolvedValue(undefined),
    sendPush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('buildWakeFriendPushMessages', () => {
  it('builds one high-priority data message per token', () => {
    expect(
      buildWakeFriendPushMessages('entry-1', 'Alex', ['token-a', 'token-b']),
    ).toEqual([
      {
        body: 'Alexがあなたのアラームを鳴らしました。',
        data: {
          activatedByDisplayName: 'Alex',
          failureEntryId: 'entry-1',
          type: 'wake-friend-activate',
        },
        priority: 'high',
        title: '起こしてもらいました！',
        to: 'token-a',
      },
      {
        body: 'Alexがあなたのアラームを鳴らしました。',
        data: {
          activatedByDisplayName: 'Alex',
          failureEntryId: 'entry-1',
          type: 'wake-friend-activate',
        },
        priority: 'high',
        title: '起こしてもらいました！',
        to: 'token-b',
      },
    ]);
  });
});

describe('activateWakeFriendAlarm', () => {
  it('marks the entry activated and pushes to every registered token', async () => {
    const deps = buildDeps();

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).resolves.toEqual({ notifiedTokenCount: 1, status: 'activated' });

    expect(deps.markActivated).toHaveBeenCalledWith('entry-1', NOW);
    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[abc]' }),
    ]);
  });

  it('falls back to a generic display name when the requester profile is missing', async () => {
    const deps = buildDeps({
      getRequesterProfile: vi.fn().mockResolvedValue(null),
    });

    await activateWakeFriendAlarm('entry-1', 'requester', deps, NOW);

    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({
        body: '友達があなたのアラームを鳴らしました。',
      }),
    ]);
  });

  it('is idempotent: returns already_activated without re-pushing', async () => {
    const deps = buildDeps({
      getEntry: vi
        .fn()
        .mockResolvedValue(
          buildEntry({ activated_at: '2026-08-25T11:00:00.000Z' }),
        ),
    });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).resolves.toEqual({ status: 'already_activated' });

    expect(deps.markActivated).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('throws entry_not_found for a nonexistent entry', async () => {
    const deps = buildDeps({ getEntry: vi.fn().mockResolvedValue(null) });

    await expect(
      activateWakeFriendAlarm('missing', 'requester', deps, NOW),
    ).rejects.toMatchObject({ code: 'entry_not_found' });
    expect(
      await activateWakeFriendAlarm('missing', 'requester', deps, NOW).catch(
        (error: unknown) => error,
      ),
    ).toBeInstanceOf(ActivateWakeFriendAlarmError);
  });

  it('throws cannot_activate_own_entry when the requester owns the entry', async () => {
    const deps = buildDeps({
      getEntry: vi
        .fn()
        .mockResolvedValue(buildEntry({ profile_id: 'requester' })),
    });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).rejects.toMatchObject({ code: 'cannot_activate_own_entry' });
    expect(deps.markActivated).not.toHaveBeenCalled();
  });

  it('throws not_friends when the requester is not a Friend of the failed Profile', async () => {
    const deps = buildDeps({ isFriend: vi.fn().mockResolvedValue(false) });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).rejects.toMatchObject({ code: 'not_friends' });
    expect(deps.markActivated).not.toHaveBeenCalled();
  });

  it('throws entry_expired for an entry more than 24h old', async () => {
    const deps = buildDeps({
      getEntry: vi
        .fn()
        .mockResolvedValue(
          buildEntry({ created_at: '2026-08-24T11:59:00.000Z' }),
        ),
    });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).rejects.toMatchObject({ code: 'entry_expired' });
    expect(deps.markActivated).not.toHaveBeenCalled();
  });

  it('skips sending a push when the target has no registered tokens', async () => {
    const deps = buildDeps({ listPushTokens: vi.fn().mockResolvedValue([]) });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).resolves.toEqual({ notifiedTokenCount: 0, status: 'activated' });
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
