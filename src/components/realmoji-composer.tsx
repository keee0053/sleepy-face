import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { REALMOJI_OPTIONS, type RealMojiEmoji } from '@/constants/realmojis';
import {
  PhotoRealMojiServiceError,
  removePhotoRealMoji,
  upsertPhotoRealMoji,
  type PhotoRealMoji,
} from '@/services/photo-realmojis';

type ComposerStage = 'camera' | 'picker' | 'preview';

type RealMojiComposerProps = {
  existingRealMoji?: PhotoRealMoji | null;
  onClose: () => void;
  onRemoved: () => void;
  onSaved: (realMoji: PhotoRealMoji) => void;
  photoId: string;
  visible: boolean;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof PhotoRealMojiServiceError) {
    switch (error.code) {
      case 'invalid_emoji':
        return 'このリアクションは使用できません。';
      case 'not_authenticated':
        return 'ログイン状態を確認できませんでした。';
      case 'unexpected_error':
        return 'RealMojiを送信できませんでした。もう一度お試しください。';
    }
  }

  return '撮影または送信に失敗しました。もう一度お試しください。';
}

export function RealMojiComposer({
  existingRealMoji,
  onClose,
  onRemoved,
  onSaved,
  photoId,
  visible,
}: RealMojiComposerProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<ComposerStage>('picker');
  const [selectedEmoji, setSelectedEmoji] = useState<RealMojiEmoji | null>(
    null,
  );
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resetComposer() {
    setStage('picker');
    setSelectedEmoji(null);
    setCapturedPhotoUri(null);
    setIsCameraReady(false);
    setIsCapturing(false);
    setIsSubmitting(false);
    setErrorMessage(null);
  }

  async function handleSelectEmoji(emoji: RealMojiEmoji) {
    setErrorMessage(null);
    setSelectedEmoji(emoji);

    try {
      if (!permission?.granted) {
        const nextPermission = await requestPermission();

        if (!nextPermission.granted) {
          setSelectedEmoji(null);
          setErrorMessage('顔写真でリアクションするにはカメラ権限が必要です。');
          return;
        }
      }

      setIsCameraReady(false);
      setStage('camera');
    } catch (error) {
      setSelectedEmoji(null);
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleTakePhoto() {
    if (!cameraRef.current || !isCameraReady || isCapturing) {
      return;
    }

    setErrorMessage(null);
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });

      setCapturedPhotoUri(photo.uri);
      setStage('preview');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsCapturing(false);
    }
  }

  function handleRetake() {
    setCapturedPhotoUri(null);
    setErrorMessage(null);
    setIsCameraReady(false);
    setStage('camera');
  }

  async function handleSend() {
    if (!capturedPhotoUri || !selectedEmoji || isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const realMoji = await upsertPhotoRealMoji({
        emoji: selectedEmoji,
        localPhotoUri: capturedPhotoUri,
        photoId,
      });

      onSaved(realMoji);
      resetComposer();
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!existingRealMoji || isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await removePhotoRealMoji(photoId);
      onRemoved();
      resetComposer();
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRequestClose() {
    if (!isSubmitting && !isCapturing) {
      resetComposer();
      onClose();
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={handleRequestClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      {stage === 'picker' ? (
        <SafeAreaView style={styles.lightScreen}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="RealMojiを閉じる"
              accessibilityRole="button"
              disabled={isSubmitting}
              hitSlop={12}
              onPress={handleRequestClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.pickerScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pickerCopy}>
              <Text style={styles.pickerTitle}>どの顔で返す？</Text>
              <Text style={styles.pickerCaption}>
                絵文字を選んで、今の表情を撮影しよう。
              </Text>
            </View>

            <View style={styles.optionGrid}>
              {REALMOJI_OPTIONS.map((option) => (
                <Pressable
                  accessibilityLabel={`${option.label}の顔を撮影`}
                  accessibilityRole="button"
                  key={option.emoji}
                  onPress={() => handleSelectEmoji(option.emoji)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.optionEmoji}>{option.emoji}</Text>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            {existingRealMoji && (
              <View style={styles.currentRealMojiCard}>
                <View style={styles.currentRealMojiPreview}>
                  <Image
                    contentFit="cover"
                    source={{ uri: existingRealMoji.imageUrl }}
                    style={styles.currentRealMojiImage}
                  />
                  <Text style={styles.currentRealMojiEmoji}>
                    {existingRealMoji.emoji}
                  </Text>
                </View>

                <View style={styles.currentRealMojiCopy}>
                  <Text style={styles.currentRealMojiTitle}>
                    リアクション済み
                  </Text>
                  <Text style={styles.currentRealMojiCaption}>
                    別の表情を撮ると差し替えられます。
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={handleRemove}
                  style={({ pressed }) => [
                    styles.removeButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.buttonDisabled,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#b42318" size="small" />
                  ) : (
                    <Text style={styles.removeButtonText}>削除</Text>
                  )}
                </Pressable>
              </View>
            )}

            {errorMessage && (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      ) : stage === 'camera' ? (
        <View style={styles.cameraScreen}>
          <CameraView
            facing="front"
            mirror
            onCameraReady={() => setIsCameraReady(true)}
            onMountError={(event) => setErrorMessage(event.message)}
            ref={cameraRef}
            style={styles.camera}
          />

          <SafeAreaView edges={['top']} style={styles.cameraHeader}>
            <Pressable
              accessibilityLabel="RealMojiの選択に戻る"
              accessibilityRole="button"
              disabled={isCapturing}
              onPress={() => setStage('picker')}
              style={styles.cameraBackButton}
            >
              <Text style={styles.cameraBackText}>×</Text>
            </Pressable>

            <View style={styles.cameraPrompt}>
              <Text style={styles.cameraPromptEmoji}>{selectedEmoji}</Text>
              <Text style={styles.cameraPromptText}>この顔で返そう</Text>
            </View>
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={styles.cameraControls}>
            {errorMessage && (
              <Text accessibilityRole="alert" style={styles.cameraErrorText}>
                {errorMessage}
              </Text>
            )}

            <Pressable
              accessibilityLabel="RealMojiを撮影"
              accessibilityRole="button"
              disabled={!isCameraReady || isCapturing}
              onPress={handleTakePhoto}
              style={({ pressed }) => [
                styles.shutterOuter,
                pressed && styles.buttonPressed,
                (!isCameraReady || isCapturing) && styles.buttonDisabled,
              ]}
            >
              {isCapturing ? (
                <ActivityIndicator color="#171717" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={styles.previewScreen}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="RealMojiの選択に戻る"
              accessibilityRole="button"
              disabled={isSubmitting}
              hitSlop={12}
              onPress={() => setStage('picker')}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
            <Text style={styles.headerTitle}>この顔で返す？</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.previewImageWrapper}>
              {!!capturedPhotoUri && (
                <Image
                  contentFit="cover"
                  source={{ uri: capturedPhotoUri }}
                  style={styles.previewImage}
                />
              )}
              <View style={styles.previewEmojiBadge}>
                <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
              </View>
            </View>

            {errorMessage && (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
            )}

            <View style={styles.previewActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={handleRetake}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                  isSubmitting && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.secondaryButtonText}>撮り直す</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={handleSend}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  isSubmitting && styles.buttonDisabled,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>送信</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  camera: {
    flex: 1,
  },
  cameraBackButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 23, 23, 0.55)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cameraBackText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '400',
    lineHeight: 32,
  },
  cameraControls: {
    alignItems: 'center',
    bottom: 0,
    gap: 14,
    left: 0,
    paddingBottom: 22,
    position: 'absolute',
    right: 0,
  },
  cameraErrorText: {
    backgroundColor: 'rgba(23, 23, 23, 0.7)',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  cameraHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cameraPrompt: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 23, 23, 0.68)',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cameraPromptEmoji: {
    fontSize: 24,
  },
  cameraPromptText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  cameraScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    left: 12,
    position: 'absolute',
    width: 44,
  },
  closeButtonText: {
    color: '#171717',
    fontSize: 30,
    fontWeight: '400',
    lineHeight: 32,
  },
  currentRealMojiCaption: {
    color: '#737373',
    fontSize: 12,
    lineHeight: 17,
  },
  currentRealMojiCard: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  currentRealMojiCopy: {
    flex: 1,
  },
  currentRealMojiEmoji: {
    bottom: -2,
    fontSize: 21,
    position: 'absolute',
    right: -4,
  },
  currentRealMojiImage: {
    height: '100%',
    width: '100%',
  },
  currentRealMojiPreview: {
    borderColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 2,
    height: 56,
    width: 56,
  },
  currentRealMojiTitle: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: '#b42318',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 61,
    paddingHorizontal: 60,
  },
  headerTitle: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '800',
  },
  lightScreen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  optionButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 124,
    paddingHorizontal: 8,
    paddingVertical: 18,
  },
  optionEmoji: {
    fontSize: 44,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionLabel: {
    color: '#525252',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  pickerCaption: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  pickerCopy: {
    gap: 8,
  },
  pickerScrollContent: {
    flexGrow: 1,
    gap: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  pickerTitle: {
    color: '#171717',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  previewEmoji: {
    fontSize: 38,
  },
  previewEmojiBadge: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    bottom: 12,
    height: 60,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    width: 60,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewImageWrapper: {
    alignSelf: 'center',
    aspectRatio: 1,
    backgroundColor: '#e5e5e5',
    borderRadius: 24,
    maxWidth: 520,
    overflow: 'hidden',
    width: '100%',
  },
  previewScreen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  previewScrollContent: {
    flexGrow: 1,
    gap: 22,
    justifyContent: 'center',
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 50,
  },
  removeButtonText: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '800',
  },
  shutterInner: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    height: 56,
    width: 56,
  },
  shutterOuter: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 38,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
});
