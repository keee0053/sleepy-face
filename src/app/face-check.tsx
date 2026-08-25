import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FaceCheckLoading, LoadingButtonContent } from '@/components/loading';
import {
  MAX_BAD_PHOTO_ATTEMPTS,
  formatRemainingTime,
} from '@/components/wake-challenge-ui';
import { stopRingingAlarm } from '@/services/android-alarm-mechanics';
import {
  getAlarmTimerState,
  pauseTimer,
  resumeTimer,
  useAlarmTimer,
} from '@/services/alarm-timer';
import {
  checkFaceProof,
  shouldRetainFaceProofPhoto,
} from '@/services/face-proof';
import {
  debugSnapshotBeforeDelete,
  deleteFailurePhotoLocally,
  saveFailurePhotoLocally,
} from '@/services/wakeChallenge';
import { getNextBadPhotoAttemptCount } from '@/services/wake-challenge-rules';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return '処理に失敗しました。';
}

export default function FaceCheckScreen() {
  const params = useLocalSearchParams<{
    alarmId?: string;
    badPhotoAttempts?: string;
  }>();
  const cameraRef = useRef<CameraView>(null);
  const timer = useAlarmTimer();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [message, setMessage] = useState('顔が写るように撮影してください。');
  const [isBusy, setIsBusy] = useState(false);
  const [isOpeningCamera, setIsOpeningCamera] = useState(false);
  const badPhotoAttempts = Number(params.badPhotoAttempts ?? '0') || 0;
  // Edge-triggered on purpose: alarm-timer.ts is a module-level singleton, so the very
  // first status this screen observes can be a stale 'expired' left over from a
  // previous, already-finished Wake Up Challenge (whose timer never gets reset until
  // someone starts a new one) rather than this session's own timer actually running
  // out. Only a genuine running -> expired transition -- never an already-expired
  // value seen on mount -- means this attempt's timer really did run out.
  const previousTimerStatusRef = useRef(timer?.status);

  useEffect(() => {
    const previousStatus = previousTimerStatusRef.current;
    previousTimerStatusRef.current = timer?.status;

    if (previousStatus === 'running' && timer?.status === 'expired') {
      router.replace({
        pathname: '/quiz-failure',
        params: { reason: 'no-photo-timeout' },
      });
    }
  }, [timer?.status]);

  async function openCamera() {
    if (isOpeningCamera) {
      return;
    }

    if (getAlarmTimerState()?.status === 'expired') {
      router.replace({
        pathname: '/quiz-failure',
        params: { reason: 'no-photo-timeout' },
      });
      return;
    }

    setIsOpeningCamera(true);

    try {
      if (!permission?.granted) {
        const nextPermission = await requestPermission();

        if (!nextPermission.granted) {
          setMessage('カメラ権限が必要です。');
          return;
        }
      }

      setIsCameraOpen(true);
      setMessage('写真を撮影してください。');
    } finally {
      setIsOpeningCamera(false);
    }
  }

  async function takePhoto() {
    if (!cameraRef.current || isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
      });
      const savedPhoto = await saveFailurePhotoLocally(photo.uri);

      pauseTimer();
      const nextFaceProofResult = await checkFaceProof(savedPhoto.uri);

      setIsCameraOpen(false);

      if (shouldRetainFaceProofPhoto(nextFaceProofResult)) {
        // Stop here: Face Verification passed, so the wake challenge is proceeding
        // (best-effort — a failure to stop it must never block the flow).
        stopRingingAlarm().catch(() => {});
        router.replace({
          pathname: '/face-check-success',
          params: {
            alarmId: params.alarmId ?? '',
            localPhotoUri: savedPhoto.uri,
          },
        });
        return;
      }

      await debugSnapshotBeforeDelete(savedPhoto.uri);
      await deleteFailurePhotoLocally(savedPhoto.uri);

      const nextBadPhotoAttempts =
        getNextBadPhotoAttemptCount(badPhotoAttempts);

      if (nextBadPhotoAttempts >= MAX_BAD_PHOTO_ATTEMPTS) {
        // Stop here too: the 3rd Bad Photo Attempt ends the challenge in failure, so
        // there is no more chance to retake the photo.
        stopRingingAlarm().catch(() => {});
        router.replace({
          pathname: '/quiz-failure',
          params: { reason: 'bad-photo-limit' },
        });
        return;
      }

      resumeTimer();
      router.replace({
        pathname: '/face-check-failure',
        params: {
          alarmId: params.alarmId ?? '',
          badPhotoAttempts: String(nextBadPhotoAttempts),
        },
      });
    } catch (error) {
      resumeTimer();
      setIsCameraOpen(false);
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  if (isCameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} facing="front" style={styles.camera} />
        {isBusy && <FaceCheckLoading />}
        <SafeAreaView style={styles.cameraTimerOverlay}>
          <Text style={styles.cameraTimer}>{formatRemainingTime(timer)}</Text>
        </SafeAreaView>
        <SafeAreaView style={styles.cameraControls}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={takePhoto}
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && styles.buttonPressed,
              isBusy && styles.buttonDisabled,
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.timerPill}>
          <Text style={styles.timerPillText}>
            あと {formatRemainingTime(timer)}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.iconRing}>
            <View style={styles.iconCircle}>
              <View style={styles.cameraIcon}>
                <View style={styles.cameraIconBump} />
                <View style={styles.cameraIconBody}>
                  <View style={styles.cameraIconLens} />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.copy}>
            <Text style={styles.title}>顔写真を撮影</Text>
            <Text style={styles.caption}>{message}</Text>
            <Text style={styles.attempts}>
              失敗 {badPhotoAttempts}/{MAX_BAD_PHOTO_ATTEMPTS}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isOpeningCamera}
          onPress={openCamera}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isOpeningCamera && styles.buttonDisabled,
          ]}
        >
          <LoadingButtonContent
            label="カメラを起動"
            loading={isOpeningCamera}
            loadingLabel="起動中..."
            textStyle={styles.buttonText}
          />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  attempts: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 32,
    minHeight: 68,
    paddingHorizontal: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '800',
  },
  camera: {
    flex: 1,
  },
  cameraContainer: {
    backgroundColor: '#000000',
    flex: 1,
  },
  cameraControls: {
    alignItems: 'center',
    backgroundColor: '#000000',
    justifyContent: 'center',
    minHeight: 160,
    paddingVertical: 24,
  },
  cameraTimer: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  cameraTimerOverlay: {
    alignItems: 'center',
    left: 0,
    paddingTop: 24,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  caption: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  cameraIcon: {
    alignItems: 'center',
  },
  cameraIconBody: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    height: 20,
    justifyContent: 'center',
    width: 30,
  },
  cameraIconBump: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
    height: 5,
    marginBottom: 1,
    width: 12,
  },
  cameraIconLens: {
    backgroundColor: '#171717',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 48,
    justifyContent: 'center',
  },
  copy: {
    gap: 12,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderColor: '#ffffff',
    borderRadius: 36,
    borderWidth: 2,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  iconRing: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 48,
    borderWidth: 2,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  shutterInner: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    height: 64,
    width: 64,
  },
  screen: {
    backgroundColor: '#171717',
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 56,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  shutterOuter: {
    alignItems: 'center',
    borderColor: '#ffffff',
    borderRadius: 38,
    borderWidth: 4,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  timerPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  timerPillText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
  },
});
