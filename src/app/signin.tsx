import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  GoogleLoginError,
  coolDownGoogleLogin,
  startGoogleLogin,
  warmUpGoogleLogin,
} from '@/services/auth';
import { LoadingButtonContent } from '@/components/loading';
import { getMyProfile } from '@/services/user';

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof GoogleLoginError) {
    switch (error.code) {
      case 'login_interrupted':
        return 'Googleログインが中断されました。もう一度お試しください。';
      case 'oauth_url_missing':
      case 'provider_error':
        return 'Googleログインを開始できませんでした。設定を確認してください。';
      case 'missing_auth_tokens':
      case 'session_set_failed':
      case 'unexpected_error':
        return 'ログインに失敗しました。時間をおいてもう一度お試しください。';
    }
  }

  return 'ログインに失敗しました。時間をおいてもう一度お試しください。';
}

export default function SigninScreen() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    warmUpGoogleLogin().catch(() => undefined);

    return () => {
      coolDownGoogleLogin().catch(() => undefined);
    };
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await startGoogleLogin();
      const profile = await getMyProfile();

      if (profile) {
        router.replace('/home');
      } else {
        router.replace('/profile-setup');
      }
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoArea}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/app-icon.png')}
            style={styles.logo}
          />
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>SleepyFace</Text>
          <Text style={styles.description}>
            クイズに失敗すると寝顔が友達に公開されるアラーム
          </Text>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={isLoading}
            onPress={handleGoogleLogin}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.buttonPressed,
              isLoading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.googleMark}>G</Text>
            <LoadingButtonContent
              label="Googleでログイン"
              loading={isLoading}
              loadingLabel="ログイン中..."
              textStyle={styles.googleButtonText}
            />
          </Pressable>

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoArea: {
    alignItems: 'center',
  },
  logo: {
    borderRadius: 16,
    height: 128,
    width: 128,
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
  },
  title: {
    color: '#171717',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: '#737373',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    gap: 16,
    marginTop: 40,
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 62,
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  googleMark: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '800',
  },
  googleButtonText: {
    color: '#171717',
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
