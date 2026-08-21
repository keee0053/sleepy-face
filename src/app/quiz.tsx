import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActionButton,
  formatRemainingTime,
  getRemainingMs,
} from '@/components/wake-challenge-ui';
import { useQuizAnswerFeedback } from '@/components/quiz-answer-feedback';
import { resumeTimer, useAlarmTimer } from '@/services/alarm-timer';
import { getDevMode } from '@/services/dev-mode';
import {
  QuizServiceError,
  startQuiz,
  submitQuizAnswer,
  type QuizState,
} from '@/services/quiz';
import {
  applyQuizKeypadInput,
  type QuizKeypadKey,
} from '@/services/quiz-keypad';
import type { WakeChallengeFailureReason } from '@/services/wake-challenge-rules';

const TIMER_WARNING_THRESHOLD_MS = 60_000;

const KEYPAD_KEYS: QuizKeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'minus',
  '0',
  'backspace',
];

function getKeypadKeyLabel(key: QuizKeypadKey): string {
  if (key === 'minus') {
    return '-';
  }

  if (key === 'backspace') {
    return '⌫';
  }

  return key;
}

function getErrorMessage(error: unknown) {
  if (error instanceof QuizServiceError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'クイズの処理に失敗しました。';
}

export default function QuizScreen() {
  const params = useLocalSearchParams<{
    localPhotoUri?: string;
  }>();
  const timer = useAlarmTimer();
  const { playCorrectAnswerFeedback } = useQuizAnswerFeedback();
  const [quizState, setQuizState] = useState<QuizState>(() => startQuiz());
  const [answerText, setAnswerText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);
  const didHandleExpiry = useRef(false);

  useEffect(() => {
    resumeTimer();
  }, []);

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

  const routeToFailure = useCallback((reason: WakeChallengeFailureReason) => {
    router.replace({
      pathname: '/quiz-failure',
      params: { reason },
    });
  }, []);

  const routeToPhotoFailure = useCallback((localPhotoUri: string) => {
    router.replace({
      pathname: '/quiz-failure-photo',
      params: { localPhotoUri },
    });
  }, []);

  useEffect(() => {
    if (timer?.status !== 'expired' || didHandleExpiry.current) {
      return;
    }

    didHandleExpiry.current = true;

    if (!params.localPhotoUri) {
      routeToFailure('no-photo-timeout');
      return;
    }

    routeToPhotoFailure(params.localPhotoUri);
  }, [
    params.localPhotoUri,
    routeToFailure,
    routeToPhotoFailure,
    timer?.status,
  ]);

  function handleKeypadPress(key: QuizKeypadKey) {
    setErrorMessage(null);
    setAnswerText((current) => applyQuizKeypadInput(current, key));
  }

  function handleSubmitAnswer() {
    if (isSubmitting || timer?.status === 'expired') {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const nextState = submitQuizAnswer(answerText);
      setQuizState(nextState);
      setAnswerText('');

      if (nextState.lastAnswerCorrect) {
        playCorrectAnswerFeedback();
      }

      if (nextState.status === 'completed') {
        router.replace('/quiz-success');
        return;
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isActive = quizState.status === 'active';
  const isTimeRunningLow = getRemainingMs(timer) < TIMER_WARNING_THRESHOLD_MS;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.header}>
          <View style={styles.timerPill}>
            <Text
              style={[
                styles.timerPillText,
                isTimeRunningLow && styles.timerPillTextWarning,
              ]}
            >
              あと {formatRemainingTime(timer)}
            </Text>
          </View>

          <Text style={styles.progress}>
            {quizState.correctAnswerCount}/
            {quizState.requiredCorrectAnswerCount}
          </Text>

          {quizState.lastAnswerCorrect !== null && (
            <Text
              style={
                quizState.lastAnswerCorrect
                  ? styles.correctCue
                  : styles.incorrectCue
              }
            >
              {quizState.lastAnswerCorrect ? '正解!' : '不正解'}
            </Text>
          )}

          {isDevMode && (
            <View style={styles.debugButtonRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/quiz-success')}
              >
                <Text style={styles.debugToggleText}>[DEV] 成功</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (params.localPhotoUri) {
                    routeToPhotoFailure(params.localPhotoUri);
                    return;
                  }

                  routeToFailure('bad-photo-limit');
                }}
              >
                <Text style={styles.debugToggleText}>[DEV] 失敗</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.questionGroup}>
            <Text style={styles.prompt}>
              {isActive ? quizState.question.prompt : 'CLEAR'}
            </Text>

            <View style={styles.answerBox}>
              <View style={styles.answerBoxSurface}>
                <Text
                  style={
                    answerText ? styles.inputText : styles.inputPlaceholder
                  }
                >
                  {answerText || '?'}
                </Text>
              </View>
              <View style={styles.answerBoxUnderline} />
            </View>
          </View>

          <View style={styles.keypadGroup}>
            <View style={styles.grid}>
              {KEYPAD_KEYS.map((key) => (
                <Pressable
                  accessibilityRole="button"
                  key={key}
                  onPress={() => handleKeypadPress(key)}
                  style={({ pressed }) => [
                    styles.gridCell,
                    pressed && styles.gridCellPressed,
                  ]}
                >
                  <Text style={styles.gridText}>{getKeypadKeyLabel(key)}</Text>
                </Pressable>
              ))}
            </View>

            <ActionButton
              disabled={!answerText.trim()}
              label="回答する"
              loading={isSubmitting}
              onPress={handleSubmitAnswer}
            />

            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  debugButtonRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
  },
  debugToggleText: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700',
  },
  answerBox: {
    marginTop: 24,
    width: '70%',
  },
  answerBoxSurface: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 72,
  },
  answerBoxUnderline: {
    backgroundColor: '#171717',
    borderRadius: 2,
    height: 4,
    width: '100%',
  },
  content: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  correctCue: {
    color: '#16a34a',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  grid: {
    borderColor: '#f5f5f5',
    borderTopWidth: 1,
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    alignItems: 'center',
    borderColor: '#f5f5f5',
    borderRightWidth: 1,
    borderTopWidth: 1,
    height: '25%',
    justifyContent: 'center',
    width: '33.3333%',
  },
  gridCellPressed: {
    backgroundColor: '#f5f5f5',
  },
  gridText: {
    color: '#171717',
    fontSize: 26,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  incorrectCue: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  inputPlaceholder: {
    color: '#d4d4d4',
    fontSize: 28,
    fontWeight: '800',
  },
  inputText: {
    color: '#171717',
    fontSize: 28,
    fontWeight: '800',
  },
  keypadGroup: {
    flex: 1,
    gap: 20,
  },
  progress: {
    color: '#737373',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  prompt: {
    color: '#171717',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
    textAlign: 'center',
  },
  questionGroup: {
    alignItems: 'center',
  },
  screen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  timerPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#f5f5f5',
    borderColor: '#e5e5e5',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  timerPillText: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '800',
  },
  timerPillTextWarning: {
    color: '#dc2626',
  },
});
