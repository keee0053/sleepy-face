import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearWakeChallengeAttempt,
  getAbandonedWakeChallengeAttemptOutcome,
  getWakeChallengeAttempt,
  startWakeChallengeAttempt,
  WakeChallengeAttemptServiceError,
  type WakeChallengeAttemptRecord,
} from '../wake-challenge-attempt';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    removeItem: mocks.removeItem,
    setItem: mocks.setItem,
  },
}));

function expectServiceError(
  error: unknown,
  code: WakeChallengeAttemptServiceError['code'],
) {
  expect(error).toBeInstanceOf(WakeChallengeAttemptServiceError);
  expect((error as WakeChallengeAttemptServiceError).code).toBe(code);
}

function storedRecord(
  overrides: Partial<WakeChallengeAttemptRecord> = {},
): WakeChallengeAttemptRecord {
  return {
    alarmId: 'alarm-1',
    localDay: '2026-08-19',
    startedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('Wake Challenge Attempt service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00.000Z'));
    mocks.getItem.mockResolvedValue(null);
    mocks.removeItem.mockResolvedValue(undefined);
    mocks.setItem.mockResolvedValue(undefined);
  });

  it('reads null when no attempt record is stored', async () => {
    await expect(getWakeChallengeAttempt()).resolves.toBeNull();
    expect(mocks.getItem).toHaveBeenCalledWith(
      'sleepy-face:wake-challenge-attempt',
    );
  });

  it('starts an attempt with the local day and started-at timestamp', async () => {
    await expect(
      startWakeChallengeAttempt({ alarmId: 'alarm-1' }),
    ).resolves.toEqual({
      alarmId: 'alarm-1',
      localDay: '2026-08-19',
      startedAt: '2026-08-19T00:00:00.000Z',
    });

    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:wake-challenge-attempt',
      JSON.stringify({
        alarmId: 'alarm-1',
        localDay: '2026-08-19',
        startedAt: '2026-08-19T00:00:00.000Z',
      }),
    );
  });

  it('starts an attempt with a null alarmId when none is given', async () => {
    await expect(startWakeChallengeAttempt()).resolves.toEqual({
      alarmId: null,
      localDay: '2026-08-19',
      startedAt: '2026-08-19T00:00:00.000Z',
    });
  });

  it('reads back a stored attempt record', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify(storedRecord()));

    await expect(getWakeChallengeAttempt()).resolves.toEqual(storedRecord());
  });

  it('clears the stored attempt record', async () => {
    await clearWakeChallengeAttempt();

    expect(mocks.removeItem).toHaveBeenCalledWith(
      'sleepy-face:wake-challenge-attempt',
    );
  });

  it('wraps a storage read failure in a typed service error', async () => {
    mocks.getItem.mockRejectedValue(new Error('boom'));

    await expect(getWakeChallengeAttempt()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'storage_read_failed');
      return true;
    });
  });

  it('wraps a storage write failure in a typed service error', async () => {
    mocks.setItem.mockRejectedValue(new Error('boom'));

    await expect(startWakeChallengeAttempt()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'storage_write_failed');
      return true;
    });
  });

  it('wraps a storage clear failure in a typed service error', async () => {
    mocks.removeItem.mockRejectedValue(new Error('boom'));

    await expect(clearWakeChallengeAttempt()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'storage_clear_failed');
      return true;
    });
  });

  it('wraps malformed stored data in a typed parse-failure error', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify({ nope: true }));

    await expect(getWakeChallengeAttempt()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'storage_parse_failed');
      return true;
    });
  });

  it('wraps unparsable stored data in a typed parse-failure error', async () => {
    mocks.getItem.mockResolvedValue('not json');

    await expect(getWakeChallengeAttempt()).rejects.toSatisfy((error) => {
      expectServiceError(error, 'storage_parse_failed');
      return true;
    });
  });
});

describe('getAbandonedWakeChallengeAttemptOutcome', () => {
  it('reports no abandonment when there is no record', () => {
    expect(getAbandonedWakeChallengeAttemptOutcome(null)).toEqual({
      abandoned: false,
    });
  });

  it('reports abandonment for a leftover record found well after it started', () => {
    const record = storedRecord();
    const now = new Date('2026-08-19T00:05:00.000Z');

    expect(getAbandonedWakeChallengeAttemptOutcome(record, now)).toEqual({
      abandoned: true,
      blockedLocalDay: '2026-08-19',
    });
  });

  it('blocks the record own local day even when checked on a later day', () => {
    const record = storedRecord({ localDay: '2026-08-18' });
    const now = new Date('2026-08-19T00:05:00.000Z');

    expect(getAbandonedWakeChallengeAttemptOutcome(record, now)).toEqual({
      abandoned: true,
      blockedLocalDay: '2026-08-18',
    });
  });

  it('does not report abandonment for a record still within the grace period', () => {
    const record = storedRecord({ startedAt: '2026-08-19T00:00:00.000Z' });
    const now = new Date('2026-08-19T00:01:00.000Z');

    expect(getAbandonedWakeChallengeAttemptOutcome(record, now)).toEqual({
      abandoned: false,
    });
  });

  it('does not report abandonment when elapsed time exceeds the nominal 120s timer but stays within the pause-time buffer', () => {
    const record = storedRecord({ startedAt: '2026-08-19T00:00:00.000Z' });
    const now = new Date('2026-08-19T00:03:00.000Z');

    expect(getAbandonedWakeChallengeAttemptOutcome(record, now)).toEqual({
      abandoned: false,
    });
  });

  it('treats an unparsable startedAt as abandoned regardless of when checked', () => {
    const record = storedRecord({ startedAt: 'not-a-date' });

    expect(
      getAbandonedWakeChallengeAttemptOutcome(
        record,
        new Date('2026-08-19T00:00:01.000Z'),
      ),
    ).toEqual({ abandoned: true, blockedLocalDay: '2026-08-19' });
  });
});
