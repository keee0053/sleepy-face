import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  REACTION_EMOJIS,
  type ReactionEmoji,
} from '@/services/photo-reactions';

type ReactionButtonProps = {
  count: number;
  viewerEmoji: ReactionEmoji | null;
  onSelectEmoji: (emoji: ReactionEmoji) => void;
  onRemoveEmoji: () => void;
};

export function ReactionButton({
  count,
  onRemoveEmoji,
  onSelectEmoji,
  viewerEmoji,
}: ReactionButtonProps) {
  const { t } = useTranslation();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  if (isPickerOpen) {
    return (
      <View style={styles.pickerRow}>
        {REACTION_EMOJIS.map((emoji) => {
          const isSelected = emoji === viewerEmoji;

          return (
            <Pressable
              accessibilityLabel={t('reactionButton.reactWithEmoji', { emoji })}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              hitSlop={4}
              key={emoji}
              onPress={() => {
                setIsPickerOpen(false);

                if (isSelected) {
                  onRemoveEmoji();
                  return;
                }

                onSelectEmoji(emoji);
              }}
              style={[
                styles.pickerOption,
                isSelected && styles.pickerOptionSelected,
              ]}
            >
              <Text style={styles.pickerEmoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={t('reactionButton.longPressHint')}
      accessibilityLabel={
        viewerEmoji
          ? t('reactionButton.removeReaction')
          : t('reactionButton.react')
      }
      accessibilityRole="button"
      accessibilityState={{ selected: !!viewerEmoji }}
      onLongPress={() => setIsPickerOpen(true)}
      onPress={() => {
        if (viewerEmoji) {
          onRemoveEmoji();
          return;
        }

        onSelectEmoji(REACTION_EMOJIS[0]);
      }}
      style={({ pressed }) => [
        styles.button,
        !!viewerEmoji && styles.buttonActive,
        pressed && styles.buttonPressed,
      ]}
    >
      {viewerEmoji ? (
        <Text style={styles.emoji}>{viewerEmoji}</Text>
      ) : (
        <SymbolView
          name={{
            ios: 'face.smiling',
            android: 'sentiment_satisfied',
            web: 'sentiment_satisfied',
          }}
          size={16}
          tintColor="#737373"
          type="monochrome"
        />
      )}
      <Text style={[styles.count, !!viewerEmoji && styles.countActive]}>
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buttonActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#fb923c',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  emoji: {
    fontSize: 15,
  },
  count: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '700',
  },
  countActive: {
    color: '#c2410c',
  },
  pickerRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  pickerOption: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  pickerOptionSelected: {
    backgroundColor: '#fff7ed',
  },
  pickerEmoji: {
    fontSize: 16,
  },
});
