import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProfileIconPhotoUploadError,
  pickAndUploadProfileIconPhoto,
  uploadProfileIconPhoto,
} from '../profile-icon-photo';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getPublicUrl: vi.fn(),
  getUser: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    storage: {
      from: mocks.from,
    },
  },
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync:
    mocks.requestMediaLibraryPermissionsAsync,
}));

function setupStorage() {
  mocks.from.mockReturnValue({
    getPublicUrl: mocks.getPublicUrl,
    upload: mocks.upload,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://storage.example/auth-user-id/icon.jpg' },
  });
}

describe('uploadProfileIconPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    );
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    setupStorage();
  });

  it('uploads with a caller-provided content type, extension matching', async () => {
    await uploadProfileIconPhoto('file://photo.png', 'image/png');

    expect(mocks.upload).toHaveBeenCalledWith(
      'auth-user-id/icon.png',
      expect.any(ArrayBuffer),
      { contentType: 'image/png', upsert: true },
    );
  });

  it('falls back to image/jpeg when no content type is given', async () => {
    await uploadProfileIconPhoto('file://photo.jpg');

    expect(mocks.upload).toHaveBeenCalledWith(
      'auth-user-id/icon.jpg',
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: true },
    );
  });

  it('requires an authenticated user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await uploadProfileIconPhoto('file://photo.jpg').catch((error: unknown) => {
      expect(error).toBeInstanceOf(ProfileIconPhotoUploadError);
      expect((error as ProfileIconPhotoUploadError).code).toBe(
        'not_authenticated',
      );
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('falls back to a .jpg extension for an unrecognized content type', async () => {
    await uploadProfileIconPhoto('file://photo.heif', 'image/heif');

    expect(mocks.upload).toHaveBeenCalledWith(
      'auth-user-id/icon.jpg',
      expect.any(ArrayBuffer),
      { contentType: 'image/heif', upsert: true },
    );
  });

  it('maps a Storage upload failure to a typed error', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('storage down') });

    await uploadProfileIconPhoto('file://photo.jpg').catch((error: unknown) => {
      expect(error).toBeInstanceOf(ProfileIconPhotoUploadError);
      expect((error as ProfileIconPhotoUploadError).code).toBe(
        'storage_upload_failed',
      );
    });
  });
});

describe('pickAndUploadProfileIconPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    );
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });
    setupStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns permission_denied without launching the picker', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
    });

    await expect(pickAndUploadProfileIconPhoto()).resolves.toEqual({
      status: 'permission_denied',
    });
    expect(mocks.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('returns canceled without uploading when the picker is dismissed', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true });

    await expect(pickAndUploadProfileIconPhoto()).resolves.toEqual({
      status: 'canceled',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('uploads the picked asset using its own mime type and returns success', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    mocks.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ mimeType: 'image/png', uri: 'file://photo.png' }],
      canceled: false,
    });

    await expect(pickAndUploadProfileIconPhoto()).resolves.toEqual({
      status: 'success',
      url: 'https://storage.example/auth-user-id/icon.jpg?v=0',
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      'auth-user-id/icon.png',
      expect.any(ArrayBuffer),
      { contentType: 'image/png', upsert: true },
    );
  });

  it('falls back to image/jpeg when the picked asset has no mime type', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    mocks.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ uri: 'file://photo.jpg' }],
      canceled: false,
    });

    await pickAndUploadProfileIconPhoto();

    expect(mocks.upload).toHaveBeenCalledWith(
      'auth-user-id/icon.jpg',
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: true },
    );
  });

  it('returns upload_failed wrapping the upload error', async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    mocks.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ mimeType: 'image/jpeg', uri: 'file://photo.jpg' }],
      canceled: false,
    });
    mocks.upload.mockResolvedValue({ error: new Error('storage down') });

    const result = await pickAndUploadProfileIconPhoto();

    expect(result.status).toBe('upload_failed');
    if (result.status === 'upload_failed') {
      expect(result.cause).toBeInstanceOf(ProfileIconPhotoUploadError);
    }
  });
});
