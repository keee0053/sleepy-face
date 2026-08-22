import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/bottom-nav';
import { FriendListLoadingSkeleton } from '@/components/loading-skeletons';
import { PROFILE_ICON_SOURCES } from '@/constants/profile-icons';
import { getDevMode } from '@/services/dev-mode';
import {
  activateAlarm,
  listUnconsumedFailureLogEntries,
} from '@/services/failure-log';
import {
  FriendServiceError,
  listFriends,
  type FriendProfile,
} from '@/services/friend';

// Flip to true locally to use the dev-only debug tools below. Always false in committed code.
const SHOW_DEBUG_TOOLS = false;

function getFriendErrorMessage(error: unknown): string {
  if (
    error instanceof FriendServiceError &&
    error.code === 'not_authenticated'
  ) {
    return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
  }

  return '友達情報を取得できませんでした。もう一度お試しください。';
}

export default function FriendsScreen() {
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);
  // Dev-only Alarm Activation gating: which Friends currently have an unconsumed
  // Failure Log Entry today, and which entry id to activate. No product UI/permission
  // model beyond isDevMode -- see docs/remote-alarm-activation.
  const [unconsumedEntryIdByFriendId, setUnconsumedEntryIdByFriendId] =
    useState<Map<string, string>>(new Map());
  const [activatingFriendId, setActivatingFriendId] = useState<string | null>(
    null,
  );

  const loadFriendsAndFailures = useCallback(async () => {
    const nextFriends = await listFriends();
    const entries = await listUnconsumedFailureLogEntries(
      nextFriends.map((friend) => friend.id),
    );

    return {
      friends: nextFriends,
      unconsumedEntryIdByFriendId: new Map(
        entries.map((entry) => [entry.profileId, entry.id]),
      ),
    };
  }, []);

  const loadFriends = useCallback(async () => {
    setErrorMessage(null);
    setIsRefreshing(true);

    try {
      const result = await loadFriendsAndFailures();
      setFriends(result.friends);
      setUnconsumedEntryIdByFriendId(result.unconsumedEntryIdByFriendId);
    } catch (error) {
      setErrorMessage(getFriendErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [loadFriendsAndFailures]);

  useEffect(() => {
    let isActive = true;

    getDevMode().then((devMode) => {
      if (isActive) {
        setIsDevMode(devMode);
      }
    });

    loadFriendsAndFailures()
      .then((result) => {
        if (isActive) {
          setFriends(result.friends);
          setUnconsumedEntryIdByFriendId(result.unconsumedEntryIdByFriendId);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getFriendErrorMessage(error));
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
  }, [loadFriendsAndFailures]);

  // DEV-ONLY: activates a Friend's alarm off their current unconsumed Failure Log
  // Entry. No confirmation UI -- see docs/remote-alarm-activation.
  const handleActivateAlarm = useCallback(
    async (friendId: string) => {
      const entryId = unconsumedEntryIdByFriendId.get(friendId);

      if (!entryId) {
        return;
      }

      setActivatingFriendId(friendId);
      setErrorMessage(null);

      try {
        await activateAlarm(entryId);
        await loadFriends();
      } catch (error) {
        setErrorMessage(getFriendErrorMessage(error));
      } finally {
        setActivatingFriendId(null);
      }
    },
    [loadFriends, unconsumedEntryIdByFriendId],
  );

  // DEV-ONLY: injects a mock friend card (no Supabase write) so the list layout can be previewed with content. Remove before ship.
  const handleAddMockFriend = useCallback(() => {
    const mockId = `mock-friend-${Date.now()}`;

    setFriends((currentFriends) => [
      {
        createdAt: new Date().toISOString(),
        displayName: 'モック友達',
        iconId: 'old-man',
        id: mockId,
        relationId: mockId,
        userId: `mock_friend_${Date.now()}`,
      },
      ...currentFriends,
    ]);
  }, []);

  const renderItem: ListRenderItem<FriendProfile> = ({ item }) => (
    <View style={styles.friendCard}>
      <View style={styles.avatar}>
        <Image
          contentFit="cover"
          source={PROFILE_ICON_SOURCES[item.iconId]}
          style={styles.avatarImage}
        />
      </View>

      <View style={styles.profileText}>
        <Text style={styles.displayName}>{item.displayName}</Text>
        <Text style={styles.userId}>@{item.userId}</Text>
      </View>

      {/* DEV-ONLY: Alarm Activation, gated by isDevMode. No production design -- see
          docs/remote-alarm-activation. */}
      {isDevMode && unconsumedEntryIdByFriendId.has(item.id) && (
        <Pressable
          accessibilityRole="button"
          disabled={activatingFriendId === item.id}
          onPress={() => handleActivateAlarm(item.id)}
          style={({ pressed }) => [
            styles.devActivateButton,
            (pressed || activatingFriendId === item.id) &&
              styles.devActivateButtonPressed,
          ]}
        >
          <Text style={styles.devActivateButtonText}>
            {activatingFriendId === item.id ? '...' : '[DEV] Activate'}
          </Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>友達</Text>

          {/* DEV-ONLY: no design, just to preview the friend-list UI. Flip SHOW_DEBUG_TOOLS to true locally to use it. */}
          {SHOW_DEBUG_TOOLS && (
            <Pressable accessibilityRole="button" onPress={handleAddMockFriend}>
              <Text style={styles.debugToggleText}>[DEBUG] +友達</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.content}>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {isLoading ? (
            <FriendListLoadingSkeleton />
          ) : (
            <FlatList
              contentContainerStyle={styles.friendList}
              data={friends}
              keyExtractor={(item) => item.relationId}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>まだ友達がいません</Text>
                  <Text style={styles.emptyText}>
                    右下のプラスボタンから友達を追加できます。
                  </Text>
                </View>
              }
              onRefresh={loadFriends}
              refreshing={isRefreshing}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <Pressable
          accessibilityLabel="友達を追加"
          accessibilityRole="button"
          onPress={() => router.push('/add-friend')}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>

        <BottomNav activeRoute="/friends" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 61,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  title: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '800',
  },
  debugToggleText: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  friendList: {
    gap: 10,
    paddingBottom: 116,
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#f5f5f5',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    padding: 12,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  profileText: {
    flex: 1,
  },
  displayName: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  userId: {
    color: '#737373',
    fontSize: 13,
  },
  devActivateButton: {
    backgroundColor: '#b42318',
    borderRadius: 10,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  devActivateButtonPressed: {
    opacity: 0.7,
  },
  devActivateButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyTitle: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 28,
    bottom: 88,
    elevation: 8,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    width: 56,
    zIndex: 20,
  },
  fabPressed: {
    opacity: 0.78,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 40,
    marginTop: -2,
  },
});
