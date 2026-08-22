import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentBubbleIcon } from '@/components/comment-bubble-icon';
import { getProfileIconSource } from '@/constants/profile-icons';
import {
  CommentServiceError,
  addComment,
  listComments,
  type Comment,
} from '@/services/comments';
import {
  addPhotoReaction,
  removePhotoReaction,
} from '@/services/photo-reactions';

function formatPostDate(isoDate: string): string {
  const date = new Date(isoDate);

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function formatCommentTime(isoDate: string): string {
  const date = new Date(isoDate);

  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function getCommentErrorMessage(error: unknown): string {
  if (error instanceof CommentServiceError) {
    switch (error.code) {
      case 'comment_required':
        return 'コメントを入力してください。';
      case 'not_authenticated':
        return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
      case 'unexpected_error':
        return 'コメントを送信できませんでした。もう一度お試しください。';
    }
  }

  return 'コメントを送信できませんでした。もう一度お試しください。';
}

export default function PhotoDetailScreen() {
  const params = useLocalSearchParams<{
    photoId: string;
    profileId: string;
    displayName: string;
    iconId: string;
    imageUrl: string;
    createdAt: string;
    reactionCount: string;
    viewerHasReacted: string;
  }>();

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reactionCount, setReactionCount] = useState(
    Number(params.reactionCount) || 0,
  );
  const [viewerHasReacted, setViewerHasReacted] = useState(
    params.viewerHasReacted === 'true',
  );
  const isReactionPending = useRef(false);

  useEffect(() => {
    let isActive = true;

    listComments(params.photoId)
      .then((nextComments) => {
        if (isActive) {
          setComments(nextComments);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getCommentErrorMessage(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingComments(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [params.photoId]);

  const handleToggleReaction = useCallback(async () => {
    if (isReactionPending.current) {
      return;
    }

    const nextHasReacted = !viewerHasReacted;

    isReactionPending.current = true;
    setViewerHasReacted(nextHasReacted);
    setReactionCount((count) => count + (nextHasReacted ? 1 : -1));

    try {
      if (nextHasReacted) {
        await addPhotoReaction(params.photoId);
      } else {
        await removePhotoReaction(params.photoId);
      }
    } catch {
      setViewerHasReacted(!nextHasReacted);
      setReactionCount((count) => count + (nextHasReacted ? -1 : 1));
    } finally {
      isReactionPending.current = false;
    }
  }, [params.photoId, viewerHasReacted]);

  const handleSendComment = useCallback(async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const nextComment = await addComment(params.photoId, commentText);

      setComments((currentComments) => [...currentComments, nextComment]);
      setCommentText('');
    } catch (error) {
      setErrorMessage(getCommentErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [commentText, params.photoId]);

  const renderComment: ListRenderItem<Comment> = ({ item }) => (
    <View style={styles.commentRow}>
      <View style={styles.commentAvatar}>
        <Image
          contentFit="cover"
          source={getProfileIconSource(item.iconId)}
          style={styles.commentAvatarImage}
        />
      </View>

      <View style={styles.commentBody}>
        <View style={styles.commentHeaderRow}>
          <Text style={styles.commentAuthor}>
            {item.isOwn ? '自分' : item.displayName}
          </Text>
          <Text style={styles.commentTime}>
            {formatCommentTime(item.createdAt)}
          </Text>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="戻る"
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
          <Text style={styles.title}>投稿</Text>
        </View>

        <FlatList
          contentContainerStyle={styles.scrollContent}
          data={comments}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            !isLoadingComments ? (
              <View style={styles.emptyBox}>
                <CommentBubbleIcon color="#a3a3a3" size={28} />
                <Text style={styles.emptyText}>最初のコメントを送ろう</Text>
              </View>
            ) : null
          }
          ListHeaderComponent={
            <View>
              <View style={styles.postHeader}>
                <View style={styles.avatar}>
                  <Image
                    contentFit="cover"
                    source={getProfileIconSource(params.iconId)}
                    style={styles.avatarImage}
                  />
                </View>

                <View style={styles.postHeaderText}>
                  <Text style={styles.displayName}>{params.displayName}</Text>
                  <Text style={styles.postDate}>
                    {formatPostDate(params.createdAt)}
                  </Text>
                </View>
              </View>

              <Image
                contentFit="cover"
                source={{ uri: params.imageUrl }}
                style={styles.photo}
              />

              <View style={styles.reactionRow}>
                <Pressable
                  accessibilityLabel="😂でリアクションする"
                  accessibilityRole="button"
                  accessibilityState={{ selected: viewerHasReacted }}
                  onPress={handleToggleReaction}
                  style={({ pressed }) => [
                    styles.reactionButton,
                    pressed && styles.reactionButtonPressed,
                  ]}
                >
                  <Text style={styles.reactionEmoji}>😂</Text>
                  <Text style={styles.reactionCount}>{reactionCount}</Text>
                </Pressable>

                <View style={styles.commentCountBadge}>
                  <CommentBubbleIcon color="#737373" size={20} />
                  <Text style={styles.commentCountText}>{comments.length}</Text>
                </View>
              </View>

              {isLoadingComments && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#171717" />
                </View>
              )}
            </View>
          }
          renderItem={renderComment}
          showsVerticalScrollIndicator={false}
        />

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <View style={styles.inputRow}>
          <TextInput
            editable={!isSubmitting}
            onChangeText={setCommentText}
            placeholder="コメントを入力"
            placeholderTextColor="#a3a3a3"
            style={styles.input}
            value={commentText}
          />

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || commentText.trim().length === 0}
            onPress={handleSendComment}
            style={({ pressed }) => [
              styles.sendButton,
              (pressed || isSubmitting || commentText.trim().length === 0) &&
                styles.sendButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#171717" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>送信</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 61,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    left: 12,
    position: 'absolute',
    width: 44,
  },
  title: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '800',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  postHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
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
  postHeaderText: {
    flex: 1,
  },
  displayName: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
  },
  postDate: {
    color: '#737373',
    fontSize: 13,
  },
  photo: {
    aspectRatio: 1,
    backgroundColor: '#e5e5e5',
    marginTop: 12,
    width: '100%',
  },
  reactionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  reactionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  reactionButtonPressed: {
    opacity: 0.6,
  },
  reactionEmoji: {
    fontSize: 20,
  },
  reactionCount: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
  },
  commentCountBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  commentCountText: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 20,
  },
  emptyBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  emptyText: {
    color: '#737373',
    fontSize: 14,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  commentAvatar: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 32,
  },
  commentAvatarImage: {
    height: '100%',
    width: '100%',
  },
  commentBody: {
    flex: 1,
  },
  commentHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  commentAuthor: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '800',
  },
  commentTime: {
    color: '#a3a3a3',
    fontSize: 12,
  },
  commentContent: {
    color: '#171717',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  errorText: {
    color: '#b42318',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    textAlign: 'center',
  },
  inputRow: {
    alignItems: 'center',
    borderTopColor: '#f5f5f5',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: {
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 20,
    borderWidth: 1,
    color: '#171717',
    flex: 1,
    fontSize: 14,
    minHeight: 40,
    paddingHorizontal: 16,
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 44,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
  },
});
