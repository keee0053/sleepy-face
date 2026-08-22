import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateAlarm,
  FailureLogServiceError,
  listUnconsumedFailureLogEntries,
  recordFailureEvent,
} from '../failure-log';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  functionsInvoke: vi.fn(),
  getUser: vi.fn(),
  gte: vi.fn(),
  in: vi.fn(),
  insert: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
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

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

function expectFailureLogServiceError(
  error: unknown,
  code: FailureLogServiceError['code'],
) {
  expect(error).toBeInstanceOf(FailureLogServiceError);
  expect((error as FailureLogServiceError).code).toBe(code);
}

describe('recordFailureEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it('inserts a failure log entry for the current user and reason', async () => {
    mockAuthenticatedUser('profile-a');
    mocks.insert.mockResolvedValue({ error: null });

    await recordFailureEvent('quiz-timeout');

    expect(mocks.from).toHaveBeenCalledWith('failure_log_entries');
    expect(mocks.insert).toHaveBeenCalledWith({
      failure_reason: 'quiz-timeout',
      profile_id: 'profile-a',
    });
  });

  it.each([
    'app-quit',
    'bad-photo-limit',
    'no-photo-timeout',
    'quiz-timeout',
    'quiz-upload-failed',
  ] as const)('inserts the %s failure reason', async (reason) => {
    mockAuthenticatedUser('profile-a');
    mocks.insert.mockResolvedValue({ error: null });

    await recordFailureEvent(reason);

    expect(mocks.insert).toHaveBeenCalledWith({
      failure_reason: reason,
      profile_id: 'profile-a',
    });
  });

  it('throws a typed error when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(recordFailureEvent('app-quit')).rejects.toSatisfy((error) => {
      expectFailureLogServiceError(error, 'not_authenticated');
      return true;
    });

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('wraps an insert failure in a typed service error', async () => {
    mockAuthenticatedUser('profile-a');
    mocks.insert.mockResolvedValue({ error: new Error('boom') });

    await expect(recordFailureEvent('app-quit')).rejects.toSatisfy((error) => {
      expectFailureLogServiceError(error, 'unexpected_error');
      return true;
    });
  });
});

describe('listUnconsumedFailureLogEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ in: mocks.in });
    mocks.in.mockReturnValue({ is: mocks.is });
    mocks.is.mockReturnValue({ gte: mocks.gte });
  });

  it('returns no entries and skips the query when there are no friend ids', async () => {
    const entries = await listUnconsumedFailureLogEntries([]);

    expect(entries).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('queries unconsumed entries for the given friends since the start of the local day', async () => {
    mocks.gte.mockResolvedValue({
      data: [
        { id: 'entry-1', profile_id: 'profile-b' },
        { id: 'entry-2', profile_id: 'profile-c' },
      ],
      error: null,
    });

    const entries = await listUnconsumedFailureLogEntries(
      ['profile-b', 'profile-c'],
      new Date('2026-08-22T15:30:00.000Z'),
    );

    expect(entries).toEqual([
      { id: 'entry-1', profileId: 'profile-b' },
      { id: 'entry-2', profileId: 'profile-c' },
    ]);
    expect(mocks.from).toHaveBeenCalledWith('failure_log_entries');
    expect(mocks.select).toHaveBeenCalledWith('id, profile_id');
    expect(mocks.in).toHaveBeenCalledWith('profile_id', [
      'profile-b',
      'profile-c',
    ]);
    expect(mocks.is).toHaveBeenCalledWith('activated_at', null);
    expect(mocks.gte).toHaveBeenCalledWith(
      'created_at',
      expect.stringContaining('2026-08-22'),
    );
  });

  it('wraps a query failure in a typed service error', async () => {
    mocks.gte.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(
      listUnconsumedFailureLogEntries(['profile-b']),
    ).rejects.toSatisfy((error) => {
      expectFailureLogServiceError(error, 'unexpected_error');
      return true;
    });
  });
});

describe('activateAlarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the activate-alarm function with the entry id', async () => {
    mocks.functionsInvoke.mockResolvedValue({ data: { sent: 1 }, error: null });

    await activateAlarm('entry-1');

    expect(mocks.functionsInvoke).toHaveBeenCalledWith('activate-alarm', {
      body: { entryId: 'entry-1' },
    });
  });

  it('wraps an invocation failure in a typed service error', async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: new Error('boom'),
    });

    await expect(activateAlarm('entry-1')).rejects.toSatisfy((error) => {
      expectFailureLogServiceError(error, 'unexpected_error');
      return true;
    });
  });
});
