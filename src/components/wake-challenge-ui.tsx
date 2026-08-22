import { Pressable, StyleSheet } from 'react-native';

import { LoadingButtonContent } from '@/components/loading';
import type { AlarmTimerState } from '@/services/alarm-timer';

export const ALARM_TIMER_SECONDS = 180;
export const MAX_BAD_PHOTO_ATTEMPTS = 3;

export function getRemainingMs(timer: AlarmTimerState | null): number {
  return timer?.remainingMs ?? ALARM_TIMER_SECONDS * 1000;
}

export function formatRemainingTime(timer: AlarmTimerState | null): string {
  const totalSeconds = Math.max(0, Math.ceil(getRemainingMs(timer) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type ActionButtonProps = {
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

export function ActionButton({
  disabled,
  label,
  loading,
  loadingLabel = '処理中...',
  onPress,
  variant = 'primary',
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primaryButton : styles.secondaryButton,
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
      ]}
    >
      <LoadingButtonContent
        label={label}
        loading={loading ?? false}
        loadingLabel={loadingLabel}
        textStyle={[
          styles.buttonText,
          isPrimary ? styles.primaryButtonText : styles.secondaryButtonText,
        ]}
        tone={isPrimary ? 'light' : 'dark'}
      />
    </Pressable>
  );
}

export const challengeStyles = StyleSheet.create({
  darkCaption: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  darkTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
  },
  lightCaption: {
    color: '#737373',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  lightTitle: {
    color: '#171717',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: '#171717',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: '#171717',
  },
});
