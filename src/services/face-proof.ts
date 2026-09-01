import { requireOptionalNativeModule } from 'expo-modules-core';

export type FaceProofFailureReason =
  | 'detector-error'
  | 'invalid-photo'
  | 'no-face-detected'
  | 'unsupported-platform';

export type FaceProofResult =
  | {
      faceCount: number;
      status: 'passed';
    }
  | {
      faceCount: 0;
      reason: 'no-face-detected';
      status: 'failed';
    }
  | {
      reason: Exclude<FaceProofFailureReason, 'no-face-detected'>;
      status: 'failed';
    };

export type NativeFaceProofResult =
  | {
      faceCount: number;
      status: 'passed';
    }
  | {
      faceCount?: number;
      reason: FaceProofFailureReason;
      status: 'failed';
    };

export type NativeFaceProofDetector = {
  checkFaceProof(
    localPhotoUri: string,
    useAccurateMode: boolean,
  ): Promise<NativeFaceProofResult>;
};

const nativeDetector =
  requireOptionalNativeModule<NativeFaceProofDetector>('AndroidFaceProof');

function normalizeNativeResult(result: NativeFaceProofResult): FaceProofResult {
  if (result.status === 'passed') {
    if (result.faceCount > 0) {
      return {
        faceCount: result.faceCount,
        status: 'passed',
      };
    }

    return {
      faceCount: 0,
      reason: 'no-face-detected',
      status: 'failed',
    };
  }

  if (result.reason === 'no-face-detected') {
    return {
      faceCount: 0,
      reason: 'no-face-detected',
      status: 'failed',
    };
  }

  return {
    reason: result.reason,
    status: 'failed',
  };
}

export async function checkFaceProofWithDetector(
  localPhotoUri: string,
  detector: NativeFaceProofDetector | null = nativeDetector,
  useAccurateMode = false,
): Promise<FaceProofResult> {
  if (!detector) {
    return {
      reason: 'unsupported-platform',
      status: 'failed',
    };
  }

  try {
    const nativeResult = await detector.checkFaceProof(
      localPhotoUri,
      useAccurateMode,
    );

    if (nativeResult.status === 'failed') {
      console.warn('[face-proof] native check failed', nativeResult);
    }

    return normalizeNativeResult(nativeResult);
  } catch (error) {
    console.warn('[face-proof] native check threw', error);

    return {
      reason: 'detector-error',
      status: 'failed',
    };
  }
}

// The first attempts use ML Kit's fast (lower-accuracy) mode for a snappy retry loop.
// A wake-up selfie is often dim and off-angle, so fast mode can miss a genuine face --
// the last attempt before the Wake Up Challenge fails outright switches to accurate
// mode, trading a bit of speed for a better chance of recognizing a real face.
export function checkFaceProof(
  localPhotoUri: string,
  useAccurateMode = false,
): Promise<FaceProofResult> {
  return checkFaceProofWithDetector(localPhotoUri, undefined, useAccurateMode);
}

export function shouldRetainFaceProofPhoto(
  result: FaceProofResult,
): result is Extract<FaceProofResult, { status: 'passed' }> {
  return result.status === 'passed';
}
