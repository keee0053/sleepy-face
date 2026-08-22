import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UserServiceError,
  completeInitialProfileSetup,
  createProfile,
  getMyProfile,
  updateProfile,
  validateInitialSetupInput,
  validateProfileUpdateInput,
} from '../user';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

function setupProfileQuery() {
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
}

function expectUserServiceError(
  error: unknown,
  code: UserServiceError['code'],
) {
  expect(error).toBeInstanceOf(UserServiceError);
  expect((error as UserServiceError).code).toBe(code);
}

describe('user service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProfileQuery();
  });

  it('returns null when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await expect(getMyProfile()).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns null when the authenticated user has no Profile yet', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(getMyProfile()).resolves.toBeNull();
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'auth-user-id');
  });

  it('returns the current Profile when Initial Setup is complete', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        created_at: '2026-08-16T00:00:00.000Z',
        display_name: 'Sleepy User',
        icon_url: 'woman',
        id: 'auth-user-id',
        user_id: 'sleepy-user',
      },
      error: null,
    });

    await expect(getMyProfile()).resolves.toEqual({
      createdAt: '2026-08-16T00:00:00.000Z',
      displayName: 'Sleepy User',
      iconId: 'woman',
      id: 'auth-user-id',
      userId: 'sleepy-user',
    });
  });

  it('falls back to the default icon when a Profile has no recognized icon', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        created_at: '2026-08-16T00:00:00.000Z',
        display_name: 'Sleepy User',
        icon_url: null,
        id: 'auth-user-id',
        user_id: 'sleepy-user',
      },
      error: null,
    });

    await expect(getMyProfile()).resolves.toMatchObject({
      iconId: 'human',
    });
  });

  it('creates a Profile with public User ID, Display Name, and icon', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        data: {
          created_at: '2026-08-16T00:00:00.000Z',
          display_name: 'Sleepy User',
          icon_url: 'boy',
          profile_id: 'auth-user-id',
          user_id: 'sleepy-user',
        },
        status: 'ok',
      },
      error: null,
    });

    await expect(
      createProfile({
        displayName: 'Sleepy User',
        iconId: 'boy',
        publicUserId: 'sleepy-user',
      }),
    ).resolves.toEqual({
      createdAt: '2026-08-16T00:00:00.000Z',
      displayName: 'Sleepy User',
      iconId: 'boy',
      id: 'auth-user-id',
      userId: 'sleepy-user',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('create_profile', {
      display_name: 'Sleepy User',
      icon_id: 'boy',
      user_id: 'sleepy-user',
    });
  });

  it('maps an invalid icon identifier to a typed user-service error', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'invalid_profile_input',
        error: 'Unknown icon.',
        status: 'error',
      },
      error: null,
    });

    await createProfile({
      displayName: 'Sleepy User',
      iconId: 'boy',
      publicUserId: 'sleepy-user',
    }).catch((error: unknown) => {
      expectUserServiceError(error, 'invalid_profile_input');
    });
  });

  it('maps duplicate public User ID to a typed user-service error', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'user_id_already_taken',
        error: 'User ID is already taken.',
        status: 'error',
      },
      error: null,
    });

    await createProfile({
      displayName: 'Sleepy User',
      iconId: 'human',
      publicUserId: 'sleepy-user',
    }).catch((error: unknown) => {
      expectUserServiceError(error, 'user_id_already_taken');
    });
  });

  it('maps already-created Profile to a typed user-service error', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'profile_already_created',
        error: 'Profile already exists.',
        status: 'error',
      },
      error: null,
    });

    await createProfile({
      displayName: 'Sleepy User',
      iconId: 'human',
      publicUserId: 'sleepy-user',
    }).catch((error: unknown) => {
      expectUserServiceError(error, 'profile_already_created');
    });
  });

  it('maps not-authenticated Profile creation to a typed user-service error', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'not_authenticated',
        error: 'Authentication is required.',
        status: 'error',
      },
      error: null,
    });

    await createProfile({
      displayName: 'Sleepy User',
      iconId: 'human',
      publicUserId: 'sleepy-user',
    }).catch((error: unknown) => {
      expectUserServiceError(error, 'not_authenticated');
    });
  });

  it('maps Supabase RPC failures to unexpected user-service errors', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: new Error('network failed'),
    });

    await createProfile({
      displayName: 'Sleepy User',
      iconId: 'human',
      publicUserId: 'sleepy-user',
    }).catch((error: unknown) => {
      expectUserServiceError(error, 'unexpected_error');
    });
  });

  it('updates the Display Name and Profile Icon of the current Profile', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: {
        created_at: '2026-08-16T00:00:00.000Z',
        display_name: 'New Name',
        icon_url: 'woman',
        id: 'auth-user-id',
        user_id: 'sleepy-user',
      },
      error: null,
    });

    await expect(
      updateProfile({ displayName: 'New Name', iconId: 'woman' }),
    ).resolves.toEqual({
      createdAt: '2026-08-16T00:00:00.000Z',
      displayName: 'New Name',
      iconId: 'woman',
      id: 'auth-user-id',
      userId: 'sleepy-user',
    });
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.update).toHaveBeenCalledWith({
      display_name: 'New Name',
      icon_url: 'woman',
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'auth-user-id');
  });

  it('rejects invalid Profile update input before calling Supabase', async () => {
    await updateProfile({ displayName: '   ', iconId: 'human' }).catch(
      (error: unknown) => {
        expectUserServiceError(error, 'invalid_profile_input');
      },
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('requires authentication to update the Profile', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await updateProfile({ displayName: 'New Name', iconId: 'human' }).catch(
      (error: unknown) => {
        expectUserServiceError(error, 'not_authenticated');
      },
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('maps a failed Profile update to an unexpected user-service error', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('update failed'),
    });

    await updateProfile({ displayName: 'New Name', iconId: 'human' }).catch(
      (error: unknown) => {
        expectUserServiceError(error, 'unexpected_error');
      },
    );
  });
});

function setupUpdateProfileMock(updatedIconUrl: string) {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'auth-user-id' } },
    error: null,
  });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({
    data: {
      created_at: '2026-08-16T00:00:00.000Z',
      display_name: 'Sleepy User',
      icon_url: updatedIconUrl,
      id: 'auth-user-id',
      user_id: 'sleepy-user',
    },
    error: null,
  });
}

describe('completeInitialProfileSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupProfileQuery();
  });

  it('creates the Profile and does not update it for a preset icon', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        data: {
          created_at: '2026-08-16T00:00:00.000Z',
          display_name: 'Sleepy User',
          icon_url: 'boy',
          profile_id: 'auth-user-id',
          user_id: 'sleepy-user',
        },
        status: 'ok',
      },
      error: null,
    });

    await completeInitialProfileSetup({
      displayName: 'Sleepy User',
      iconId: 'boy',
      publicUserId: 'sleepy-user',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('create_profile', {
      display_name: 'Sleepy User',
      icon_id: 'boy',
      user_id: 'sleepy-user',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('attaches a custom photo after creating the Profile', async () => {
    const photoUrl = 'https://storage.example/auth-user-id/icon.jpg?v=1';

    mocks.rpc.mockResolvedValue({
      data: {
        data: {
          created_at: '2026-08-16T00:00:00.000Z',
          display_name: 'Sleepy User',
          icon_url: 'human',
          profile_id: 'auth-user-id',
          user_id: 'sleepy-user',
        },
        status: 'ok',
      },
      error: null,
    });
    setupUpdateProfileMock(photoUrl);

    await completeInitialProfileSetup({
      displayName: 'Sleepy User',
      iconId: photoUrl,
      publicUserId: 'sleepy-user',
    });

    expect(mocks.update).toHaveBeenCalledWith({
      display_name: 'Sleepy User',
      icon_url: photoUrl,
    });
  });

  it('still attaches the pending custom photo when the Profile already exists', async () => {
    const photoUrl = 'https://storage.example/auth-user-id/icon.jpg?v=1';

    mocks.rpc.mockResolvedValue({
      data: {
        code: 'profile_already_created',
        error: 'Profile already exists.',
        status: 'error',
      },
      error: null,
    });
    setupUpdateProfileMock(photoUrl);

    await completeInitialProfileSetup({
      displayName: 'Sleepy User',
      iconId: photoUrl,
      publicUserId: 'sleepy-user',
    });

    expect(mocks.update).toHaveBeenCalledWith({
      display_name: 'Sleepy User',
      icon_url: photoUrl,
    });
  });

  it('surfaces a failed photo attach on the already-created path instead of completing silently', async () => {
    const photoUrl = 'https://storage.example/auth-user-id/icon.jpg?v=1';

    mocks.rpc.mockResolvedValue({
      data: {
        code: 'profile_already_created',
        error: 'Profile already exists.',
        status: 'error',
      },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('update failed'),
    });

    await completeInitialProfileSetup({
      displayName: 'Sleepy User',
      iconId: photoUrl,
      publicUserId: 'sleepy-user',
    }).then(
      () => {
        throw new Error('expected completeInitialProfileSetup to reject');
      },
      (error: unknown) => {
        expectUserServiceError(error, 'unexpected_error');
      },
    );
  });

  it('does not attempt a photo update when the already-created Profile has a preset icon', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'profile_already_created',
        error: 'Profile already exists.',
        status: 'error',
      },
      error: null,
    });

    await completeInitialProfileSetup({
      displayName: 'Sleepy User',
      iconId: 'boy',
      publicUserId: 'sleepy-user',
    });

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('propagates not_authenticated without attempting a photo update', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'not_authenticated',
        error: 'Authentication is required.',
        status: 'error',
      },
      error: null,
    });

    await completeInitialProfileSetup({
      displayName: 'Sleepy User',
      iconId: 'https://storage.example/auth-user-id/icon.jpg?v=1',
      publicUserId: 'sleepy-user',
    }).then(
      () => {
        throw new Error('expected completeInitialProfileSetup to reject');
      },
      (error: unknown) => {
        expectUserServiceError(error, 'not_authenticated');
      },
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('validateProfileUpdateInput', () => {
  it('trims Display Name and keeps the given icon', () => {
    expect(
      validateProfileUpdateInput({
        displayName: '  New Name  ',
        iconId: 'boy',
      }),
    ).toEqual({
      isValid: true,
      value: {
        displayName: 'New Name',
        iconId: 'boy',
      },
    });
  });

  it('rejects empty Display Name after trimming', () => {
    expect(
      validateProfileUpdateInput({ displayName: '   ', iconId: 'human' }),
    ).toEqual({
      code: 'display_name_required',
      isValid: false,
    });
  });

  it('rejects Display Names longer than thirty visible characters', () => {
    expect(
      validateProfileUpdateInput({
        displayName: 'あ'.repeat(31),
        iconId: 'human',
      }),
    ).toEqual({
      code: 'display_name_too_long',
      isValid: false,
    });
  });
});

describe('validateInitialSetupInput', () => {
  it('normalizes public User ID and trims Display Name', () => {
    expect(
      validateInitialSetupInput({
        displayName: ' Sleepy User ',
        publicUserId: ' Sleepy-USER_01 ',
      }),
    ).toEqual({
      isValid: true,
      value: {
        displayName: 'Sleepy User',
        publicUserId: 'sleepy-user_01',
      },
    });
  });

  it('rejects public User IDs outside the allowed handle shape', () => {
    expect(
      validateInitialSetupInput({
        displayName: 'Sleepy User',
        publicUserId: 'sleepy user',
      }),
    ).toEqual({
      code: 'public_user_id_invalid',
      isValid: false,
    });
  });

  it('rejects empty Display Name after trimming', () => {
    expect(
      validateInitialSetupInput({
        displayName: '   ',
        publicUserId: 'sleepy-user',
      }),
    ).toEqual({
      code: 'display_name_required',
      isValid: false,
    });
  });

  it('rejects Display Names longer than thirty visible characters', () => {
    expect(
      validateInitialSetupInput({
        displayName: 'あ'.repeat(31),
        publicUserId: 'sleepy-user',
      }),
    ).toEqual({
      code: 'display_name_too_long',
      isValid: false,
    });
  });
});
