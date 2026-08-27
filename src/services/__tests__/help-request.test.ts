import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HelpRequestServiceError, sendHelpRequest } from '../help-request';

const mocks = vi.hoisted(() => ({
  functionsInvoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: mocks.functionsInvoke,
    },
  },
}));

describe('sendHelpRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes send-help-request with the friend ids and message', async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: { notifiedFriendCount: 2, notifiedTokenCount: 2 },
      error: null,
    });

    await sendHelpRequest(['friend-a', 'friend-b'], '7:10にもう一度起こして');

    expect(mocks.functionsInvoke).toHaveBeenCalledWith('send-help-request', {
      body: {
        friendProfileIds: ['friend-a', 'friend-b'],
        message: '7:10にもう一度起こして',
      },
    });
  });

  it('throws a HelpRequestServiceError when the invoke fails', async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: new Error('boom'),
    });

    await expect(sendHelpRequest(['friend-a'], 'help')).rejects.toBeInstanceOf(
      HelpRequestServiceError,
    );
  });
});
