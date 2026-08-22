import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { stopRingingAlarm } from '@/services/android-alarm-mechanics';
import { useAlarmTimer } from '@/services/alarm-timer';

export default function FaceCheckFailureScreen() {
  const params = useLocalSearchParams<{
    alarmId?: string;
    badPhotoAttempts?: string;
  }>();
  const timer = useAlarmTimer();

  useEffect(() => {
    if (timer?.status === 'expired') {
      // The alarm rings through Face Check by design (see face-check.tsx), stopping only
      // on a pass or the 3rd bad photo -- if the Alarm Timer expires first instead, it's
      // still ringing and nothing else will ever silence it.
      stopRingingAlarm().catch(() => {});
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
            <Text style={styles.title}>顔判定に失敗しました</Text>
            <Text style={styles.caption}>もう一度顔写真を撮影してください</Text>
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
          <Text style={styles.buttonText}>再度写真を撮影する</Text>
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
  },
  caption: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
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
  },
});
