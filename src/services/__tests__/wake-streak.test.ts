import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSuccessStreak } from '../wake-streak';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

describe('getSuccessStreak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'my-profile' } },
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockReturnValue({ limit: mocks.limit });
  });

  it('counts consecutive successful days ending today', async () => {
    mocks.limit.mockResolvedValue({
      data: [
        { local_day: '2026-08-28', outcome: 'success' },
        { local_day: '2026-08-27', outcome: 'success' },
        { local_day: '2026-08-26', outcome: 'success' },
        { local_day: '2026-08-25', outcome: 'failure' },
      ],
      error: null,
    });

    await expect(getSuccessStreak()).resolves.toBe(3);
  });

  it('returns 0 when the most recent day was a failure', async () => {
    mocks.limit.mockResolvedValue({
      data: [{ local_day: '2026-08-28', outcome: 'failure' }],
      error: null,
    });

    await expect(getSuccessStreak()).resolves.toBe(0);
  });

  it('breaks the streak on a gap day with no logged row', async () => {
    mocks.limit.mockResolvedValue({
      data: [
        { local_day: '2026-08-28', outcome: 'success' },
        // 2026-08-27 skipped entirely
        { local_day: '2026-08-26', outcome: 'success' },
      ],
      error: null,
    });

    await expect(getSuccessStreak()).resolves.toBe(1);
  });

  it('returns 0 when there is no history', async () => {
    mocks.limit.mockResolvedValue({ data: [], error: null });

    await expect(getSuccessStreak()).resolves.toBe(0);
  });

  it('returns 0 when there is no signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getSuccessStreak()).resolves.toBe(0);
  });

  it('returns 0 on a query error', async () => {
    mocks.limit.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(getSuccessStreak()).resolves.toBe(0);
  });
});
