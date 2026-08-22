import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type LoadingTone = 'dark' | 'light';
type LoadingVariant = 'screen' | 'section' | 'inline';

type LoadingIndicatorProps = {
  accessibilityLabel?: string;
  size?: 'small' | 'large';
  tone?: LoadingTone;
};

type LoadingStateProps = LoadingIndicatorProps & {
  message?: string;
  style?: StyleProp<ViewStyle>;
  variant?: LoadingVariant;
};

type LoadingButtonContentProps = {
  label: string;
  loading: boolean;
  loadingLabel: string;
  textStyle: StyleProp<TextStyle>;
  tone?: LoadingTone;
};

function getIndicatorColor(tone: LoadingTone): string {
  return tone === 'light' ? '#ffffff' : '#171717';
}

export function LoadingIndicator({
  accessibilityLabel = '読み込み中',
  size = 'small',
  tone = 'dark',
}: LoadingIndicatorProps) {
  return (
    <ActivityIndicator
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      color={getIndicatorColor(tone)}
      size={size}
    />
  );
}

export function LoadingState({
  accessibilityLabel,
  message = '読み込み中...',
  size = 'small',
  style,
  tone = 'dark',
  variant = 'section',
}: LoadingStateProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.state, styles[variant], style]}
    >
      <LoadingIndicator
        accessibilityLabel={accessibilityLabel ?? message}
        size={size}
        tone={tone}
      />
      {message.length > 0 && (
        <Text
          style={tone === 'light' ? styles.lightMessage : styles.darkMessage}
        >
          {message}
        </Text>
      )}
    </View>
  );
}

export function LoadingButtonContent({
  label,
  loading,
  loadingLabel,
  textStyle,
  tone = 'dark',
}: LoadingButtonContentProps) {
  if (!loading) {
    return <Text style={textStyle}>{label}</Text>;
  }

  return (
    <View accessibilityLiveRegion="polite" style={styles.buttonContent}>
      <LoadingIndicator
        accessibilityLabel={loadingLabel || `${label}を処理中`}
        tone={tone}
      />
      {loadingLabel.length > 0 && <Text style={textStyle}>{loadingLabel}</Text>}
    </View>
  );
}

type FaceCheckLoadingProps = {
  message?: string;
};

export function FaceCheckLoading({
  message = '顔を確認しています...',
}: FaceCheckLoadingProps) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let isMounted = true;
    let animation: Animated.CompositeAnimation | undefined;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!isMounted) {
        return;
      }

      if (reduceMotion) {
        pulse.setValue(1);
        return;
      }

      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
    });

    return () => {
      isMounted = false;
      animation?.stop();
    };
  }, [pulse]);

  return (
    <View
      accessibilityLabel={`${message} そのままお待ちください`}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={styles.faceCheckOverlay}
    >
      <Animated.View
        style={[
          styles.faceCheckRing,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.42, 1],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1.04],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.faceCheckCircle}>
          <LoadingIndicator accessibilityLabel={message} tone="light" />
        </View>
      </Animated.View>

      <View style={styles.faceCheckCopy}>
        <Text style={styles.faceCheckTitle}>{message}</Text>
        <Text style={styles.faceCheckCaption}>そのままお待ちください</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  section: {
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  inline: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  darkMessage: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  lightMessage: {
    color: '#a3a3a3',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  faceCheckOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 23, 23, 0.94)',
    bottom: 0,
    gap: 36,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  faceCheckRing: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 48,
    borderWidth: 3,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  faceCheckCircle: {
    alignItems: 'center',
    borderColor: '#ffffff',
    borderRadius: 36,
    borderWidth: 2,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  faceCheckCopy: {
    gap: 8,
  },
  faceCheckTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
  },
  faceCheckCaption: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
