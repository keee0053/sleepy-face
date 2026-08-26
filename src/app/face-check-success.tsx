import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const QUIZ_START_COUNTDOWN_SECONDS = 5;

export default function FaceCheckSuccessScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    alarmId?: string;
    localPhotoUri?: string;
  }>();
  const [secondsRemaining, setSecondsRemaining] = useState(
    QUIZ_START_COUNTDOWN_SECONDS,
  );
  const hasNavigated = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (secondsRemaining > 0 || hasNavigated.current) {
      return;
    }

    hasNavigated.current = true;
    router.replace({
      pathname: '/quiz',
      params: {
        alarmId: params.alarmId ?? '',
        localPhotoUri: params.localPhotoUri ?? '',
      },
    });
  }, [params.alarmId, params.localPhotoUri, secondsRemaining]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.content}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>✓</Text>
          </View>

          <View style={styles.copy}>
            <Text style={styles.title}>{t('faceCheckSuccess.title')}</Text>
            <Text style={styles.caption}>
              {t('faceCheckSuccess.caption', {
                seconds: QUIZ_START_COUNTDOWN_SECONDS,
              })}
            </Text>
          </View>

          <Text style={styles.countdown}>{secondsRemaining}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  countdown: {
    color: '#ffffff',
    fontSize: 72,
    fontWeight: '900',
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
