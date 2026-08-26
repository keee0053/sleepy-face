import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccountError, deleteAccount } from '../account';

const mocks = vi.hoisted(() => ({
  functionsInvoke: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    functions: {
      invoke: mocks.functionsInvoke,
    },
  },
}));

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the delete-account function for the authenticated user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.functionsInvoke.mockResolvedValue({
      data: { ok: true },
      error: null,
    });

    await deleteAccount();

    expect(mocks.functionsInvoke).toHaveBeenCalledWith('delete-account');
  });

  it('throws not_authenticated when there is no signed-in user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await expect(deleteAccount()).rejects.toMatchObject({
      code: 'not_authenticated',
    });
    expect(mocks.functionsInvoke).not.toHaveBeenCalled();
  });

  it('throws unexpected_error when the function call fails', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: new Error('boom'),
    });

    await expect(deleteAccount()).rejects.toBeInstanceOf(DeleteAccountError);
    await expect(deleteAccount()).rejects.toMatchObject({
      code: 'unexpected_error',
    });
  });
});
