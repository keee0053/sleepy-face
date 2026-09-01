import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getProfileIconSource } from '@/constants/profile-icons';
import { listFriends, type FriendProfile } from '@/services/friend';
import { sendHelpRequest } from '@/services/help-request';

const MAX_MESSAGE_LENGTH = 200;
const PRESET_MESSAGE_KEYS = [
  'ringAgainIn10',
  'callMe',
  'imAwakeButLate',
] as const;

export default function HelpRequestScreen() {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    new Set(),
  );
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    listFriends()
      .then((nextFriends) => {
        if (isActive) {
          setFriends(nextFriends);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage(t('helpRequest.errors.loadFailed'));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [t]);

  function toggleFriend(friendId: string) {
    setSelectedFriendIds((current) => {
      const next = new Set(current);

      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }

      return next;
    });
  }

  function applyPreset(presetKey: (typeof PRESET_MESSAGE_KEYS)[number]) {
    setMessage(t(`helpRequest.presets.${presetKey}`));
  }

  async function handleSend() {
    if (isSending || selectedFriendIds.size === 0 || !message.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await sendHelpRequest([...selectedFriendIds], message.trim());
      setSuccessMessage(t('helpRequest.sendSuccess'));
      setSelectedFriendIds(new Set());
      setMessage('');
    } catch {
      setErrorMessage(t('helpRequest.errors.sendFailed'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t('helpRequest.backAccessibilityLabel')}
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={24}
              tintColor="#737373"
              type="monochrome"
            />
          </Pressable>
          <Text style={styles.title}>{t('helpRequest.title')}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#171717" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.description}>
              {t('helpRequest.description')}
            </Text>

            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
            {!!successMessage && (
              <Text style={styles.success}>{successMessage}</Text>
            )}

            <Text style={styles.sectionLabel}>
              {t('helpRequest.friendsLabel')}
            </Text>
            <View style={styles.friendList}>
              {friends.map((friend) => {
                const isSelected = selectedFriendIds.has(friend.id);

                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    key={friend.id}
                    onPress={() => toggleFriend(friend.id)}
                    style={[
                      styles.friendRow,
                      isSelected && styles.friendRowSelected,
                    ]}
                  >
                    <Image
                      contentFit="cover"
                      source={getProfileIconSource(friend.iconId)}
                      style={styles.friendAvatar}
                    />
                    <Text style={styles.friendName}>{friend.displayName}</Text>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}

              {friends.length === 0 && (
                <Text style={styles.emptyText}>
                  {t('helpRequest.noFriends')}
                </Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>
              {t('helpRequest.messageLabel')}
            </Text>
            <View style={styles.presetRow}>
              {PRESET_MESSAGE_KEYS.map((presetKey) => (
                <Pressable
                  accessibilityRole="button"
                  key={presetKey}
                  onPress={() => applyPreset(presetKey)}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>
                    {t(`helpRequest.presets.${presetKey}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              maxLength={MAX_MESSAGE_LENGTH}
              multiline
              onChangeText={setMessage}
              placeholder={t('helpRequest.messagePlaceholder')}
              placeholderTextColor="#a3a3a3"
              style={styles.textInput}
              value={message}
            />

            <Pressable
              accessibilityRole="button"
              disabled={
                isSending || selectedFriendIds.size === 0 || !message.trim()
              }
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.sendButtonPressed,
                (isSending ||
                  selectedFriendIds.size === 0 ||
                  !message.trim()) &&
                  styles.sendButtonDisabled,
              ]}
            >
              <Text style={styles.sendButtonText}>
                {isSending
                  ? t('helpRequest.sending')
                  : t('helpRequest.sendButton')}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  screen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 61,
    paddingHorizontal: 72,
    paddingVertical: 12,
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    left: 18,
    position: 'absolute',
    width: 44,
  },
  title: {
    color: '#171717',
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingBox: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 48,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  description: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  error: {
    color: '#b42318',
    fontSize: 14,
  },
  success: {
    color: '#067647',
    fontSize: 14,
  },
  sectionLabel: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  friendList: {
    gap: 8,
  },
  friendRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  friendRowSelected: {
    backgroundColor: '#f5f5f5',
    borderColor: '#171717',
  },
  friendAvatar: {
    backgroundColor: '#e5e5e5',
    borderRadius: 18,
    height: 36,
    width: 36,
  },
  friendName: {
    color: '#171717',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#d4d4d4',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxSelected: {
    backgroundColor: '#171717',
    borderColor: '#171717',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyText: {
    color: '#a3a3a3',
    fontSize: 13,
    paddingVertical: 12,
    textAlign: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetChipText: {
    color: '#171717',
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    borderRadius: 12,
    borderWidth: 1,
    color: '#171717',
    fontSize: 15,
    minHeight: 80,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
