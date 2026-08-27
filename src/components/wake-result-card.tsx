import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export type WakeResultCardProps = {
  outcome: 'success' | 'failure';
  alarmTimeLabel: string;
  elapsedLabel: string | null;
  questionCount: number | null;
  streakDays: number;
};

// Deliberately never includes the wake-up photo itself, and this component only ever
// renders into an offscreen view for capture (see the share button in
// quiz-success.tsx/quiz-failure.tsx/quiz-failure-photo.tsx) -- nothing here posts
// anywhere on its own, the OS share sheet is the only way this image leaves the device.
export function WakeResultCard({
  outcome,
  alarmTimeLabel,
  elapsedLabel,
  questionCount,
  streakDays,
}: WakeResultCardProps) {
  const { t } = useTranslation();
  const isSuccess = outcome === 'success';

  return (
    <View
      style={[styles.card, isSuccess ? styles.cardSuccess : styles.cardFailure]}
    >
      <Text style={styles.outcome}>
        {isSuccess ? t('wakeResultCard.success') : t('wakeResultCard.failure')}
      </Text>

      <Text style={styles.alarmTime}>{alarmTimeLabel}</Text>

      <View style={styles.statRow}>
        {elapsedLabel !== null && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('wakeResultCard.elapsed')}</Text>
            <Text style={styles.statValue}>{elapsedLabel}</Text>
          </View>
        )}

        {questionCount !== null && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>
              {t('wakeResultCard.questionCount')}
            </Text>
            <Text style={styles.statValue}>{questionCount}</Text>
          </View>
        )}

        {streakDays > 0 && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('wakeResultCard.streak')}</Text>
            <Text style={styles.statValue}>
              {t('wakeResultCard.streakValue', { count: streakDays })}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.appName}>{t('wakeResultCard.appName')}</Text>
    </View>
  );
}

const CARD_WIDTH = 320;

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    gap: 20,
    paddingHorizontal: 28,
    paddingVertical: 36,
    width: CARD_WIDTH,
  },
  cardFailure: {
    backgroundColor: '#2b1414',
  },
  cardSuccess: {
    backgroundColor: '#171717',
  },
  outcome: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  alarmTime: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  stat: {
    alignItems: 'center',
    minWidth: 70,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  appName: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
