# Android Face Proof

## Current Status

Android Face Proof is integrated into the Wake Challenge flow. It uses local Google ML Kit Face Detection to check whether a saved challenge photo contains at least one face.

It is face detection only. It does not recognize the signed-in user, compare against a registered face, require exactly one person, or perform liveness/biometric verification.

For the complete flow and failure outcomes, see [`current_implementation_spec.md`](./current_implementation_spec.md).

## Implementation

- TypeScript boundary: `src/services/face-proof.ts`
- Native Expo Module: `modules/android-face-proof/`
- Integrated screen: `src/app/face-check.tsx`
- Detector: Google ML Kit Face Detection. Uses `PERFORMANCE_MODE_FAST` for the first two Bad Photo Attempts, then `PERFORMANCE_MODE_ACCURATE` for the third and final attempt before the Wake Up Challenge fails outright — a wake-up selfie is often dim and off-angle, so the last chance trades some speed for a better chance of recognizing a genuine face.
- Accepted input: a readable local `file://` image
- Pass rule: one or more detected faces
- Supported runtime: rebuilt native Android app only

The TypeScript service normalizes native results into:

- `passed` with a positive `faceCount`
- `failed: no-face-detected`
- `failed: invalid-photo`
- `failed: detector-error`
- `failed: unsupported-platform`

## Wake Challenge Behavior

1. The front camera captures a photo at quality 0.85.
2. The temporary camera file is copied into the app document directory.
3. The Alarm Timer pauses while Face Proof runs.
4. A passing photo is retained, native ringing is stopped on a best-effort basis, and the app moves to the five-second Quiz countdown.
5. Any failed Face Proof result is treated as one Bad Photo Attempt in the current screen flow. The failed photo is deleted, and the timer resumes for attempts one and two.
6. The third Bad Photo Attempt ends the Wake Challenge and blocks Friends Feed Access for the current local day.

The current code also makes a best-effort diagnostic copy of the most recent failed Face Proof photo before deleting the active copy. This is temporary debugging behavior and is not a product-visible feature.

## Manual Android Verification

Expo Go is not an acceptance path because the detector is native code.

1. Rebuild and install the native Android app.
2. Start a Wake Challenge and open the front camera.
3. Capture a normal selfie and confirm the flow reaches Face Check Success and then Quiz.
4. Confirm the native alarm sound stops after a passing Face Proof.
5. Capture a no-face image and confirm the app shows the retry screen with an incremented failure count.
6. Repeat until the third failure and confirm the app reaches the no-photo failure screen and the Friends Feed is blocked for the day.
7. If practical, pass an invalid/unreadable local URI through the service and confirm it returns `invalid-photo` rather than crashing.

## Unsupported or Out of Scope

- iOS, web, and Expo Go
- Face recognition or identity matching
- Liveness, spoof detection, smile, eye-open, landmark, contour, or head-angle checks
- Server-side face detection
- A separate per-photo timer; the current flow uses the shared 60-second Alarm Timer
