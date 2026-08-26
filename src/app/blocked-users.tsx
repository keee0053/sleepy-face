import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getProfileIconSource } from '@/constants/profile-icons';
import {
  listBlockedProfiles,
  unblockUser,
  type BlockedProfile,
} from '@/services/moderation';

export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unblockingProfileId, setUnblockingProfileId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let isActive = true;

    listBlockedProfiles()
      .then((profiles) => {
        if (isActive) {
          setBlockedProfiles(profiles);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage(t('blockedUsers.errors.loadFailed'));
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

  const handleUnblock = useCallback(
    async (profile: BlockedProfile) => {
      setErrorMessage(null);
      setUnblockingProfileId(profile.id);

      try {
        await unblockUser(profile.id);
        setBlockedProfiles((current) =>
          current.filter((item) => item.id !== profile.id),
        );
      } catch {
        setErrorMessage(t('blockedUsers.errors.unblockFailed'));
      } finally {
        setUnblockingProfileId(null);
      }
    },
    [t],
  );

  const renderItem: ListRenderItem<BlockedProfile> = ({ item }) => {
    const isUnblocking = unblockingProfileId === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Image
            contentFit="cover"
            source={getProfileIconSource(item.iconId)}
            style={styles.avatarImage}
          />
        </View>

        <View style={styles.profileText}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.userId}>@{item.userId}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isUnblocking}
          onPress={() => handleUnblock(item)}
          style={({ pressed }) => [
            styles.unblockButton,
            pressed && styles.buttonPressed,
            isUnblocking && styles.buttonDisabled,
          ]}
        >
          {isUnblocking ? (
            <ActivityIndicator color="#171717" size="small" />
          ) : (
            <Text style={styles.unblockButtonText}>
              {t('blockedUsers.unblockButton')}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <SymbolView
            name={{
              ios: 'chevron.left',
              android: 'arrow_back',
              web: 'arrow_back',
            }}
            size={22}
            tintColor="#171717"
            type="monochrome"
          />
        </Pressable>
        <Text style={styles.title}>{t('blockedUsers.title')}</Text>
      </View>

      <View style={styles.content}>
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        {isLoading ? (
          <ActivityIndicator color="#171717" style={styles.loadingIndicator} />
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={blockedProfiles}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>{t('blockedUsers.empty')}</Text>
              </View>
            }
            renderItem={renderItem}
          />
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  avatar: {
    borderRadius: 24,
    height: 48,
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '700',
  },
  userId: {
    color: '#8a8a8a',
    fontSize: 13,
  },
  unblockButton: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  unblockButtonText: {
    color: '#171717',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#8a8a8a',
    fontSize: 14,
  },
});
