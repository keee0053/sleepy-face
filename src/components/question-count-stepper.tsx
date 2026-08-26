import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MAX_QUIZ_QUESTION_COUNT,
  MIN_QUIZ_QUESTION_COUNT,
} from '@/services/alarm';

type QuestionCountStepperProps = {
  disabled?: boolean;
  onChange: (value: number) => void;
  value: number;
};

export function QuestionCountStepper({
  disabled,
  onChange,
  value,
}: QuestionCountStepperProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={t('questionCountStepper.decrease')}
        accessibilityRole="button"
        disabled={disabled || value <= MIN_QUIZ_QUESTION_COUNT}
        hitSlop={8}
        onPress={() => onChange(Math.max(MIN_QUIZ_QUESTION_COUNT, value - 1))}
        style={[
          styles.button,
          (disabled || value <= MIN_QUIZ_QUESTION_COUNT) &&
            styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>

      <Text style={styles.value}>
        {t('questionCountStepper.value', { count: value })}
      </Text>

      <Pressable
        accessibilityLabel={t('questionCountStepper.increase')}
        accessibilityRole="button"
        disabled={disabled || value >= MAX_QUIZ_QUESTION_COUNT}
        hitSlop={8}
        onPress={() => onChange(Math.min(MAX_QUIZ_QUESTION_COUNT, value + 1))}
        style={[
          styles.button,
          (disabled || value >= MAX_QUIZ_QUESTION_COUNT) &&
            styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'center',
  },
  value: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '800',
    minWidth: 64,
    textAlign: 'center',
  },
});
