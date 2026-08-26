import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAlarmTimer } from '@/services/alarm-timer';

export default function FaceCheckFailureScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    alarmId?: string;
    badPhotoAttempts?: string;
  }>();
  const timer = useAlarmTimer();

  useEffect(() => {
    if (timer?.status === 'expired') {
      router.replace({
        pathname: '/quiz-failure',
        params: { reason: 'no-photo-timeout' },
      });
    }
  }, [timer?.status]);

  function handleRetry() {
    router.replace({
      pathname: '/face-check',
      params: {
        alarmId: params.alarmId ?? '',
        badPhotoAttempts: params.badPhotoAttempts ?? '0',
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.content}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>×</Text>
          </View>

          <View style={styles.copy}>
            <Text style={styles.title}>{t('faceCheckFailure.title')}</Text>
            <Text style={styles.caption}>{t('faceCheckFailure.caption')}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {t('faceCheckFailure.retryButton')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 32,
    minHeight: 68,
    paddingHorizontal: 24,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'NoteSansJP_700Bold',
  },
  caption: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: 'NoteSansJP_700Bold',
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
  icon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 48,
    borderWidth: 4,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  iconText: {
    color: '#ffffff',
    fontSize: 46,
    fontWeight: '900',
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
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
    fontFamily: 'NotoSansJP_700Bold',
  },
});
