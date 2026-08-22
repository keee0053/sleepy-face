import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  getProfileIconSource,
  PROFILE_ICON_LABELS,
  PROFILE_ICON_SOURCES,
} from '@/constants/profile-icons';
import { LoadingButtonContent, LoadingState } from '@/components/loading';
import { getCurrentUserId } from '@/services/auth';
import {
  getProfileIconPhotoPickErrorMessage,
  pickAndUploadProfileIconPhoto,
} from '@/services/profile-icon-photo';
import {
  DEFAULT_PROFILE_ICON_ID,
  PROFILE_ICON_IDS,
  UserServiceError,
  completeInitialProfileSetup,
  getMyProfile,
  normalizePublicUserId,
  validateInitialSetupInput,
  type InitialSetupValidationErrorCode,
} from '@/services/user';

// Home is typically the first screen navigated to in a session, and replacing to it
// synchronously right after an async operation resolves can catch Expo Router's native
// Stack mid-commit, briefly rendering the built-in "Unmatched Route" screen before it
// settles (a known upstream timing issue: https://github.com/expo/expo/issues/47687).
// Deferring until after the current interaction/commit settles avoids the flash.
function replaceToHome(): void {
  InteractionManager.runAfterInteractions(() => {
    router.replace('/home');
  });
}

function getValidationMessage(code: InitialSetupValidationErrorCode): string {
  switch (code) {
    case 'public_user_id_invalid':
      return 'ユーザーIDは3〜20文字の英数字、_、-で入力してください。';
    case 'display_name_required':
      return '表示名を入力してください。';
    case 'display_name_too_long':
      return '表示名は30文字以内で入力してください。';
  }
}

function getCreateProfileErrorMessage(error: unknown): string {
  if (error instanceof UserServiceError) {
    switch (error.code) {
      case 'user_id_already_taken':
        return 'このユーザーIDはすでに使われています。別のIDを入力してください。';
      case 'invalid_profile_input':
        return '入力内容を確認してください。';
      case 'not_authenticated':
      case 'profile_already_created':
      case 'unexpected_error':
        return 'プロフィールを作成できませんでした。もう一度お試しください。';
    }
  }

  return 'プロフィールを作成できませんでした。もう一度お試しください。';
}

export default function ProfileSetupScreen() {
  const [displayName, setDisplayName] = useState('');
  const [publicUserId, setPublicUserId] = useState('');
  const [iconId, setIconId] = useState<string>(DEFAULT_PROFILE_ICON_ID);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function protectSetupRoute() {
      const authUserId = await getCurrentUserId();

      if (!isActive) {
        return;
      }

      if (!authUserId) {
        router.replace('/signin');
        return;
      }

      const profile = await getMyProfile();

      if (!isActive) {
        return;
      }

      if (profile) {
        replaceToHome();
        return;
      }

      setIsCheckingProfile(false);
    }

    protectSetupRoute().catch(() => {
      if (isActive) {
        setErrorMessage(
          'プロフィール状態を確認できませんでした。もう一度お試しください。',
        );
        setIsCheckingProfile(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const handlePublicUserIdChange = useCallback((value: string) => {
    setPublicUserId(normalizePublicUserId(value));
  }, []);

  const handlePickPhoto = useCallback(async () => {
    setErrorMessage(null);
    setIsPickingPhoto(true);

    try {
      const result = await pickAndUploadProfileIconPhoto();

      if (result.status === 'success') {
        setIconId(result.url);
        return;
      }

      const message = getProfileIconPhotoPickErrorMessage(result);

      if (message) {
        setErrorMessage(message);
      }
    } finally {
      setIsPickingPhoto(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setErrorMessage(null);

    const validationResult = validateInitialSetupInput({
      displayName,
      publicUserId,
    });

    if (!validationResult.isValid) {
      setErrorMessage(getValidationMessage(validationResult.code));
      return;
    }

    setDisplayName(validationResult.value.displayName);
    setPublicUserId(validationResult.value.publicUserId);
    setIsSubmitting(true);

    try {
      await completeInitialProfileSetup({
        ...validationResult.value,
        iconId,
      });

      replaceToHome();
    } catch (error) {
      if (
        error instanceof UserServiceError &&
        error.code === 'not_authenticated'
      ) {
        router.replace('/signin');
        return;
      }

      setErrorMessage(getCreateProfileErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [displayName, iconId, publicUserId]);

  if (isCheckingProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState
          message="プロフィールを確認しています..."
          size="large"
          variant="screen"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topContent}>
            <Text style={styles.title}>プロフィール設定</Text>

            <View style={styles.avatarSection}>
              <View style={styles.avatarPreview}>
                <Image
                  contentFit="cover"
                  source={getProfileIconSource(iconId)}
                  style={styles.avatarPreviewImage}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting || isPickingPhoto}
                onPress={handlePickPhoto}
                style={({ pressed }) => [
                  styles.pickPhotoButton,
                  pressed && styles.iconOptionPressed,
                ]}
              >
                {isPickingPhoto ? (
                  <ActivityIndicator color="#171717" size="small" />
                ) : (
                  <Text style={styles.pickPhotoButtonText}>写真を選ぶ</Text>
                )}
              </Pressable>

              <View style={styles.iconGrid}>
                {PROFILE_ICON_IDS.map((id) => {
                  const isSelected = id === iconId;

                  return (
                    <Pressable
                      accessibilityLabel={PROFILE_ICON_LABELS[id]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      disabled={isSubmitting}
                      key={id}
                      onPress={() => setIconId(id)}
                      style={({ pressed }) => [
                        styles.iconOption,
                        isSelected && styles.iconOptionSelected,
                        pressed && styles.iconOptionPressed,
                      ]}
                    >
                      <Image
                        contentFit="cover"
                        source={PROFILE_ICON_SOURCES[id]}
                        style={styles.iconOptionImage}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.avatarCaption}>
                プロフィールアイコンを選んでください
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>ユーザー名</Text>
              <TextInput
                editable={!isSubmitting}
                onChangeText={setDisplayName}
                placeholder="例：山田 太郎"
                placeholderTextColor="#a3a3a3"
                style={styles.input}
                value={displayName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>userID</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
                onChangeText={handlePublicUserIdChange}
                placeholder="例：yamada_kun"
                placeholderTextColor="#a3a3a3"
                style={styles.input}
                value={publicUserId}
              />
              <Text style={styles.helperText}>友達検索に使用します</Text>
            </View>
          </View>

          <View style={styles.bottomContent}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && styles.submitButtonPressed,
                isSubmitting && styles.submitButtonDisabled,
              ]}
            >
              <LoadingButtonContent
                label="登録する"
                loading={isSubmitting}
                loadingLabel="作成中..."
                textStyle={styles.submitButtonText}
                tone="light"
              />
            </Pressable>

            {errorMessage && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  topContent: {
    gap: 16,
  },
  bottomContent: {
    gap: 16,
    marginTop: 32,
  },
  title: {
    color: '#171717',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'left',
  },
  avatarSection: {
    alignItems: 'center',
    gap: 16,
    marginVertical: 8,
  },
  avatarCaption: {
    color: '#737373',
    fontSize: 14,
    textAlign: 'center',
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '700',
  },
  helperText: {
    color: '#737373',
    fontSize: 13,
  },
  avatarPreview: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderColor: '#f5f5f5',
    borderRadius: 63,
    borderWidth: 2,
    height: 126,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 126,
  },
  avatarPreviewImage: {
    height: '100%',
    width: '100%',
  },
  pickPhotoButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  pickPhotoButtonText: {
    color: '#171717',
    fontSize: 13,
    fontWeight: '700',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  iconOption: {
    borderColor: 'transparent',
    borderRadius: 30,
    borderWidth: 3,
    height: 60,
    overflow: 'hidden',
    width: 60,
  },
  iconOptionSelected: {
    borderColor: '#171717',
  },
  iconOptionPressed: {
    opacity: 0.7,
  },
  iconOptionImage: {
    height: '100%',
    width: '100%',
  },
  input: {
    backgroundColor: '#fafafa',
    borderColor: '#f5f5f5',
    borderRadius: 11,
    borderWidth: 2,
    color: '#171717',
    fontSize: 15,
    minHeight: 57,
    paddingHorizontal: 16,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    marginTop: 8,
  },
  submitButtonPressed: {
    opacity: 0.82,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
