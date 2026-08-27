import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { WakeResultCard, type WakeResultCardProps } from './wake-result-card';

type ShareResultButtonProps = WakeResultCardProps & {
  tone?: 'light' | 'dark';
};

// Renders the same WakeResultCard offscreen (never visible to the user, just laid out
// so react-native-view-shot has something to rasterize) and hands the captured PNG to
// the OS share sheet -- this never uploads or posts anywhere on its own, and never
// includes the wake-up photo (see WakeResultCard's own doc comment).
export function ShareResultButton(props: ShareResultButtonProps) {
  const { tone = 'dark', ...cardProps } = props;
  const { t } = useTranslation();
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);

  async function handleShare() {
    if (isSharing) {
      return;
    }

    setIsSharing(true);

    try {
      const isAvailable = await Sharing.isAvailableAsync();

      if (!isAvailable || !cardRef.current) {
        return;
      }

      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch {
      // Best-effort: sharing is a nice-to-have, never worth surfacing an error over.
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <>
      <View collapsable={false} ref={cardRef} style={styles.offscreen}>
        <WakeResultCard {...cardProps} />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={isSharing}
        onPress={handleShare}
        style={({ pressed }) => [
          styles.button,
          tone === 'light' ? styles.buttonLight : styles.buttonDark,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text
          style={
            tone === 'light' ? styles.buttonTextLight : styles.buttonTextDark
          }
        >
          {isSharing
            ? t('wakeResultCard.sharing')
            : t('wakeResultCard.shareButton')}
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    left: -9999,
    position: 'absolute',
    top: 0,
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  buttonDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonLight: {
    backgroundColor: '#f5f5f5',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonTextDark: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonTextLight: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
  },
});
