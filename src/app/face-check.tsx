import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  deleteFailurePhotoLocally,
  getLatestFailurePhoto,
  saveFailurePhotoLocally,
  uploadFailurePhoto as uploadFailurePhotoToStorage,
} from '@/services/wakeChallenge';
import {
  checkFaceProof,
  shouldRetainFaceProofPhoto,
  type FaceProofResult,
} from '@/services/face-proof';

export default function FaceCheckScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [faceProofResult, setFaceProofResult] =
    useState<FaceProofResult | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [message, setMessage] = useState('ボタンを押すとカメラが起動します。');
  const [isBusy, setIsBusy] = useState(false);

  async function openCamera() {
    setFaceProofResult(null);
    setUploadedPath(null);

    if (!permission?.granted) {
      const nextPermission = await requestPermission();

      if (!nextPermission.granted) {
        setMessage('カメラ権限が必要です。');
        return;
      }
    }

    setIsCameraOpen(true);
    setMessage('写真を撮影してください。');
  }

  async function takePhoto() {
    if (!cameraRef.current || isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      // 撮影結果は一時ファイルなので、すぐローカル保存用フォルダへコピーする。
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
      });

      const savedPhoto = await saveFailurePhotoLocally(photo.uri);
      const nextFaceProofResult = await checkFaceProof(savedPhoto.uri);

      setIsCameraOpen(false);
      setFaceProofResult(nextFaceProofResult);

      if (shouldRetainFaceProofPhoto(nextFaceProofResult)) {
        setLocalPhotoUri(savedPhoto.uri);
        setMessage(`顔を検出しました（${nextFaceProofResult.faceCount}件）。`);
        return;
      }

      await deleteFailurePhotoLocally(savedPhoto.uri);
      setLocalPhotoUri(null);

      if (nextFaceProofResult.reason === 'no-face-detected') {
        setMessage('顔が検出できませんでした。もう一度撮影してください。');
        return;
      }

      setMessage(getFaceProofFailureMessage(nextFaceProofResult.reason));
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function loadLocalPhoto() {
    setFaceProofResult(null);
    setUploadedPath(null);
    setIsBusy(true);

    try {
      // 失敗時はこの処理で、前回ローカル保存した写真を取り出す。
      const photo = await getLatestFailurePhoto();

      if (!photo) {
        setMessage('ローカル保存された写真がありません。');
        setLocalPhotoUri(null);
        setFaceProofResult(null);
        return;
      }

      setLocalPhotoUri(photo.uri);
      setMessage('ローカルから写真を取得しました。');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadFailurePhoto() {
    if (!localPhotoUri) {
      setMessage('アップロードする写真を先に選んでください。');
      return;
    }

    setIsBusy(true);

    try {
      // 画面に表示されている写真そのものをfailure-photos bucketへ送る。
      const uploadedPhoto = await uploadFailurePhotoToStorage(localPhotoUri);

      setUploadedPath(uploadedPhoto.storagePath);
      setMessage('Supabase Storageにアップロードしました。');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  if (isCameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} facing="front" style={styles.camera} />

        <SafeAreaView style={styles.cameraControls}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={takePhoto}
            style={({ pressed }) => [
              styles.shutterButton,
              pressed && styles.buttonPressed,
              isBusy && styles.buttonDisabled,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator color="#172033" />
            ) : (
              <Text style={styles.shutterButtonText}>撮影</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => setIsCameraOpen(false)}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.buttonPressed,
              isBusy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.cancelButtonText}>戻る</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SLEEPY FACE</Text>
          <Text style={styles.title}>顔撮影・顔判定画面</Text>
          <Text style={styles.description}>{message}</Text>
        </View>

        <View style={styles.preview}>
          {localPhotoUri ? (
            <Image
              source={{ uri: localPhotoUri }}
              style={styles.previewImage}
            />
          ) : (
            <Text style={styles.previewText}>写真はまだありません</Text>
          )}
        </View>

        {faceProofResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>顔判定</Text>
            <Text style={styles.resultText}>
              {getFaceProofResultText(faceProofResult)}
            </Text>
          </View>
        )}

        {uploadedPath && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Storage path</Text>
            <Text style={styles.resultText}>{uploadedPath}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            disabled={isBusy}
            label="カメラを起動"
            onPress={openCamera}
          />
          <SecondaryButton
            disabled={isBusy}
            label="ローカル写真を取得"
            onPress={loadLocalPhoto}
          />
          <SecondaryButton
            disabled={isBusy || !localPhotoUri}
            label="失敗としてアップロード"
            onPress={uploadFailurePhoto}
          />
          <SecondaryButton
            disabled={isBusy}
            label="成功画面へ"
            onPress={() => router.navigate('/face-check-success')}
          />
          <SecondaryButton
            disabled={isBusy}
            label="失敗画面へ"
            onPress={() => router.navigate('/face-check-failure')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

type ButtonProps = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
};

function PrimaryButton({ disabled, label, onPress }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ disabled, label, onPress }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return '処理に失敗しました。';
}

function getFaceProofFailureMessage(
  reason: Exclude<FaceProofResult, { status: 'passed' }>['reason'],
) {
  switch (reason) {
    case 'detector-error':
      return '顔判定に失敗しました。もう一度試してください。';
    case 'invalid-photo':
      return '写真を読み取れませんでした。もう一度撮影してください。';
    case 'no-face-detected':
      return '顔が検出できませんでした。もう一度撮影してください。';
    case 'unsupported-platform':
      return 'この端末では顔判定を利用できません。';
  }
}

function getFaceProofResultText(result: FaceProofResult) {
  if (result.status === 'passed') {
    return `成功: ${result.faceCount}件の顔を検出しました。`;
  }

  if (result.reason === 'no-face-detected') {
    return '失敗: 顔が検出できませんでした。';
  }

  return `失敗: ${getFaceProofFailureMessage(result.reason)}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    color: '#536dfe',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: '#172033',
    fontSize: 30,
    fontWeight: '800',
  },
  description: {
    color: '#657086',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  preview: {
    alignItems: 'center',
    aspectRatio: 3 / 4,
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewText: {
    color: '#8c97aa',
    fontSize: 15,
    fontWeight: '600',
  },
  resultBox: {
    backgroundColor: '#ffffff',
    borderColor: '#d7efe2',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  resultLabel: {
    color: '#1c8b52',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  resultText: {
    color: '#172033',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: 12,
    marginTop: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#536dfe',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d9dfeb',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#273147',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    alignItems: 'center',
    bottom: 0,
    gap: 14,
    left: 0,
    paddingBottom: 24,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
  },
  shutterButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  shutterButtonText: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 28,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
