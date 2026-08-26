import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ALARM_TIMER_SECONDS,
  formatRemainingTime,
} from '@/components/wake-challenge-ui';
import { recordSavedAlarmFired } from '@/services/alarm';
import {
  getAlarmTimerState,
  startTimer,
  startTimerFromStartedAt,
  useAlarmTimer,
} from '@/services/alarm-timer';
import {
  AndroidAlarmMechanicsError,
  getRingingAlarmState,
  type RingingAlarmState,
} from '@/services/android-alarm-mechanics';
import { startWakeChallengeAttempt } from '@/services/wake-challenge-attempt';

function getErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof AndroidAlarmMechanicsError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return t('ringing.errors.checkFailed');
}

function getStartedAt(
  ringingState: RingingAlarmState | null,
  routeStartedAt?: string,
) {
  return ringingState?.startedAt ?? routeStartedAt ?? new Date().toISOString();
}

function shouldStartRingingTimer() {
  const currentTimer = getAlarmTimerState();

  return !currentTimer || currentTimer.status === 'expired';
}

function startRingingTimerIfNeeded(startedAt: string) {
  if (!shouldStartRingingTimer()) {
    return;
  }

  startTimerFromStartedAt(ALARM_TIMER_SECONDS, startedAt);
}

function formatWakeUpTime(startedAt: string): string {
  const parsedMs = Date.parse(startedAt);
  const date = Number.isFinite(parsedMs) ? new Date(parsedMs) : new Date();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

export default function RingingScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    alarmId?: string;
    startedAt?: string;
  }>();
  const [ringingState, setRingingState] = useState<RingingAlarmState | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const timer = useAlarmTimer();
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const heartbeat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 550,
          easing: Easing.out(Easing.quad),
          toValue: 1.12,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 550,
          easing: Easing.in(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.delay(400),
      ]),
    );

    heartbeat.start();

    return () => heartbeat.stop();
  }, [pulse]);

  useEffect(() => {
    if (params.alarmId) {
      recordSavedAlarmFired(params.alarmId).catch(() => {});
    }
  }, [params.alarmId]);

  useEffect(() => {
    let isActive = true;

    const timeout = setTimeout(() => {
      async function refreshRingingState() {
        try {
          if (isActive) {
            setErrorMessage(null);
          }

          const nextRingingState = await getRingingAlarmState();

          if (!isActive) {
            return;
          }

          setRingingState(nextRingingState);

          startRingingTimerIfNeeded(
            getStartedAt(nextRingingState, params.startedAt),
          );
        } catch (error) {
          if (!isActive) {
            return;
          }

          setErrorMessage(getErrorMessage(error, t));

          startRingingTimerIfNeeded(
            params.startedAt ?? new Date().toISOString(),
          );
        }
      }

      refreshRingingState();
    }, 0);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [params.startedAt, t]);

  // Edge-triggered on purpose: alarm-timer.ts is a module-level singleton, so the very
  // first status this screen observes can be a stale 'expired' left over from a
  // previous, already-finished Wake Up Challenge (whose timer never gets reset until
  // someone starts a new one) rather than this ringing session's own timer actually
  // running out (that reset happens in the effect above, deferred a tick via
  // setTimeout, so it hasn't necessarily run yet on this same first render). Only a
  // genuine running -> expired transition -- never an already-expired value seen on
  // mount -- means this session's timer really did run out.
  const previousTimerStatusRef = useRef(timer?.status);

  useEffect(() => {
    const previousStatus = previousTimerStatusRef.current;
    previousTimerStatusRef.current = timer?.status;

    if (previousStatus === 'running' && timer?.status === 'expired') {
      router.replace({
        pathname: '/quiz-failure',
        params: { reason: 'no-photo-timeout' },
      });
    }
  }, [timer?.status]);

  async function handleStartChallenge() {
    setIsStarting(true);

    try {
      setErrorMessage(null);
      const activeAlarmId = ringingState?.alarmId ?? params.alarmId ?? '';
      // The alarm keeps ringing through Face Check now — it only stops once the wake-up
      // photo is actually captured (see face-check.tsx's takePhoto), not merely once the
      // user starts the challenge.
      startTimer(ALARM_TIMER_SECONDS);
      await startWakeChallengeAttempt({ alarmId: activeAlarmId || null });
      router.replace({
        pathname: '/face-check',
        params: {
          alarmId: activeAlarmId,
          badPhotoAttempts: '0',
        },
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsStarting(false);
    }
  }

  const wakeUpTime = formatWakeUpTime(
    getStartedAt(ringingState, params.startedAt),
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.timerPill}>
          <Text style={styles.timerPillText}>
            {t('ringing.timerRemaining', { time: formatRemainingTime(timer) })}
          </Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.wakeUpTime}>{wakeUpTime}</Text>
          <Text style={styles.greeting}>{t('ringing.greeting')}</Text>
          <Text style={styles.caption}>{t('ringing.caption')}</Text>

          <Animated.View
            style={[styles.cameraRing, { transform: [{ scale: pulse }] }]}
          >
            <View style={styles.cameraCircle}>
              <View style={styles.cameraIcon}>
                <View style={styles.cameraIconBump} />
                <View style={styles.cameraIconBody}>
                  <View style={styles.cameraIconLens} />
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isStarting}
          onPress={handleStartChallenge}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isStarting && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {isStarting ? t('ringing.starting') : t('ringing.startButton')}
          </Text>
        </Pressable>

        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
      </ScrollView>
    </View>
  );
}

const CAMERA_RING_SIZE = 96;
const CAMERA_CIRCLE_SIZE = 72;

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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'noteSansJP_700Bold',
  },
  caption: {
    color: '#a3a3a3',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 40,
    textAlign: 'center',
    fontFamily: 'NoteSansJP_700Bold',
  },
  cameraCircle: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderColor: '#ffffff',
    borderRadius: CAMERA_CIRCLE_SIZE / 2,
    borderWidth: 2,
    height: CAMERA_CIRCLE_SIZE,
    justifyContent: 'center',
    width: CAMERA_CIRCLE_SIZE,
  },
  cameraIcon: {
    alignItems: 'center',
  },
  cameraIconBody: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    height: 20,
    justifyContent: 'center',
    width: 30,
  },
  cameraIconBump: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
    height: 5,
    marginBottom: 1,
    width: 12,
  },
  cameraIconLens: {
    backgroundColor: '#171717',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  cameraRing: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: CAMERA_RING_SIZE / 2,
    borderWidth: 2,
    height: CAMERA_RING_SIZE,
    justifyContent: 'center',
    width: CAMERA_RING_SIZE,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  error: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
    textAlign: 'center',
  },
  greeting: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    fontFamily: 'NOtoSansJP_700Bold',
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
  timerPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  timerPillText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  wakeUpTime: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 12,
  },
});
