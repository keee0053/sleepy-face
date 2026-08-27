import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, challengeStyles } from '@/components/wake-challenge-ui';
import { ShareResultButton } from '@/components/share-result-button';
import { stopRingingAlarm } from '@/services/android-alarm-mechanics';
import { recordFailureAccessOutcome } from '@/services/friends-feed-access';
import type { WakeChallengeFailureReason } from '@/services/wake-challenge-rules';
import { clearWakeChallengeAttempt } from '@/services/wake-challenge-attempt';
import {
  formatAlarmTimeLabel,
  formatElapsedLabel,
} from '@/services/wake-result-summary';
import { logWakeChallengeFailure } from '@/services/wake-friends';
import { recordWakeAttemptOutcome } from '@/services/wake-status';

type NoPhotoFailureReason = Extract<
  WakeChallengeFailureReason,
  'app-quit' | 'bad-photo-limit' | 'no-photo-timeout'
>;

function getFailureReason(reason?: string): NoPhotoFailureReason {
  switch (reason) {
    case 'app-quit':
    case 'bad-photo-limit':
    case 'no-photo-timeout':
      return reason;
    default:
      return 'no-photo-timeout';
  }
}

function getFailureCopy(
  reason: NoPhotoFailureReason,
  t: (key: string) => string,
) {
  switch (reason) {
    case 'app-quit':
      return t('quizFailure.reasons.appQuit');
    case 'bad-photo-limit':
      return t('quizFailure.reasons.badPhotoLimit');
    case 'no-photo-timeout':
      return t('quizFailure.reasons.noPhotoTimeout');
  }
}

export default function QuizFailureScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    activatedByDisplayName?: string;
    reason?: string;
    requiredQuestionCount?: string;
  }>();

  const failureReason = getFailureReason(params.reason);
  const [firedAt, setFiredAt] = useState<string | null>(null);

  useEffect(() => {
    // Read (via recordWakeAttemptOutcome) before clearing -- clearWakeChallengeAttempt
    // removes the very attempt record it needs to know when the alarm rang. No question
    // count when the failure happened before the quiz stage even started (Bad Photo
    // Limit, from face-check.tsx).
    const requiredQuestionCount = params.requiredQuestionCount
      ? Number(params.requiredQuestionCount)
      : null;

    recordWakeAttemptOutcome('failure', requiredQuestionCount)
      .then((recorded) => setFiredAt(recorded.firedAt))
      .catch(() => {});
    clearWakeChallengeAttempt().catch(() => {});
    recordFailureAccessOutcome(failureReason).catch(() => {});
    logWakeChallengeFailure().catch(() => {});
    // The Wake Up Challenge is over (failed) at this point -- nothing further in the
    // app can advance it, so the alarm must stop here too, not just on success/the 3rd
    // Bad Photo Attempt (see face-check.tsx). Otherwise it rings with no in-app way to
    // silence it.
    stopRingingAlarm().catch(() => {});
  }, [failureReason, params.requiredQuestionCount]);

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
            <Text style={challengeStyles.darkTitle}>
              {t('quizFailure.title')}
            </Text>
            <Text style={challengeStyles.darkCaption}>
              {getFailureCopy(failureReason, t)}
            </Text>
            {!!params.activatedByDisplayName && (
              <Text style={styles.activatedBy}>
                {t('quizFailure.activatedByLabel', {
                  displayName: params.activatedByDisplayName,
                })}
              </Text>
            )}
          </View>

          <ActionButton
            label={t('quizFailure.backToAlarmButton')}
            onPress={() => router.replace('/home')}
            variant="secondary"
          />

          {!!firedAt && (
            <ShareResultButton
              alarmTimeLabel={formatAlarmTimeLabel(firedAt)}
              elapsedLabel={formatElapsedLabel(firedAt)}
              outcome="failure"
              questionCount={
                params.requiredQuestionCount
                  ? Number(params.requiredQuestionCount)
                  : null
              }
              streakDays={0}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  activatedBy: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    gap: 38,
    justifyContent: 'center',
    paddingBottom: 48,
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
    paddingHorizontal: 32,
    paddingTop: 42,
  },
  copy: {
    gap: 12,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
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
});
