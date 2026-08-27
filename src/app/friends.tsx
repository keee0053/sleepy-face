import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/bottom-nav';
import { LoadingButtonContent } from '@/components/loading';
import { FriendListLoadingSkeleton } from '@/components/loading-skeletons';
import { PROFILE_ICON_SOURCES } from '@/constants/profile-icons';
import {
  FriendServiceError,
  acceptFriendRequest,
  declineFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  type FriendProfile,
  type FriendRequest,
} from '@/services/friend';
import { blockUser } from '@/services/moderation';
import {
  listTodayWakeStatuses,
  type FriendWakeStatus,
} from '@/services/wake-status';

// Flip to true locally to use the dev-only debug tools below. Always false in committed code.
const SHOW_DEBUG_TOOLS = false;

function formatWakeStatusText(
  status: FriendWakeStatus,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const outcome =
    status.outcome === 'success'
      ? t('friends.wakeStatus.outcomeSuccess')
      : t('friends.wakeStatus.outcomeFailure');
  const time = formatFiredTime(status.firedAt);

  // requiredQuestionCount is null for a Bad Photo Limit failure (face-check.tsx),
  // which happens before the quiz stage even starts.
  return status.requiredQuestionCount !== null
    ? t('friends.wakeStatus.withCount', {
        count: status.requiredQuestionCount,
        outcome,
        time,
      })
    : t('friends.wakeStatus.withoutCount', { outcome, time });
}

function formatFiredTime(isoDate: string): string {
  const date = new Date(isoDate);

  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function getFriendErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (
    error instanceof FriendServiceError &&
    error.code === 'not_authenticated'
  ) {
    return t('friends.errors.notAuthenticated');
  }

  return t('friends.errors.loadFailed');
}

export default function FriendsScreen() {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [wakeStatusByProfileId, setWakeStatusByProfileId] = useState<
    Map<string, FriendWakeStatus>
  >(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [respondingRelationId, setRespondingRelationId] = useState<
    string | null
  >(null);

  const loadFriends = useCallback(async () => {
    setErrorMessage(null);
    setIsRefreshing(true);

    try {
      const [nextFriends, nextIncomingRequests] = await Promise.all([
        listFriends(),
        listIncomingFriendRequests(),
      ]);

      setFriends(nextFriends);
      setIncomingRequests(nextIncomingRequests);
      setWakeStatusByProfileId(
        await listTodayWakeStatuses(nextFriends.map((friend) => friend.id)),
      );
    } catch (error) {
      setErrorMessage(getFriendErrorMessage(error, t));
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    let isActive = true;

    Promise.all([listFriends(), listIncomingFriendRequests()])
      .then(async ([nextFriends, nextIncomingRequests]) => {
        if (!isActive) {
          return;
        }

        setFriends(nextFriends);
        setIncomingRequests(nextIncomingRequests);
        setWakeStatusByProfileId(
          await listTodayWakeStatuses(nextFriends.map((friend) => friend.id)),
        );
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getFriendErrorMessage(error, t));
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

  const handleAcceptRequest = useCallback(
    async (request: FriendRequest) => {
      setErrorMessage(null);
      setRespondingRelationId(request.relationId);

      try {
        await acceptFriendRequest(request.relationId);
        setIncomingRequests((currentRequests) =>
          currentRequests.filter(
            (currentRequest) =>
              currentRequest.relationId !== request.relationId,
          ),
        );
        setFriends((currentFriends) => [{ ...request }, ...currentFriends]);
      } catch (error) {
        setErrorMessage(getFriendErrorMessage(error, t));
      } finally {
        setRespondingRelationId(null);
      }
    },
    [t],
  );

  const handleDeclineRequest = useCallback(
    async (request: FriendRequest) => {
      setErrorMessage(null);
      setRespondingRelationId(request.relationId);

      try {
        await declineFriendRequest(request.relationId);
        setIncomingRequests((currentRequests) =>
          currentRequests.filter(
            (currentRequest) =>
              currentRequest.relationId !== request.relationId,
          ),
        );
      } catch (error) {
        setErrorMessage(getFriendErrorMessage(error, t));
      } finally {
        setRespondingRelationId(null);
      }
    },
    [t],
  );

  // DEV-ONLY: injects a mock friend card (no Supabase write) so the list layout can be previewed with content. Remove before ship.
  const handleAddMockFriend = useCallback(() => {
    const mockId = `mock-friend-${Date.now()}`;

    setFriends((currentFriends) => [
      {
        createdAt: new Date().toISOString(),
        displayName: t('friends.debug.mockFriendName'),
        iconId: 'old-man',
        id: mockId,
        relationId: mockId,
        userId: `mock_friend_${Date.now()}`,
      },
      ...currentFriends,
    ]);
  }, [t]);

  const handleBlockFriend = useCallback(
    (friend: FriendProfile) => {
      Alert.alert(
        t('friends.blockAlert.title', { name: friend.displayName }),
        t('friends.blockAlert.message'),
        [
          { style: 'cancel', text: t('common.cancel') },
          {
            onPress: () => {
              blockUser(friend.id)
                .then(() => {
                  setFriends((currentFriends) =>
                    currentFriends.filter(
                      (currentFriend) => currentFriend.id !== friend.id,
                    ),
                  );
                })
                .catch(() => {
                  setErrorMessage(t('friends.errors.blockFailed'));
                });
            },
            style: 'destructive',
            text: t('friends.actions.block'),
          },
        ],
      );
    },
    [t],
  );

  const handleFriendMorePress = useCallback(
    (friend: FriendProfile) => {
      Alert.alert('', undefined, [
        {
          onPress: () => handleBlockFriend(friend),
          style: 'destructive',
          text: t('friends.actions.block'),
        },
        { style: 'cancel', text: t('common.cancel') },
      ]);
    },
    [handleBlockFriend, t],
  );

  const renderItem: ListRenderItem<FriendProfile> = ({ item }) => {
    const wakeStatus = wakeStatusByProfileId.get(item.id);

    return (
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

          {wakeStatus ? (
            <Text
              style={
                wakeStatus.outcome === 'success'
                  ? styles.wakeStatusSuccess
                  : styles.wakeStatusFailure
              }
            >
              {formatWakeStatusText(wakeStatus, t)}
            </Text>
          ) : (
            <Text style={styles.wakeStatusPending}>
              {t('friends.wakeStatus.pending')}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityLabel={t('friends.accessibility.moreActions')}
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => handleFriendMorePress(item)}
          style={styles.friendMoreButton}
        >
          <SymbolView
            name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
            size={18}
            tintColor="#8a8a8a"
            type="monochrome"
          />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('friends.title')}</Text>

          {/* DEV-ONLY: no design, just to preview the friend-list UI. Flip SHOW_DEBUG_TOOLS to true locally to use it. */}
          {SHOW_DEBUG_TOOLS && (
            <Pressable accessibilityRole="button" onPress={handleAddMockFriend}>
              <Text style={styles.debugToggleText}>
                {t('friends.debug.addMockFriend')}
              </Text>
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
                  <Text style={styles.emptyTitle}>
                    {t('friends.empty.title')}
                  </Text>
                  <Text style={styles.emptyText}>
                    {t('friends.empty.description')}
                  </Text>
                </View>
              }
              ListHeaderComponent={
                incomingRequests.length > 0 ? (
                  <View style={styles.requestSection}>
                    <Text style={styles.requestSectionTitle}>
                      {t('friends.requests.title')}
                    </Text>

                    {incomingRequests.map((request) => {
                      const isResponding =
                        respondingRelationId === request.relationId;

                      return (
                        <View
                          key={request.relationId}
                          style={styles.requestCard}
                        >
                          <View style={styles.avatar}>
                            <Image
                              contentFit="cover"
                              source={PROFILE_ICON_SOURCES[request.iconId]}
                              style={styles.avatarImage}
                            />
                          </View>

                          <View style={styles.profileText}>
                            <Text style={styles.displayName}>
                              {request.displayName}
                            </Text>
                            <Text style={styles.userId}>@{request.userId}</Text>
                          </View>

                          <View style={styles.requestButtonRow}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={isResponding}
                              onPress={() => handleDeclineRequest(request)}
                              style={({ pressed }) => [
                                styles.declineButton,
                                pressed && styles.buttonPressed,
                                isResponding && styles.buttonDisabled,
                              ]}
                            >
                              <Text style={styles.declineButtonText}>
                                {t('friends.requests.decline')}
                              </Text>
                            </Pressable>

                            <Pressable
                              accessibilityRole="button"
                              disabled={isResponding}
                              onPress={() => handleAcceptRequest(request)}
                              style={({ pressed }) => [
                                styles.acceptButton,
                                pressed && styles.buttonPressed,
                                isResponding && styles.buttonDisabled,
                              ]}
                            >
                              <LoadingButtonContent
                                label={t('friends.requests.accept')}
                                loading={isResponding}
                                loadingLabel=""
                                textStyle={styles.acceptButtonText}
                                tone="light"
                              />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}

                    <Text style={styles.friendListTitle}>
                      {t('friends.title')}
                    </Text>
                  </View>
                ) : null
              }
              onRefresh={loadFriends}
              refreshing={isRefreshing}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <Pressable
          accessibilityLabel={t('friends.accessibility.helpRequest')}
          accessibilityRole="button"
          onPress={() => router.push('/help-request')}
          style={({ pressed }) => [
            styles.helpRequestFab,
            pressed && styles.fabPressed,
          ]}
        >
          <SymbolView
            name={{
              ios: 'hand.raised.fill',
              android: 'front_hand',
              web: 'front_hand',
            }}
            size={22}
            tintColor="#ffffff"
            type="monochrome"
          />
        </Pressable>

        <Pressable
          accessibilityLabel={t('friends.accessibility.addFriend')}
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
  friendMoreButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
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
  requestSection: {
    gap: 10,
    marginBottom: 10,
  },
  requestSectionTitle: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '800',
  },
  requestCard: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    padding: 12,
  },
  requestButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  declineButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 56,
    paddingHorizontal: 10,
  },
  declineButtonText: {
    color: '#171717',
    fontSize: 13,
    fontWeight: '700',
  },
  acceptButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 56,
    paddingHorizontal: 10,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  friendListTitle: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
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
  wakeStatusSuccess: {
    color: '#067647',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  wakeStatusFailure: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  wakeStatusPending: {
    color: '#a3a3a3',
    fontSize: 12,
    marginTop: 4,
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
  helpRequestFab: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 26,
    bottom: 154,
    elevation: 8,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 26,
    width: 52,
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
