import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
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
  addPhotoReaction,
  removePhotoReaction,
} from '@/services/photo-reactions';
import { registerPushToken } from '@/services/push-token';

function getHomeFeedErrorMessage(error: unknown): string {
  if (error instanceof HomeFeedServiceError) {
    switch (error.code) {
      case 'not_authenticated':
        return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
      case 'unexpected_error':
        return 'フィードを読み込めませんでした。もう一度お試しください。';
    }
  }

  return 'フィードを読み込めませんでした。もう一度お試しください。';
}

function formatFeedDate(isoDate: string): string {
  const date = new Date(isoDate);

  return `${date.getMonth() + 1}月${date.getDate()}日`;
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
          setErrorMessage(getHomeFeedErrorMessage(error));
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
  }, []);

  const handleRefresh = useCallback(async () => {
    setErrorMessage(null);
    setIsRefreshing(true);

    try {
      const data = await fetchHomeData();

      setAccessState(data.accessState);
      setFeed(data.feed);
    } catch (error) {
      setErrorMessage(getHomeFeedErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const applyReactionState = useCallback(
    (photoId: string, hasReacted: boolean) => {
      setFeed((currentFeed) =>
        currentFeed.map((item) =>
          item.photoId === photoId
            ? {
                ...item,
                reactionCount: item.reactionCount + (hasReacted ? 1 : -1),
                viewerHasReacted: hasReacted,
              }
            : item,
        ),
      );
    },
    [],
  );

  const handleToggleReaction = useCallback(
    async (item: FriendsFeedItem) => {
      // A photo already has a toggle in flight — ignore the tap rather than let a
      // second add/remove request race the first and leave the feed out of sync.
      if (pendingReactionPhotoIds.current.has(item.photoId)) {
        return;
      }

      const nextHasReacted = !item.viewerHasReacted;

      pendingReactionPhotoIds.current.add(item.photoId);

      // Optimistic: the feed should feel instant, and a failure reverts to the exact
      // prior state rather than a fresh refetch.
      applyReactionState(item.photoId, nextHasReacted);

      try {
        if (nextHasReacted) {
          await addPhotoReaction(item.photoId);
        } else {
          await removePhotoReaction(item.photoId);
        }
      } catch {
        applyReactionState(item.photoId, item.viewerHasReacted);
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
        reactionCount: String(item.reactionCount),
        viewerHasReacted: String(item.viewerHasReacted),
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
              {formatFeedDate(item.createdAt)}
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
        <Pressable
          accessibilityLabel="😂でリアクションする"
          accessibilityRole="button"
          accessibilityState={{ selected: item.viewerHasReacted }}
          onPress={() => handleToggleReaction(item)}
          style={({ pressed }) => [
            styles.reactionButton,
            item.viewerHasReacted && styles.reactionButtonActive,
            pressed && styles.reactionButtonPressed,
          ]}
        >
          <Text style={styles.reactionEmoji}>😂</Text>
          <Text
            style={[
              styles.reactionCount,
              item.viewerHasReacted && styles.reactionCountActive,
            ]}
          >
            {item.reactionCount}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel="コメントを見る"
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
          <Text style={styles.title}>ホーム</Text>

          {isDevMode && (
            <View style={styles.debugButtonRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleToggleDebugBlock}
              >
                <Text style={styles.debugToggleText}>
                  [DEV] {accessState === 'blocked' ? '解除' : 'ブロック'}
                </Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={handleExitDevMode}>
                <Text style={styles.debugToggleText}>[DEV] 終了</Text>
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
                  今日はフィードを見られません
                </Text>
                <Text style={styles.blockedText}>
                  写真を残せなかったため、今日はフレンドのフィードを見られません。次のアラームで成功すると、また見られるようになります。
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
                  <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
                  <Text style={styles.emptyText}>
                    友達を追加すると、ここにフィードが表示されます。
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

        <BottomNav activeRoute="/home" />
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
    flexDirection: 'row',
    paddingTop: 10,
  },
  reactionButton: {
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
  reactionButtonActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#fb923c',
  },
  reactionButtonPressed: {
    opacity: 0.7,
  },
  reactionEmoji: {
    fontSize: 15,
  },
  reactionCount: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '700',
  },
  reactionCountActive: {
    color: '#c2410c',
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
});
