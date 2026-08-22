import { describe, expect, it, vi } from 'vitest';

import {
  activateAlarm,
  buildActivationPushMessages,
  type ActivateAlarmDeps,
} from './notify';

describe('buildActivationPushMessages', () => {
  it('builds one alarm-activation message per token', () => {
    expect(buildActivationPushMessages(['token-1', 'token-2'])).toEqual([
      {
        body: expect.any(String),
        data: { type: 'alarm-activation' },
        title: expect.any(String),
        to: 'token-1',
      },
      {
        body: expect.any(String),
        data: { type: 'alarm-activation' },
        title: expect.any(String),
        to: 'token-2',
      },
    ]);
  });

  it('returns no messages when there are no tokens', () => {
    expect(buildActivationPushMessages([])).toEqual([]);
  });
});

function makeDeps(
  overrides: Partial<ActivateAlarmDeps> = {},
): ActivateAlarmDeps {
  return {
    listPushTokens: vi.fn().mockResolvedValue([]),
    markActivated: vi.fn().mockResolvedValue({ profile_id: 'profile-b' }),
    sendPush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('activateAlarm', () => {
  it('marks the entry activated and pushes to every registered device', async () => {
    const deps = makeDeps({
      listPushTokens: vi.fn().mockResolvedValue([
        { profile_id: 'profile-b', token: 'token-b-phone' },
        { profile_id: 'profile-b', token: 'token-b-tablet' },
      ]),
    });

    const outcome = await activateAlarm('entry-1', 'profile-a', deps);

    expect(deps.markActivated).toHaveBeenCalledWith('entry-1', 'profile-a');
    expect(deps.listPushTokens).toHaveBeenCalledWith('profile-b');
    expect(outcome.status).toBe('activated');
    expect(deps.sendPush).toHaveBeenCalledWith(
      outcome.status === 'activated' ? outcome.messages : [],
    );
    if (outcome.status === 'activated') {
      expect(outcome.messages.map((message) => message.to)).toEqual([
        'token-b-phone',
        'token-b-tablet',
      ]);
    }
  });

  it('rejects and sends nothing when the entry is already activated', async () => {
    const deps = makeDeps({
      markActivated: vi.fn().mockResolvedValue(null),
    });

    const outcome = await activateAlarm('entry-1', 'profile-a', deps);

    expect(outcome).toEqual({ status: 'already-activated-or-not-found' });
    expect(deps.listPushTokens).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('rejects and sends nothing when the entry does not exist', async () => {
    const deps = makeDeps({
      markActivated: vi.fn().mockResolvedValue(null),
    });

    const outcome = await activateAlarm('does-not-exist', 'profile-a', deps);

    expect(outcome).toEqual({ status: 'already-activated-or-not-found' });
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('marks the entry activated but sends nothing when there are no registered devices', async () => {
    const deps = makeDeps({ listPushTokens: vi.fn().mockResolvedValue([]) });

    const outcome = await activateAlarm('entry-1', 'profile-a', deps);

    expect(deps.markActivated).toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'activated', messages: [] });
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('propagates a markActivated failure', async () => {
    const deps = makeDeps({
      markActivated: vi
        .fn()
        .mockRejectedValue(
          new Error('Could not mark the failure log entry activated.'),
        ),
    });

    await expect(activateAlarm('entry-1', 'profile-a', deps)).rejects.toThrow(
      'Could not mark the failure log entry activated.',
    );
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('propagates a listPushTokens failure', async () => {
    const deps = makeDeps({
      listPushTokens: vi
        .fn()
        .mockRejectedValue(new Error('Could not load push tokens.')),
    });

    await expect(activateAlarm('entry-1', 'profile-a', deps)).rejects.toThrow(
      'Could not load push tokens.',
    );
    expect(deps.sendPush).not.toHaveBeenCalled();
  });
});
