import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { ReactionButton } from '@/components/reaction-button';
import { getProfileIconSource } from '@/constants/profile-icons';
import { getCurrentUserId } from '@/services/auth';
import {
  CommentServiceError,
  addComment,
  deleteComment,
  listComments,
  type Comment,
} from '@/services/comments';
import {
  blockUser,
  reportContent,
  type ReportReason,
} from '@/services/moderation';
import { deleteMyFailurePhoto } from '@/services/profile-photos';
import {
  listPhotoReactions,
  REACTION_EMOJIS,
  removePhotoReaction,
  setPhotoReaction,
  type PhotoReactionDetail,
  type ReactionEmoji,
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

type ReplyTarget = {
  // The top-level comment id a reply is filed under -- replying to a reply threads it
  // under that reply's own parent, so a thread never nests more than one level deep.
  parentCommentId: string;
  displayName: string;
};

// Flattens comments into a display order where each top-level comment is immediately
// followed by its own replies (oldest first), regardless of how their timestamps
// interleave with other threads' replies.
function orderCommentsWithReplies(comments: Comment[]): Comment[] {
  const repliesByParentId = new Map<string, Comment[]>();

  for (const comment of comments) {
    if (!comment.parentCommentId) {
      continue;
    }

    const replies = repliesByParentId.get(comment.parentCommentId) ?? [];
    replies.push(comment);
    repliesByParentId.set(comment.parentCommentId, replies);
  }

  return comments
    .filter((comment) => !comment.parentCommentId)
    .flatMap((topLevelComment) => [
      topLevelComment,
      ...(repliesByParentId.get(topLevelComment.id) ?? []),
    ]);
}

function getCommentErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof CommentServiceError) {
    switch (error.code) {
      case 'comment_required':
        return t('photoDetail.errors.commentRequired');
      case 'not_authenticated':
        return t('photoDetail.errors.notAuthenticated');
      case 'unexpected_error':
        return t('photoDetail.errors.commentSendFailed');
    }
  }

  return t('photoDetail.errors.commentSendFailed');
}

export default function PhotoDetailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    photoId: string;
    profileId: string;
    displayName: string;
    iconId: string;
    imageUrl: string;
    createdAt: string;
  }>();

  const [comments, setComments] = useState<Comment[]>([]);
  const [reactionDetails, setReactionDetails] = useState<PhotoReactionDetail[]>(
    [],
  );
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isLoadingReaction, setIsLoadingReaction] = useState(true);
  const [isTogglingReaction, setIsTogglingReaction] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [isReactionListVisible, setIsReactionListVisible] = useState(false);
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUserId()
      .then(setViewerProfileId)
      .catch(() => {});
  }, []);

  const viewerReactionEmoji = useMemo(
    () => reactionDetails.find((detail) => detail.isOwn)?.emoji ?? null,
    [reactionDetails],
  );

  // Every reaction (including the viewer's own), grouped by emoji, shown as compact
  // badges next to the ReactionButton, always visible without needing a tap.
  const reactionGroups = useMemo(() => {
    const countByEmoji = new Map<ReactionEmoji, number>();

    for (const detail of reactionDetails) {
      countByEmoji.set(detail.emoji, (countByEmoji.get(detail.emoji) ?? 0) + 1);
    }

    return REACTION_EMOJIS.filter((emoji) => countByEmoji.has(emoji)).map(
      (emoji) => ({ count: countByEmoji.get(emoji)!, emoji }),
    );
  }, [reactionDetails]);

  const orderedComments = useMemo(
    () => orderCommentsWithReplies(comments),
    [comments],
  );

  // Only top-level comments can have replies (see handleReply, which threads a reply to
  // a reply under that reply's own parent), so this only ever has non-zero counts keyed
  // by a top-level comment's id.
  const replyCountByCommentId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const comment of comments) {
      if (!comment.parentCommentId) {
        continue;
      }

      counts.set(
        comment.parentCommentId,
        (counts.get(comment.parentCommentId) ?? 0) + 1,
      );
    }

    return counts;
  }, [comments]);

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
          setErrorMessage(getCommentErrorMessage(error, t));
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
  }, [params.photoId, t]);

  useEffect(() => {
    let isActive = true;

    listPhotoReactions(params.photoId)
      .then((details) => {
        if (isActive) {
          setReactionDetails(details);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage(t('photoDetail.errors.reactionLoadFailed'));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingReaction(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [params.photoId, t]);

  // Replaces the viewer's own entry (if any) with nextEmoji, leaving every other
  // reactor's entry untouched. A null nextEmoji just drops the viewer's own entry.
  const applyReactionState = useCallback(
    (nextEmoji: ReactionEmoji | null) => {
      setReactionDetails((currentDetails) => {
        const withoutOwn = currentDetails.filter((detail) => !detail.isOwn);

        if (nextEmoji === null) {
          return withoutOwn;
        }

        return [
          ...withoutOwn,
          {
            displayName: t('common.self'),
            emoji: nextEmoji,
            iconId: 'human',
            isOwn: true,
            profileId: 'self',
          },
        ];
      });
    },
    [t],
  );

  const handleSelectReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (isTogglingReaction) {
        return;
      }

      const previousDetails = reactionDetails;

      setIsTogglingReaction(true);
      // Optimistic: the screen should feel instant, and a failure reverts to the exact
      // prior state rather than a fresh refetch.
      applyReactionState(emoji);

      try {
        await setPhotoReaction(params.photoId, emoji);
      } catch {
        setReactionDetails(previousDetails);
      } finally {
        setIsTogglingReaction(false);
      }
    },
    [applyReactionState, isTogglingReaction, params.photoId, reactionDetails],
  );

  const handleRemoveReaction = useCallback(async () => {
    if (isTogglingReaction) {
      return;
    }

    const previousDetails = reactionDetails;

    setIsTogglingReaction(true);
    applyReactionState(null);

    try {
      await removePhotoReaction(params.photoId);
    } catch {
      setReactionDetails(previousDetails);
    } finally {
      setIsTogglingReaction(false);
    }
  }, [applyReactionState, isTogglingReaction, params.photoId, reactionDetails]);

  const handleSubmitReport = useCallback(
    (reason: ReportReason) => {
      reportContent('photo', params.photoId, reason).catch(() => {
        setErrorMessage(t('photoDetail.errors.reportSendFailed'));
      });
    },
    [params.photoId, t],
  );

  const handleReportPress = useCallback(() => {
    Alert.alert(t('photoDetail.report.title'), undefined, [
      {
        onPress: () => handleSubmitReport('inappropriate'),
        text: t('photoDetail.report.reasons.inappropriatePhoto'),
      },
      {
        onPress: () => handleSubmitReport('harassment'),
        text: t('photoDetail.report.reasons.harassment'),
      },
      {
        onPress: () => handleSubmitReport('spam'),
        text: t('photoDetail.report.reasons.spam'),
      },
      {
        onPress: () => handleSubmitReport('other'),
        text: t('photoDetail.report.reasons.other'),
      },
      { style: 'cancel', text: t('common.cancel') },
    ]);
  }, [handleSubmitReport, t]);

  const handleBlockUser = useCallback(() => {
    Alert.alert(
      t('photoDetail.blockConfirm.title', { name: params.displayName }),
      t('photoDetail.blockConfirm.message'),
      [
        { style: 'cancel', text: t('common.cancel') },
        {
          onPress: () => {
            blockUser(params.profileId)
              .then(() => router.back())
              .catch(() => {
                setErrorMessage(t('photoDetail.errors.blockFailed'));
              });
          },
          style: 'destructive',
          text: t('friends.actions.block'),
        },
      ],
    );
  }, [params.displayName, params.profileId, t]);

  const handleDeletePost = useCallback(() => {
    Alert.alert(
      t('photoDetail.deletePostConfirm.title'),
      t('photoDetail.deletePostConfirm.message'),
      [
        { style: 'cancel', text: t('common.cancel') },
        {
          onPress: () => {
            deleteMyFailurePhoto({
              createdAt: params.createdAt,
              imageUrl: params.imageUrl,
              photoId: params.photoId,
            })
              .then(() => router.back())
              .catch(() => {
                setErrorMessage(t('photoDetail.errors.deletePostFailed'));
              });
          },
          style: 'destructive',
          text: t('common.delete'),
        },
      ],
    );
  }, [params.createdAt, params.imageUrl, params.photoId, t]);

  const handleMorePress = useCallback(() => {
    const isOwnPost = viewerProfileId === params.profileId;

    Alert.alert(
      '',
      undefined,
      isOwnPost
        ? [
            {
              onPress: handleDeletePost,
              style: 'destructive' as const,
              text: t('photoDetail.deletePostButton'),
            },
            { style: 'cancel', text: t('common.cancel') },
          ]
        : [
            { onPress: handleReportPress, text: t('photoDetail.reportButton') },
            {
              onPress: handleBlockUser,
              style: 'destructive' as const,
              text: t('photoDetail.blockUserButton'),
            },
            { style: 'cancel', text: t('common.cancel') },
          ],
    );
  }, [
    handleBlockUser,
    handleDeletePost,
    handleReportPress,
    params.profileId,
    t,
    viewerProfileId,
  ]);

  const handleShowReactionList = useCallback(() => {
    if (reactionDetails.length === 0) {
      return;
    }

    setIsReactionListVisible(true);
  }, [reactionDetails.length]);

  const handleSendComment = useCallback(async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const nextComment = await addComment(
        params.photoId,
        commentText,
        replyTarget?.parentCommentId ?? null,
      );

      setComments((currentComments) => [...currentComments, nextComment]);
      setCommentText('');
      setReplyTarget(null);
    } catch (error) {
      setErrorMessage(getCommentErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  }, [commentText, params.photoId, replyTarget, t]);

  const handleReply = useCallback(
    (comment: Comment) => {
      setReplyTarget({
        displayName: comment.isOwn ? t('common.self') : comment.displayName,
        // Reply to a reply threads under its own parent, keeping the thread one level deep.
        parentCommentId: comment.parentCommentId ?? comment.id,
      });
    },
    [t],
  );

  const handleDeleteComment = useCallback(
    (comment: Comment) => {
      Alert.alert(
        t('photoDetail.deleteCommentConfirm.title'),
        t('photoDetail.deleteCommentConfirm.message'),
        [
          { style: 'cancel', text: t('common.cancel') },
          {
            onPress: () => {
              deleteComment(comment.id)
                .then(() => {
                  setComments((currentComments) =>
                    currentComments.filter(
                      (currentComment) =>
                        currentComment.id !== comment.id &&
                        currentComment.parentCommentId !== comment.id,
                    ),
                  );
                })
                .catch(() => {
                  setErrorMessage(t('photoDetail.errors.deleteCommentFailed'));
                });
            },
            style: 'destructive',
            text: t('common.delete'),
          },
        ],
      );
    },
    [t],
  );

  const handleReportComment = useCallback(
    (comment: Comment) => {
      if (comment.isOwn) {
        Alert.alert('', undefined, [
          {
            onPress: () => handleDeleteComment(comment),
            style: 'destructive',
            text: t('photoDetail.deleteCommentButton'),
          },
          { style: 'cancel', text: t('common.cancel') },
        ]);
        return;
      }

      Alert.alert(t('photoDetail.reportCommentTitle'), undefined, [
        {
          onPress: () =>
            reportContent('comment', comment.id, 'inappropriate').catch(
              () => {},
            ),
          text: t('photoDetail.report.reasons.inappropriateContent'),
        },
        {
          onPress: () =>
            reportContent('comment', comment.id, 'harassment').catch(() => {}),
          text: t('photoDetail.report.reasons.harassment'),
        },
        {
          onPress: () =>
            reportContent('comment', comment.id, 'spam').catch(() => {}),
          text: t('photoDetail.report.reasons.spam'),
        },
        {
          onPress: () =>
            reportContent('comment', comment.id, 'other').catch(() => {}),
          text: t('photoDetail.report.reasons.other'),
        },
        { style: 'cancel', text: t('common.cancel') },
      ]);
    },
    [handleDeleteComment, t],
  );

  const renderComment: ListRenderItem<Comment> = ({ item }) => (
    <Pressable
      delayLongPress={400}
      onLongPress={() => handleReportComment(item)}
      style={[styles.commentRow, !!item.parentCommentId && styles.replyRow]}
    >
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
            {item.isOwn ? t('common.self') : item.displayName}
          </Text>
          <Text style={styles.commentTime}>
            {formatCommentTime(item.createdAt)}
          </Text>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>

        {!item.parentCommentId && (
          <Pressable
            accessibilityLabel={t('photoDetail.replyAccessibilityLabel')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => handleReply(item)}
            style={styles.replyButton}
          >
            <CommentBubbleIcon color="#737373" size={14} />
            <Text style={styles.replyButtonText}>
              {replyCountByCommentId.get(item.id) ?? 0}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
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
          <Text style={styles.title}>{t('photoDetail.title')}</Text>

          <Pressable
            accessibilityLabel={t('friends.accessibility.moreActions')}
            accessibilityRole="button"
            hitSlop={12}
            onPress={handleMorePress}
            style={styles.moreButton}
          >
            <SymbolView
              name={{
                ios: 'ellipsis',
                android: 'more_horiz',
                web: 'more_horiz',
              }}
              size={20}
              tintColor="#171717"
              type="monochrome"
            />
          </Pressable>
        </View>

        <FlatList
          contentContainerStyle={styles.scrollContent}
          data={orderedComments}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            !isLoadingComments ? (
              <View style={styles.emptyBox}>
                <CommentBubbleIcon color="#a3a3a3" size={28} />
                <Text style={styles.emptyText}>
                  {t('photoDetail.emptyComments')}
                </Text>
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
                <ReactionButton
                  count={reactionDetails.length}
                  // Resets the button's own open/closed picker state whenever the
                  // reaction actually changes, so it can never linger open after a
                  // removal.
                  key={viewerReactionEmoji ?? 'none'}
                  onRemoveEmoji={handleRemoveReaction}
                  onSelectEmoji={handleSelectReaction}
                  viewerEmoji={viewerReactionEmoji}
                />

                {reactionGroups.length > 0 && (
                  <Pressable
                    accessibilityLabel={t('home.accessibility.viewReactors')}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={handleShowReactionList}
                    style={styles.otherReactionsRow}
                  >
                    {reactionGroups.map(({ count, emoji }) => (
                      <View key={emoji} style={styles.otherReactionPill}>
                        <Text style={styles.otherReactionEmoji}>{emoji}</Text>
                        <Text style={styles.otherReactionCount}>{count}</Text>
                      </View>
                    ))}
                  </Pressable>
                )}

                <View style={styles.commentCountBadge}>
                  <CommentBubbleIcon color="#737373" size={20} />
                  <Text style={styles.commentCountText}>{comments.length}</Text>
                </View>
              </View>

              {(isLoadingComments || isLoadingReaction) && (
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

        {replyTarget && (
          <View style={styles.replyTargetRow}>
            <Text style={styles.replyTargetText}>
              {t('photoDetail.replyingTo', { name: replyTarget.displayName })}
            </Text>
            <Pressable
              accessibilityLabel={t(
                'photoDetail.cancelReplyAccessibilityLabel',
              )}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setReplyTarget(null)}
            >
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={14}
                tintColor="#737373"
                type="monochrome"
              />
            </Pressable>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            editable={!isSubmitting}
            onChangeText={setCommentText}
            placeholder={t('photoDetail.commentPlaceholder')}
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
              <Text style={styles.sendButtonText}>
                {t('photoDetail.sendButton')}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsReactionListVisible(false)}
        transparent
        visible={isReactionListVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.reactionListSheet}>
            <View style={styles.reactionListHeader}>
              <Text style={styles.reactionListTitle}>
                {t('home.reactionModal.title')}
              </Text>
              <Pressable
                accessibilityLabel={t('common.close')}
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => setIsReactionListVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </Pressable>
            </View>

            <FlatList
              data={reactionDetails}
              keyExtractor={(item) => item.profileId}
              renderItem={({ item }) => (
                <View style={styles.reactorRow}>
                  <View style={styles.commentAvatar}>
                    <Image
                      contentFit="cover"
                      source={getProfileIconSource(item.iconId)}
                      style={styles.commentAvatarImage}
                    />
                  </View>
                  <Text style={styles.reactorName}>
                    {item.isOwn ? t('common.self') : item.displayName}
                  </Text>
                  <Text style={styles.reactorEmoji}>{item.emoji}</Text>
                </View>
              )}
            />
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
  moreButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
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
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  replyRow: {
    paddingLeft: 42,
  },
  replyButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
  },
  replyButtonText: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '700',
  },
  replyTargetRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderTopColor: '#f5f5f5',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  replyTargetText: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '700',
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
  reactorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
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
