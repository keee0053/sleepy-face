import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listTodayWakeStatuses,
  recordWakeAttemptOutcome,
} from '../wake-status';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  getWakeChallengeAttempt: vi.fn(),
  in: vi.fn(),
  select: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

vi.mock('@/services/wake-challenge-attempt', async () => {
  const actual = await vi.importActual<
    typeof import('../wake-challenge-attempt')
  >('../wake-challenge-attempt');

  return {
    ...actual,
    getWakeChallengeAttempt: mocks.getWakeChallengeAttempt,
  };
});

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

describe('recordWakeAttemptOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
  });

  it('upserts using the in-progress attempt record startedAt/localDay', async () => {
    mockAuthenticatedUser();
    mocks.getWakeChallengeAttempt.mockResolvedValue({
      alarmId: 'alarm-1',
      localDay: '2026-08-25',
      startedAt: '2026-08-25T22:02:00.000Z',
    });
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.upsert.mockResolvedValue({ error: null });

    await recordWakeAttemptOutcome('success', 10);

    expect(mocks.from).toHaveBeenCalledWith('wake_attempt_log');
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        fired_at: '2026-08-25T22:02:00.000Z',
        local_day: '2026-08-25',
        outcome: 'success',
        profile_id: 'profile-a',
        required_question_count: 10,
      },
      { onConflict: 'profile_id,local_day' },
    );
  });

  it('falls back to now/today when there is no in-progress attempt record', async () => {
    mockAuthenticatedUser();
    mocks.getWakeChallengeAttempt.mockResolvedValue(null);
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.upsert.mockResolvedValue({ error: null });

    await recordWakeAttemptOutcome('failure');

    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        fired_at: '2026-08-26T00:00:00.000Z',
        local_day: '2026-08-26',
        outcome: 'failure',
        profile_id: 'profile-a',
        required_question_count: null,
      },
      { onConflict: 'profile_id,local_day' },
    );
  });

  it('does nothing when the user is not authenticated', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });
    mocks.getWakeChallengeAttempt.mockResolvedValue(null);

    await recordWakeAttemptOutcome('success');

    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('listTodayWakeStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
  });

  it('returns an empty map without querying when there are no friend ids', async () => {
    await expect(listTodayWakeStatuses([])).resolves.toEqual(new Map());
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('maps each row by profile id for today', async () => {
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ in: mocks.in });
    mocks.in.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({
      data: [
        {
          fired_at: '2026-08-26T21:05:00.000Z',
          local_day: '2026-08-26',
          outcome: 'success',
          profile_id: 'profile-b',
          required_question_count: 10,
        },
      ],
      error: null,
    });

    await expect(
      listTodayWakeStatuses(['profile-b', 'profile-c']),
    ).resolves.toEqual(
      new Map([
        [
          'profile-b',
          {
            firedAt: '2026-08-26T21:05:00.000Z',
            localDay: '2026-08-26',
            outcome: 'success',
            profileId: 'profile-b',
            requiredQuestionCount: 10,
          },
        ],
      ]),
    );
    expect(mocks.in).toHaveBeenCalledWith('profile_id', [
      'profile-b',
      'profile-c',
    ]);
    expect(mocks.eq).toHaveBeenCalledWith('local_day', '2026-08-26');
  });

  it('throws on a Supabase error', async () => {
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ in: mocks.in });
    mocks.in.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(listTodayWakeStatuses(['profile-b'])).rejects.toThrow('boom');
  });
});
