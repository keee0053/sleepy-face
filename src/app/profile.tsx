import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
  getProfileIconLabel,
  getProfileIconSource,
  PROFILE_ICON_SOURCES,
} from '@/constants/profile-icons';
import {
  setAppLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n';
import { deleteAccount } from '@/services/account';
import { signOut } from '@/services/auth';
import { getDevMode, setDevMode } from '@/services/dev-mode';
import {
  getProfileIconPhotoPickErrorMessage,
  pickAndUploadProfileIconPhoto,
} from '@/services/profile-icon-photo';
import {
  ProfilePhotosServiceError,
  deleteMyFailurePhoto,
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

function getValidationMessage(
  code: ProfileUpdateValidationErrorCode,
  t: (key: string) => string,
): string {
  switch (code) {
    case 'display_name_required':
      return t('profile.errors.displayNameRequired');
    case 'display_name_too_long':
      return t('profile.errors.displayNameTooLong');
  }
}

function getUpdateProfileErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof UserServiceError) {
    switch (error.code) {
      case 'invalid_profile_input':
        return t('profile.errors.invalidInput');
      case 'not_authenticated':
      case 'user_id_already_taken':
      case 'profile_already_created':
      case 'unexpected_error':
        return t('profile.errors.updateFailed');
    }
  }

  return t('profile.errors.updateFailed');
}

function getLoadErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (
    (error instanceof UserServiceError ||
      error instanceof ProfilePhotosServiceError) &&
    error.code === 'not_authenticated'
  ) {
    return t('profile.errors.notAuthenticated');
  }

  return t('profile.errors.loadFailed');
}

function isDevUserId(userId: string | undefined): boolean {
  return userId?.toLowerCase().includes('dev') ?? false;
}

function formatPhotoDate(
  isoDate: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const date = new Date(isoDate);

  return t('profile.photoDate', {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  });
}

export default function ProfileScreen() {
  const { i18n, t } = useTranslation();
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
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
          setErrorMessage(getLoadErrorMessage(error, t));
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
  }, [t]);

  const handleSave = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationResult = validateProfileUpdateInput({
      displayName,
      iconId,
    });

    if (!validationResult.isValid) {
      setErrorMessage(getValidationMessage(validationResult.code, t));
      return;
    }

    setIsSaving(true);

    try {
      const updatedProfile = await updateProfile(validationResult.value);

      setProfile(updatedProfile);
      setDisplayName(updatedProfile.displayName);
      setIconId(updatedProfile.iconId);
      setSuccessMessage(t('profile.updateSuccess'));
    } catch (error) {
      setErrorMessage(getUpdateProfileErrorMessage(error, t));
    } finally {
      setIsSaving(false);
    }
  }, [displayName, iconId, t]);

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

  const handleSelectLanguage = useCallback((language: SupportedLanguage) => {
    setAppLanguage(language).catch(() => {});
  }, []);

  const handleSignOut = useCallback(async () => {
    setErrorMessage(null);
    setIsSigningOut(true);

    try {
      await signOut();
      router.replace('/signin');
    } catch {
      setErrorMessage(t('profile.errors.signOutFailed'));
    } finally {
      setIsSigningOut(false);
    }
  }, [t]);

  const handleDeleteAccount = useCallback(async () => {
    setErrorMessage(null);
    setIsDeletingAccount(true);

    try {
      await deleteAccount();
      await signOut();
      router.replace('/signin');
    } catch {
      setErrorMessage(t('profile.errors.deleteAccountFailed'));
    } finally {
      setIsDeletingAccount(false);
    }
  }, [t]);

  const handleDeleteAccountPress = useCallback(() => {
    Alert.alert(
      t('profile.deleteAccountConfirm.title'),
      t('profile.deleteAccountConfirm.message'),
      [
        { style: 'cancel', text: t('common.cancel') },
        {
          onPress: () => {
            handleDeleteAccount();
          },
          style: 'destructive',
          text: t('common.delete'),
        },
      ],
    );
  }, [handleDeleteAccount, t]);

  const handleDeletePhoto = useCallback(
    (photo: MyFailurePhoto) => {
      Alert.alert(
        t('profile.deletePhotoConfirm.title'),
        t('profile.deletePhotoConfirm.message'),
        [
          { style: 'cancel', text: t('common.cancel') },
          {
            onPress: async () => {
              setIsDeletingPhoto(true);

              try {
                await deleteMyFailurePhoto(photo);
                setPhotos((currentPhotos) =>
                  currentPhotos.filter(
                    (item) => item.photoId !== photo.photoId,
                  ),
                );
                setSelectedPhoto(null);
              } catch {
                setErrorMessage(t('profile.errors.deletePhotoFailed'));
              } finally {
                setIsDeletingPhoto(false);
              }
            },
            style: 'destructive',
            text: t('common.delete'),
          },
        ],
      );
    },
    [t],
  );

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
      <Text style={styles.photoDate}>{formatPhotoDate(item.createdAt, t)}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>

          {isDevUserId(profile?.userId) && !isDevMode && (
            <Pressable accessibilityRole="button" onPress={handleEnableDevMode}>
              <Text style={styles.debugToggleText}>
                {t('profile.debug.enable')}
              </Text>
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
                    {t('profile.emptyPhotos')}
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
                          {t('profile.pickPhoto')}
                        </Text>
                      )}
                    </Pressable>

                    <View style={styles.iconGrid}>
                      {PROFILE_ICON_IDS.map((id) => {
                        const isSelected = id === iconId;

                        return (
                          <Pressable
                            accessibilityLabel={getProfileIconLabel(id, t)}
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
                    <Text style={styles.label}>{t('profile.userId')}</Text>
                    <Text style={styles.readOnlyValue}>
                      @{profile?.userId ?? ''}
                    </Text>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>{t('profile.displayName')}</Text>
                    <TextInput
                      editable={!isSaving}
                      onChangeText={setDisplayName}
                      placeholder={t('profile.displayNamePlaceholder')}
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
                      label={t('profile.saveButton')}
                      loading={isSaving}
                      loadingLabel={t('profile.saving')}
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

                  <Text style={styles.sectionTitle}>
                    {t('languageSwitcher.title')}
                  </Text>
                  <View style={styles.languageSwitcherRow}>
                    {SUPPORTED_LANGUAGES.map((language) => {
                      const isActive = i18n.language === language;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={language}
                          onPress={() => handleSelectLanguage(language)}
                          style={[
                            styles.languagePill,
                            isActive && styles.languagePillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.languagePillText,
                              isActive && styles.languagePillTextActive,
                            ]}
                          >
                            {t(
                              `languageSwitcher.${
                                language === 'ja' ? 'japanese' : 'english'
                              }`,
                            )}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

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
                      label={t('profile.signOutButton')}
                      loading={isSigningOut}
                      loadingLabel={t('profile.signingOut')}
                      textStyle={styles.signOutButtonText}
                    />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/blocked-users')}
                    style={({ pressed }) => [
                      styles.blockedUsersLink,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.blockedUsersLinkText}>
                      {t('blockedUsers.title')}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={isDeletingAccount}
                    onPress={handleDeleteAccountPress}
                    style={({ pressed }) => [
                      styles.deleteAccountButton,
                      pressed && styles.buttonPressed,
                      isDeletingAccount && styles.saveButtonDisabled,
                    ]}
                  >
                    <LoadingButtonContent
                      label={t('profile.deleteAccountButton')}
                      loading={isDeletingAccount}
                      loadingLabel={t('profile.deletingAccount')}
                      textStyle={styles.deleteAccountButtonText}
                    />
                  </Pressable>

                  <Text style={styles.sectionTitle}>
                    {t('profile.failureRecords')}
                  </Text>
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
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            onPress={() => setSelectedPhoto(null)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseButtonText}>✕</Text>
          </Pressable>

          {selectedPhoto && (
            <>
              <Image
                contentFit="contain"
                source={{ uri: selectedPhoto.imageUrl }}
                style={styles.modalPhoto}
              />

              <Pressable
                accessibilityRole="button"
                disabled={isDeletingPhoto}
                onPress={() => handleDeletePhoto(selectedPhoto)}
                style={({ pressed }) => [
                  styles.modalDeleteButton,
                  pressed && styles.buttonPressed,
                  isDeletingPhoto && styles.saveButtonDisabled,
                ]}
              >
                {isDeletingPhoto ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalDeleteButtonText}>
                    {t('profile.deletePhotoButton')}
                  </Text>
                )}
              </Pressable>
            </>
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
  blockedUsersLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  blockedUsersLinkText: {
    color: '#525252',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteAccountButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  deleteAccountButtonText: {
    color: '#98a2b3',
    fontSize: 14,
    fontWeight: '600',
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
  languageSwitcherRow: {
    flexDirection: 'row',
    gap: 8,
  },
  languagePill: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  languagePillActive: {
    backgroundColor: '#171717',
    borderColor: '#171717',
  },
  languagePillText: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
  },
  languagePillTextActive: {
    color: '#ffffff',
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
  modalDeleteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(180, 35, 24, 0.9)',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 24,
  },
  modalDeleteButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
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
