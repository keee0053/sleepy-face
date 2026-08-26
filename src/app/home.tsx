import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/bottom-nav';
import { CommentBubbleIcon } from '@/components/comment-bubble-icon';
import { FeedLoadingSkeleton } from '@/components/loading-skeletons';
import { ReactionButton } from '@/components/reaction-button';
import { getProfileIconSource } from '@/constants/profile-icons';
import { getDevMode, setDevMode } from '@/services/dev-mode';
import {
  clearFriendsFeedAccessBlock,
  getFriendsFeedAccessState,
  recordFailureAccessOutcome,
  type FriendsFeedAccessState,
} from '@/services/friends-feed-access';
import {
  HomeFeedServiceError,
  listFriendsFeed,
  type FriendsFeedItem,
} from '@/services/home-feed';
import {
  listPhotoReactions,
  REACTION_EMOJIS,
  removePhotoReaction,
  setPhotoReaction,
  type PhotoReactionDetail,
  type ReactionEmoji,
} from '@/services/photo-reactions';
import { registerPushToken } from '@/services/push-token';

function getHomeFeedErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof HomeFeedServiceError) {
    switch (error.code) {
      case 'not_authenticated':
        return t('home.errors.notAuthenticated');
      case 'unexpected_error':
        return t('home.errors.loadFailed');
    }
  }

  return t('home.errors.loadFailed');
}

function formatFeedDate(
  isoDate: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const date = new Date(isoDate);

  return t('home.feedDate', {
    day: date.getDate(),
    month: date.getMonth() + 1,
  });
}

type HomeData = {
  accessState: FriendsFeedAccessState;
  feed: FriendsFeedItem[];
};

async function fetchHomeData(): Promise<HomeData> {
  const accessState = await getFriendsFeedAccessState();
  const feed = accessState === 'allowed' ? await listFriendsFeed() : [];

  return { accessState, feed };
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const [accessState, setAccessState] = useState<FriendsFeedAccessState | null>(
    null,
  );
  const [feed, setFeed] = useState<FriendsFeedItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);
  // A pure in-flight guard for handleToggleReaction — never read by JSX/styles, so a
  // ref avoids an extra re-render on every reaction tap that useState would cause.
  const pendingReactionPhotoIds = useRef<Set<string>>(new Set());
  const [reactionListPhotoId, setReactionListPhotoId] = useState<string | null>(
    null,
  );
  const [reactionListDetails, setReactionListDetails] = useState<
    PhotoReactionDetail[]
  >([]);
  const [isLoadingReactionListDetails, setIsLoadingReactionListDetails] =
    useState(false);

  useEffect(() => {
    let isActive = true;

    getDevMode().then((devMode) => {
      if (isActive) {
        setIsDevMode(devMode);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    // Best-effort: a failed/denied push token registration must never block or error the
    // Home screen, since the Friends Feed is the fallback delivery path either way.
    registerPushToken().catch((error: unknown) => {
      console.warn('[home] push token registration failed', error);
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    fetchHomeData()
      .then((data) => {
        if (isActive) {
          setAccessState(data.accessState);
          setFeed(data.feed);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getHomeFeedErrorMessage(error, t));
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

  const handleRefresh = useCallback(async () => {
    setErrorMessage(null);
    setIsRefreshing(true);

    try {
      const data = await fetchHomeData();

      setAccessState(data.accessState);
      setFeed(data.feed);
    } catch (error) {
      setErrorMessage(getHomeFeedErrorMessage(error, t));
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  const applyReactionState = useCallback(
    (photoId: string, viewerReactionEmoji: ReactionEmoji | null) => {
      setFeed((currentFeed) =>
        currentFeed.map((item) => {
          if (item.photoId !== photoId) {
            return item;
          }

          const previousEmoji = item.viewerReactionEmoji;
          const hadReaction = previousEmoji !== null;
          const hasReaction = viewerReactionEmoji !== null;

          let reactionGroups = item.reactionGroups;

          if (previousEmoji !== viewerReactionEmoji) {
            const countByEmoji = new Map(
              reactionGroups.map((group) => [group.emoji, group.count]),
            );

            if (previousEmoji) {
              const nextCount = (countByEmoji.get(previousEmoji) ?? 1) - 1;

              if (nextCount <= 0) {
                countByEmoji.delete(previousEmoji);
              } else {
                countByEmoji.set(previousEmoji, nextCount);
              }
            }

            if (viewerReactionEmoji) {
              countByEmoji.set(
                viewerReactionEmoji,
                (countByEmoji.get(viewerReactionEmoji) ?? 0) + 1,
              );
            }

            reactionGroups = REACTION_EMOJIS.filter((emoji) =>
              countByEmoji.has(emoji),
            ).map((emoji) => ({ count: countByEmoji.get(emoji)!, emoji }));
          }

          return {
            ...item,
            reactionCount:
              item.reactionCount + Number(hasReaction) - Number(hadReaction),
            reactionGroups,
            viewerReactionEmoji,
          };
        }),
      );
    },
    [],
  );

  const handleShowReactionList = useCallback(
    (photoId: string) => {
      setReactionListPhotoId(photoId);
      setIsLoadingReactionListDetails(true);

      listPhotoReactions(photoId)
        .then(setReactionListDetails)
        .catch(() => {
          setErrorMessage(t('home.errors.reactionListLoadFailed'));
        })
        .finally(() => {
          setIsLoadingReactionListDetails(false);
        });
    },
    [t],
  );

  const handleSelectReaction = useCallback(
    async (item: FriendsFeedItem, emoji: ReactionEmoji) => {
      // A photo already has a change in flight — ignore the tap rather than let a
      // second request race the first and leave the feed out of sync.
      if (pendingReactionPhotoIds.current.has(item.photoId)) {
        return;
      }

      const previousEmoji = item.viewerReactionEmoji;

      pendingReactionPhotoIds.current.add(item.photoId);

      // Optimistic: the feed should feel instant, and a failure reverts to the exact
      // prior state rather than a fresh refetch.
      applyReactionState(item.photoId, emoji);

      try {
        await setPhotoReaction(item.photoId, emoji);
      } catch {
        applyReactionState(item.photoId, previousEmoji);
      } finally {
        pendingReactionPhotoIds.current.delete(item.photoId);
      }
    },
    [applyReactionState],
  );

  const handleRemoveReaction = useCallback(
    async (item: FriendsFeedItem) => {
      if (pendingReactionPhotoIds.current.has(item.photoId)) {
        return;
      }

      const previousEmoji = item.viewerReactionEmoji;

      pendingReactionPhotoIds.current.add(item.photoId);
      applyReactionState(item.photoId, null);

      try {
        await removePhotoReaction(item.photoId);
      } catch {
        applyReactionState(item.photoId, previousEmoji);
      } finally {
        pendingReactionPhotoIds.current.delete(item.photoId);
      }
    },
    [applyReactionState],
  );

  const navigateToPhotoDetail = useCallback((item: FriendsFeedItem) => {
    router.push({
      params: {
        createdAt: item.createdAt,
        displayName: item.displayName,
        iconId: item.iconId,
        imageUrl: item.imageUrl,
        photoId: item.photoId,
        profileId: item.profileId,
      },
      pathname: '/photo-detail',
    });
  }, []);

  const handleExitDevMode = useCallback(async () => {
    await setDevMode(false);
    setIsDevMode(false);
  }, []);

  // DEV-ONLY: lets us preview the blocked-state UI without a real Challenge Failure.
  const handleToggleDebugBlock = useCallback(async () => {
    if (accessState === 'blocked') {
      await clearFriendsFeedAccessBlock();
    } else {
      await recordFailureAccessOutcome('app-quit');
    }

    await handleRefresh();
  }, [accessState, handleRefresh]);

  const renderItem: ListRenderItem<FriendsFeedItem> = ({ item }) => (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigateToPhotoDetail(item)}
      >
        <View style={styles.feedCardHeader}>
          <View style={styles.avatar}>
            <Image
              contentFit="cover"
              source={getProfileIconSource(item.iconId)}
              style={styles.avatarImage}
            />
          </View>

          <View style={styles.feedCardHeaderText}>
            <Text style={styles.displayName}>{item.displayName}</Text>
            <Text style={styles.feedDate}>
              {formatFeedDate(item.createdAt, t)}
            </Text>
          </View>
        </View>

        <Image
          contentFit="cover"
          source={{ uri: item.imageUrl }}
          style={styles.feedPhoto}
        />
      </Pressable>

      <View style={styles.reactionRow}>
        <ReactionButton
          count={item.reactionCount}
          // Resets the button's own open/closed picker state whenever the reaction
          // actually changes, so it can never linger open after a pick or a removal.
          key={item.viewerReactionEmoji ?? 'none'}
          onRemoveEmoji={() => handleRemoveReaction(item)}
          onSelectEmoji={(emoji) => handleSelectReaction(item, emoji)}
          viewerEmoji={item.viewerReactionEmoji}
        />

        {item.reactionGroups.length > 0 && (
          <Pressable
            accessibilityLabel={t('home.accessibility.viewReactors')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => handleShowReactionList(item.photoId)}
            style={styles.otherReactionsRow}
          >
            {item.reactionGroups.map(({ count, emoji }) => (
              <View key={emoji} style={styles.otherReactionPill}>
                <Text style={styles.otherReactionEmoji}>{emoji}</Text>
                <Text style={styles.otherReactionCount}>{count}</Text>
              </View>
            ))}
          </Pressable>
        )}

        <Pressable
          accessibilityLabel={t('home.accessibility.viewComments')}
          accessibilityRole="button"
          onPress={() => navigateToPhotoDetail(item)}
          style={({ pressed }) => [
            styles.commentButton,
            pressed && styles.reactionButtonPressed,
          ]}
        >
          <CommentBubbleIcon color="#737373" size={18} />
          <Text style={styles.commentCount}>{item.commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('home.title')}</Text>

          {isDevMode && (
            <View style={styles.debugButtonRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleToggleDebugBlock}
              >
                <Text style={styles.debugToggleText}>
                  {accessState === 'blocked'
                    ? t('home.debug.unblock')
                    : t('home.debug.block')}
                </Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={handleExitDevMode}>
                <Text style={styles.debugToggleText}>
                  {t('home.debug.exit')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {isLoading ? (
            <FeedLoadingSkeleton />
          ) : accessState === 'blocked' ? (
            <ScrollView
              contentContainerStyle={styles.blockedScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.blockedBox}>
                <Text style={styles.blockedTitle}>
                  {t('home.blocked.title')}
                </Text>
                <Text style={styles.blockedText}>
                  {t('home.blocked.description')}
                </Text>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              contentContainerStyle={styles.feedList}
              data={feed}
              keyExtractor={(item) => item.photoId}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>{t('home.empty.title')}</Text>
                  <Text style={styles.emptyText}>
                    {t('home.empty.description')}
                  </Text>
                </View>
              }
              onRefresh={handleRefresh}
              refreshing={isRefreshing}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <Pressable
          accessibilityLabel={t('home.accessibility.wakeFriends')}
          accessibilityRole="button"
          onPress={() => router.push('/wake-friends')}
          style={({ pressed }) => [
            styles.wakeFriendsFab,
            pressed && styles.wakeFriendsFabPressed,
          ]}
        >
          <SymbolView
            name={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }}
            size={28}
            tintColor="#ffffff"
            type="monochrome"
          />
        </Pressable>

        <BottomNav activeRoute="/home" />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setReactionListPhotoId(null)}
        transparent
        visible={reactionListPhotoId !== null}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.reactionListSheet}>
            <View style={styles.reactionListHeader}>
              <Text style={styles.reactionListTitle}>
                {t('home.reactionModal.title')}
              </Text>
              <Pressable
                accessibilityLabel={t('home.accessibility.close')}
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => setReactionListPhotoId(null)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </Pressable>
            </View>

            {isLoadingReactionListDetails ? (
              <ActivityIndicator
                color="#171717"
                style={styles.reactionListLoading}
              />
            ) : (
              <FlatList
                data={reactionListDetails}
                keyExtractor={(item) => item.profileId}
                renderItem={({ item }) => (
                  <View style={styles.reactorRow}>
                    <View style={styles.reactorAvatar}>
                      <Image
                        contentFit="cover"
                        source={getProfileIconSource(item.iconId)}
                        style={styles.reactorAvatarImage}
                      />
                    </View>
                    <Text style={styles.reactorName}>
                      {item.isOwn
                        ? t('home.reactionModal.self')
                        : item.displayName}
                    </Text>
                    <Text style={styles.reactorEmoji}>{item.emoji}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
    fontFamily: 'NotoSansJP_700Bold',
  },
  debugButtonRow: {
    flexDirection: 'row',
    gap: 14,
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
  blockedScrollContent: {
    flexGrow: 1,
    paddingBottom: 116,
  },
  blockedBox: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  blockedTitle: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  blockedText: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  feedList: {
    gap: 16,
    paddingBottom: 116,
  },
  feedCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 10,
  },
  feedCardHeaderText: {
    flex: 1,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  displayName: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'NoteSansJP_700Bold',
  },
  feedDate: {
    color: '#737373',
    fontSize: 13,
  },
  feedPhoto: {
    aspectRatio: 1,
    backgroundColor: '#e5e5e5',
    borderRadius: 16,
    width: '100%',
  },
  reactionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  reactionButtonPressed: {
    opacity: 0.7,
  },
  otherReactionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  otherReactionPill: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  otherReactionEmoji: {
    fontSize: 13,
  },
  otherReactionCount: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '700',
  },
  commentButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  commentCount: {
    color: '#737373',
    fontSize: 13,
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
  wakeFriendsFab: {
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
  wakeFriendsFabPressed: {
    opacity: 0.78,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCloseButtonText: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '800',
  },
  reactionListSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '70%',
    paddingBottom: 12,
    paddingTop: 16,
    width: '100%',
  },
  reactionListHeader: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  reactionListTitle: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '800',
  },
  reactionListLoading: {
    paddingVertical: 24,
  },
  reactorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  reactorAvatar: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 32,
  },
  reactorAvatarImage: {
    height: '100%',
    width: '100%',
  },
  reactorName: {
    color: '#171717',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  reactorEmoji: {
    fontSize: 18,
  },
});
