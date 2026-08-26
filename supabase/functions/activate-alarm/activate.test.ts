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
    created_at: '2026-08-25T11:45:00.000Z',
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
    setPendingQuestionCount: vi.fn().mockResolvedValue(undefined),
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
        data: {
          activatedByDisplayName: 'Alex',
          failureEntryId: 'entry-1',
          type: 'wake-friend-activate',
        },
        priority: 'high',
        to: 'token-a',
      },
      {
        data: {
          activatedByDisplayName: 'Alex',
          failureEntryId: 'entry-1',
          type: 'wake-friend-activate',
        },
        priority: 'high',
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

    expect(deps.markActivated).toHaveBeenCalledWith('failed-profile', NOW);
    expect(deps.setPendingQuestionCount).toHaveBeenCalledWith(
      'failed-profile',
      null,
    );
    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[abc]' }),
    ]);
  });

  it('stores the requested question count for the target to pick up', async () => {
    const deps = buildDeps();

    await activateWakeFriendAlarm('entry-1', 'requester', deps, NOW, 12);

    expect(deps.setPendingQuestionCount).toHaveBeenCalledWith(
      'failed-profile',
      12,
    );
  });

  it('falls back to a generic display name when the requester profile is missing', async () => {
    const deps = buildDeps({
      getRequesterProfile: vi.fn().mockResolvedValue(null),
    });

    await activateWakeFriendAlarm('entry-1', 'requester', deps, NOW);

    expect(deps.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({ activatedByDisplayName: '友達' }),
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

  it('throws entry_expired for an entry more than 30 minutes old', async () => {
    const deps = buildDeps({
      getEntry: vi
        .fn()
        .mockResolvedValue(
          buildEntry({ created_at: '2026-08-25T11:29:00.000Z' }),
        ),
    });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).rejects.toMatchObject({ code: 'entry_expired' });
    expect(deps.markActivated).not.toHaveBeenCalled();
  });

  it('allows an entry exactly at the 30 minute boundary', async () => {
    const deps = buildDeps({
      getEntry: vi
        .fn()
        .mockResolvedValue(
          buildEntry({ created_at: '2026-08-25T11:30:00.000Z' }),
        ),
    });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).resolves.toMatchObject({ status: 'activated' });
  });

  it('skips sending a push when the target has no registered tokens', async () => {
    const deps = buildDeps({ listPushTokens: vi.fn().mockResolvedValue([]) });

    await expect(
      activateWakeFriendAlarm('entry-1', 'requester', deps, NOW),
    ).resolves.toEqual({ notifiedTokenCount: 0, status: 'activated' });
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
