import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, challengeStyles } from '@/components/wake-challenge-ui';
import { clearWakeChallengeAttempt } from '@/services/wake-challenge-attempt';
import { recordWakeAttemptOutcome } from '@/services/wake-status';

export default function QuizSuccessScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    activatedByDisplayName?: string;
    requiredQuestionCount?: string;
  }>();

  useEffect(() => {
    // Read (via recordWakeAttemptOutcome) before clearing -- clearWakeChallengeAttempt
    // removes the very attempt record it needs to know when the alarm rang.
    const requiredQuestionCount = params.requiredQuestionCount
      ? Number(params.requiredQuestionCount)
      : null;

    recordWakeAttemptOutcome('success', requiredQuestionCount).catch(() => {});
    clearWakeChallengeAttempt().catch(() => {});
  }, [params.requiredQuestionCount]);

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
            <Text style={challengeStyles.lightTitle}>
              {t('quizSuccess.title')}
            </Text>
            <Text style={challengeStyles.lightCaption}>
              {t('quizSuccess.caption')}
            </Text>
            {!!params.activatedByDisplayName && (
              <Text style={styles.activatedBy}>
                {t('quizSuccess.activatedByLabel', {
                  displayName: params.activatedByDisplayName,
                })}
              </Text>
            )}
          </View>

          <ActionButton
            label={t('quizSuccess.homeButton')}
            onPress={() => router.replace('/home')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  activatedBy: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 38,
    paddingBottom: 48,
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
    paddingHorizontal: 32,
    paddingTop: 42,
  },
  copy: {
    gap: 12,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  iconText: {
    color: '#171717',
    fontSize: 46,
    fontWeight: '900',
  },
});
