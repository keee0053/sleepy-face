import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LoadingIndicator } from '@/components/loading';
import { ActionButton, challengeStyles } from '@/components/wake-challenge-ui';
import { recordFailureEvent } from '@/services/failure-log';
import { recordFailureAccessOutcome } from '@/services/friends-feed-access';
import { recordQuizFailurePhoto } from '@/services/quiz';
import { getFailureAccessOutcome } from '@/services/wake-challenge-rules';
import { clearWakeChallengeAttempt } from '@/services/wake-challenge-attempt';

type UploadStatus = 'checking' | 'failed' | 'uploaded';

function getStatusCopy(status: UploadStatus) {
  switch (status) {
    case 'checking':
      return 'クイズが時間切れになりました。写真をアップロードしています…';
    case 'uploaded':
      return 'クイズが時間切れになりました。この写真を失敗記録として保存しました。';
    case 'failed':
      return 'クイズは時間切れです。写真の保存には失敗しましたが、撮影した写真はこちらです。';
  }
}

export default function QuizFailurePhotoScreen() {
  const params = useLocalSearchParams<{
    localPhotoUri?: string;
  }>();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('checking');

  useEffect(() => {
    clearWakeChallengeAttempt().catch(() => {});
  }, []);

  useEffect(() => {
    let isActive = true;

    async function attemptUpload() {
      if (!params.localPhotoUri) {
        if (isActive) {
          setUploadStatus('failed');
        }
        return;
      }

      try {
        await recordQuizFailurePhoto(params.localPhotoUri);

        if (isActive) {
          setUploadStatus('uploaded');
        }
      } catch {
        if (isActive) {
          setUploadStatus('failed');
        }
      }
    }

    attemptUpload();

    return () => {
      isActive = false;
    };
  }, [params.localPhotoUri]);

  const failureReason =
    uploadStatus === 'uploaded' ? 'quiz-timeout' : 'quiz-upload-failed';
  const accessOutcome = getFailureAccessOutcome(failureReason);

  useEffect(() => {
    if (uploadStatus === 'checking') {
      return;
    }

    recordFailureAccessOutcome(failureReason).catch(() => {});
    recordFailureEvent(failureReason).catch((error) => {
      console.log(
        '[DEBUG-fle1] recordFailureEvent failed',
        failureReason,
        error,
      );
    });
  }, [failureReason, uploadStatus]);
  const actionLabel =
    accessOutcome === 'allowed' ? 'フィードへ進む' : 'アラームへ戻る';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.content}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>×</Text>
          </View>

          <View style={styles.copy}>
            <Text style={challengeStyles.lightTitle}>起床失敗</Text>
            <Text style={challengeStyles.lightCaption}>
              {getStatusCopy(uploadStatus)}
            </Text>
          </View>

          {!!params.localPhotoUri && (
            <View style={styles.photoWrapper}>
              <Image
                resizeMode="cover"
                source={{ uri: params.localPhotoUri }}
                style={styles.photo}
              />
              {uploadStatus === 'checking' && (
                <View style={styles.photoOverlay}>
                  <LoadingIndicator
                    accessibilityLabel="写真を送信中"
                    tone="light"
                  />
                </View>
              )}
            </View>
          )}

          <ActionButton
            disabled={uploadStatus === 'checking'}
            label={actionLabel}
            onPress={() => router.replace('/home')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 32,
    justifyContent: 'center',
    paddingBottom: 48,
  },
  copy: {
    gap: 12,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  iconText: {
    color: '#171717',
    fontSize: 46,
    fontWeight: '900',
  },
  photo: {
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    height: '100%',
    width: '100%',
  },
  photoOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 23, 23, 0.45)',
    borderRadius: 20,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  photoWrapper: {
    alignSelf: 'center',
    aspectRatio: 1,
    maxWidth: 220,
    width: '60%',
  },
  screen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingTop: 42,
  },
});
