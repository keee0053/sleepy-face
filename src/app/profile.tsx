import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/bottom-nav';
import { LoadingButtonContent } from '@/components/loading';
import { ProfileLoadingSkeleton } from '@/components/loading-skeletons';
import {
  getProfileIconSource,
  PROFILE_ICON_LABELS,
  PROFILE_ICON_SOURCES,
} from '@/constants/profile-icons';
import { signOut } from '@/services/auth';
import { getDevMode, setDevMode } from '@/services/dev-mode';
import {
  getProfileIconPhotoPickErrorMessage,
  pickAndUploadProfileIconPhoto,
} from '@/services/profile-icon-photo';
import {
  ProfilePhotosServiceError,
  listMyFailurePhotos,
  type MyFailurePhoto,
} from '@/services/profile-photos';
import {
  PROFILE_ICON_IDS,
  UserServiceError,
  getMyProfile,
  updateProfile,
  validateProfileUpdateInput,
  type Profile,
  type ProfileUpdateValidationErrorCode,
} from '@/services/user';

function getValidationMessage(code: ProfileUpdateValidationErrorCode): string {
  switch (code) {
    case 'display_name_required':
      return '表示名を入力してください。';
    case 'display_name_too_long':
      return '表示名は30文字以内で入力してください。';
  }
}

function getUpdateProfileErrorMessage(error: unknown): string {
  if (error instanceof UserServiceError) {
    switch (error.code) {
      case 'invalid_profile_input':
        return '入力内容を確認してください。';
      case 'not_authenticated':
      case 'user_id_already_taken':
      case 'profile_already_created':
      case 'unexpected_error':
        return 'プロフィールを更新できませんでした。もう一度お試しください。';
    }
  }

  return 'プロフィールを更新できませんでした。もう一度お試しください。';
}

function getLoadErrorMessage(error: unknown): string {
  if (
    (error instanceof UserServiceError ||
      error instanceof ProfilePhotosServiceError) &&
    error.code === 'not_authenticated'
  ) {
    return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
  }

  return 'プロフィールを読み込めませんでした。もう一度お試しください。';
}

function isDevUserId(userId: string | undefined): boolean {
  return userId?.toLowerCase().includes('dev') ?? false;
}

function formatPhotoDate(isoDate: string): string {
  const date = new Date(isoDate);

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [iconId, setIconId] = useState('human');
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [photos, setPhotos] = useState<MyFailurePhoto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<MyFailurePhoto | null>(
    null,
  );
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    let isActive = true;

    getDevMode().then((devMode) => {
      if (isActive) {
        setIsDevMode(devMode);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    Promise.all([getMyProfile(), listMyFailurePhotos()])
      .then(([nextProfile, nextPhotos]) => {
        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setPhotos(nextPhotos);

        if (nextProfile) {
          setDisplayName(nextProfile.displayName);
          setIconId(nextProfile.iconId);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getLoadErrorMessage(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationResult = validateProfileUpdateInput({
      displayName,
      iconId,
    });

    if (!validationResult.isValid) {
      setErrorMessage(getValidationMessage(validationResult.code));
      return;
    }

    setIsSaving(true);

    try {
      const updatedProfile = await updateProfile(validationResult.value);

      setProfile(updatedProfile);
      setDisplayName(updatedProfile.displayName);
      setIconId(updatedProfile.iconId);
      setSuccessMessage('プロフィールを更新しました。');
    } catch (error) {
      setErrorMessage(getUpdateProfileErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [displayName, iconId]);

  const handlePickPhoto = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
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

  const handleEnableDevMode = useCallback(async () => {
    await setDevMode(true);
    setIsDevMode(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    setErrorMessage(null);
    setIsSigningOut(true);

    try {
      await signOut();
      router.replace('/signin');
    } catch {
      setErrorMessage('ログアウトできませんでした。もう一度お試しください。');
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  const renderPhotoItem: ListRenderItem<MyFailurePhoto> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => setSelectedPhoto(item)}
      style={({ pressed }) => [
        styles.photoCard,
        pressed && styles.photoCardPressed,
      ]}
    >
      <Image
        contentFit="cover"
        source={{ uri: item.imageUrl }}
        style={styles.photoThumbnail}
      />
      <Text style={styles.photoDate}>{formatPhotoDate(item.createdAt)}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>設定</Text>

          {isDevUserId(profile?.userId) && !isDevMode && (
            <Pressable accessibilityRole="button" onPress={handleEnableDevMode}>
              <Text style={styles.debugToggleText}>[DEV] 有効化</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <ProfileLoadingSkeleton />
          ) : (
            <FlatList
              contentContainerStyle={styles.photoList}
              data={photos}
              keyExtractor={(item) => item.photoId}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    まだ失敗の記録がありません。
                  </Text>
                </View>
              }
              ListHeaderComponent={
                <View style={styles.listHeader}>
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
                      disabled={isSaving || isPickingPhoto}
                      onPress={handlePickPhoto}
                      style={({ pressed }) => [
                        styles.pickPhotoButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      {isPickingPhoto ? (
                        <ActivityIndicator color="#171717" size="small" />
                      ) : (
                        <Text style={styles.pickPhotoButtonText}>
                          写真を選ぶ
                        </Text>
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
                            disabled={isSaving}
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
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>ユーザーID</Text>
                    <Text style={styles.readOnlyValue}>
                      @{profile?.userId ?? ''}
                    </Text>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>表示名</Text>
                    <TextInput
                      editable={!isSaving}
                      onChangeText={setDisplayName}
                      placeholder="例：山田 太郎"
                      placeholderTextColor="#a3a3a3"
                      style={styles.input}
                      value={displayName}
                    />
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={handleSave}
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && styles.buttonPressed,
                      isSaving && styles.saveButtonDisabled,
                    ]}
                  >
                    <LoadingButtonContent
                      label="保存する"
                      loading={isSaving}
                      loadingLabel="保存中..."
                      textStyle={styles.saveButtonText}
                      tone="light"
                    />
                  </Pressable>

                  {errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}
                  {successMessage && (
                    <Text style={styles.successText}>{successMessage}</Text>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    disabled={isSigningOut}
                    onPress={handleSignOut}
                    style={({ pressed }) => [
                      styles.signOutButton,
                      pressed && styles.buttonPressed,
                      isSigningOut && styles.saveButtonDisabled,
                    ]}
                  >
                    <LoadingButtonContent
                      label="ログアウト"
                      loading={isSigningOut}
                      loadingLabel="ログアウト中..."
                      textStyle={styles.signOutButtonText}
                    />
                  </Pressable>

                  <Text style={styles.sectionTitle}>失敗の記録</Text>
                </View>
              }
              numColumns={2}
              renderItem={renderPhotoItem}
            />
          )}
        </View>

        <BottomNav activeRoute="/profile" />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
        transparent
        visible={selectedPhoto !== null}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="閉じる"
            accessibilityRole="button"
            onPress={() => setSelectedPhoto(null)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseButtonText}>✕</Text>
          </Pressable>

          {selectedPhoto && (
            <Image
              contentFit="contain"
              source={{ uri: selectedPhoto.imageUrl }}
              style={styles.modalPhoto}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 61,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  title: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '800',
  },
  debugToggleText: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listHeader: {
    paddingBottom: 4,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  avatarPreview: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderColor: '#f5f5f5',
    borderRadius: 56,
    borderWidth: 2,
    height: 112,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 112,
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
    borderRadius: 26,
    borderWidth: 3,
    height: 52,
    overflow: 'hidden',
    width: 52,
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
  field: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
  },
  readOnlyValue: {
    color: '#737373',
    fontSize: 16,
    paddingVertical: 4,
  },
  input: {
    backgroundColor: '#fafafa',
    borderColor: '#f5f5f5',
    borderRadius: 11,
    borderWidth: 2,
    color: '#171717',
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56,
  },
  signOutButtonText: {
    color: '#b42318',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  successText: {
    color: '#067647',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  sectionTitle: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 24,
  },
  photoList: {
    gap: 10,
    paddingBottom: 116,
  },
  photoCard: {
    gap: 6,
    margin: 5,
    width: '47%',
  },
  photoCardPressed: {
    opacity: 0.78,
  },
  photoThumbnail: {
    aspectRatio: 1,
    backgroundColor: '#e5e5e5',
    borderRadius: 12,
    width: '100%',
  },
  photoDate: {
    color: '#737373',
    fontSize: 12,
  },
  emptyBox: {
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 21,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    flex: 1,
    justifyContent: 'center',
  },
  modalCloseButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    top: 56,
    width: 44,
    zIndex: 1,
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  modalPhoto: {
    height: '80%',
    width: '100%',
  },
});
