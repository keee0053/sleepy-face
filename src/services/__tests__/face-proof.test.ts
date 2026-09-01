import { describe, expect, it, vi } from 'vitest';

import {
  checkFaceProofWithDetector,
  shouldRetainFaceProofPhoto,
  type NativeFaceProofDetector,
} from '../face-proof';

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: vi.fn(() => null),
}));

function createDetector(
  result: Awaited<ReturnType<NativeFaceProofDetector['checkFaceProof']>>,
) {
  return {
    checkFaceProof: vi.fn().mockResolvedValue(result),
  } satisfies NativeFaceProofDetector;
}

describe('Face Proof service', () => {
  it('passes Face Proof when the native detector reports one or more faces', async () => {
    const detector = createDetector({
      faceCount: 2,
      status: 'passed',
    });

    await expect(
      checkFaceProofWithDetector('file:///photo.jpg', detector),
    ).resolves.toEqual({
      faceCount: 2,
      status: 'passed',
    });
    expect(detector.checkFaceProof).toHaveBeenCalledWith(
      'file:///photo.jpg',
      false,
    );
  });

  it('passes useAccurateMode through to the native detector', async () => {
    const detector = createDetector({
      faceCount: 1,
      status: 'passed',
    });

    await checkFaceProofWithDetector('file:///photo.jpg', detector, true);

    expect(detector.checkFaceProof).toHaveBeenCalledWith(
      'file:///photo.jpg',
      true,
    );
  });

  it('fails Face Proof when the native detector reports no faces', async () => {
    const detector = createDetector({
      faceCount: 0,
      reason: 'no-face-detected',
      status: 'failed',
    });

    await expect(
      checkFaceProofWithDetector('file:///photo.jpg', detector),
    ).resolves.toEqual({
      faceCount: 0,
      reason: 'no-face-detected',
      status: 'failed',
    });
  });

  it('maps invalid local photos without treating them as no-face failures', async () => {
    const detector = createDetector({
      reason: 'invalid-photo',
      status: 'failed',
    });

    await expect(
      checkFaceProofWithDetector('file:///missing.jpg', detector),
    ).resolves.toEqual({
      reason: 'invalid-photo',
      status: 'failed',
    });
  });

  it('maps native detector errors without treating them as no-face failures', async () => {
    const detector = createDetector({
      reason: 'detector-error',
      status: 'failed',
    });

    await expect(
      checkFaceProofWithDetector('file:///photo.jpg', detector),
    ).resolves.toEqual({
      reason: 'detector-error',
      status: 'failed',
    });
  });

  it('fails closed when the native detector is unavailable', async () => {
    await expect(
      checkFaceProofWithDetector('file:///photo.jpg', null),
    ).resolves.toEqual({
      reason: 'unsupported-platform',
      status: 'failed',
    });
  });

  it('retains only photos that passed Face Proof', () => {
    expect(
      shouldRetainFaceProofPhoto({
        faceCount: 1,
        status: 'passed',
      }),
    ).toBe(true);
    expect(
      shouldRetainFaceProofPhoto({
        faceCount: 0,
        reason: 'no-face-detected',
        status: 'failed',
      }),
    ).toBe(false);
    expect(
      shouldRetainFaceProofPhoto({
        reason: 'detector-error',
        status: 'failed',
      }),
    ).toBe(false);
    expect(
      shouldRetainFaceProofPhoto({
        reason: 'invalid-photo',
        status: 'failed',
      }),
    ).toBe(false);
  });
});
