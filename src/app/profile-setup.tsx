import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  MockAvatar,
  MockBottomNav,
  MockButton,
  MockCard,
  MockScreen,
} from '@/components/mock-ui';
import { getCurrentUserId } from '@/services/auth';
import {
  UserServiceError,
  createProfile,
  getMyProfile,
  normalizePublicUserId,
  validateInitialSetupInput,
  type InitialSetupValidationErrorCode,
} from '@/services/user';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isExistingProfile, setIsExistingProfile] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        setPublicUserId(profile.userId);
        setDisplayName(profile.displayName);
        setIsExistingProfile(true);
        setIsCheckingProfile(false);
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

  const handleSubmit = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

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

    if (isExistingProfile) {
      setSuccessMessage('プロフィール編集画面の表示を確認できます。');
      return;
    }

    setIsSubmitting(true);

    try {
      await createProfile(validationResult.value);
      router.replace('/home');
    } catch (error) {
      if (
        error instanceof UserServiceError &&
        error.code === 'not_authenticated'
      ) {
        router.replace('/signin');
        return;
      }

      if (
        error instanceof UserServiceError &&
        error.code === 'profile_already_created'
      ) {
        const profile = await getMyProfile();

        if (profile) {
          router.replace('/home');
          return;
        }
      }

      setErrorMessage(getCreateProfileErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [displayName, isExistingProfile, publicUserId]);

  if (isCheckingProfile) {
    return (
      <MockScreen title="プロフィール">
        <View style={styles.container}>
          <Text>確認中...</Text>
        </View>
      </MockScreen>
    );
  }

  return (
    <MockScreen
      footer={<MockBottomNav active="profile" />}
      subtitle={
        isExistingProfile
          ? '表示名やユーザーIDを確認できます。'
          : 'アプリで使うユーザーIDと表示名を登録します。'
      }
      title={isExistingProfile ? 'プロフィール編集' : 'プロフィール設定'}
    >
      <MockCard>
        <View style={styles.profileHeader}>
          <MockAvatar label={displayName || 'U'} />
          <View style={styles.profileSummary}>
            <Text style={styles.summaryName}>
              {displayName || '表示名未入力'}
            </Text>
            <Text style={styles.summaryId}>@{publicUserId || 'user_id'}</Text>
          </View>
        </View>
      </MockCard>

      <View style={styles.form}>
        <Text style={styles.label}>ユーザーID</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          onChangeText={handlePublicUserIdChange}
          placeholder="ユーザーID"
          style={styles.input}
          value={publicUserId}
        />

        <Text style={styles.label}>表示名</Text>
        <TextInput
          editable={!isSubmitting}
          onChangeText={setDisplayName}
          placeholder="表示名"
          style={styles.input}
          value={displayName}
        />

        <MockButton
          disabled={isSubmitting}
          onPress={handleSubmit}
          label={
            isSubmitting ? '作成中...' : isExistingProfile ? '保存' : '登録'
          }
        />

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        {successMessage && (
          <Text style={styles.successText}>{successMessage}</Text>
        )}
      </View>
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  profileSummary: {
    flex: 1,
  },
  summaryName: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '900',
  },
  summaryId: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  label: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderRadius: 12,
    borderWidth: 1,
    color: '#171717',
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  successText: {
    color: '#067647',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
});
