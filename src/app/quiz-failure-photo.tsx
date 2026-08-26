import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LoadingIndicator } from '@/components/loading';
import { ActionButton, challengeStyles } from '@/components/wake-challenge-ui';
import { stopRingingAlarm } from '@/services/android-alarm-mechanics';
import { recordFailureAccessOutcome } from '@/services/friends-feed-access';
import { recordQuizFailurePhoto } from '@/services/quiz';
import { getFailureAccessOutcome } from '@/services/wake-challenge-rules';
import { clearWakeChallengeAttempt } from '@/services/wake-challenge-attempt';
import { logWakeChallengeFailure } from '@/services/wake-friends';
import { recordWakeAttemptOutcome } from '@/services/wake-status';

type UploadStatus = 'checking' | 'failed' | 'uploaded';

function getStatusCopy(status: UploadStatus, t: (key: string) => string) {
  switch (status) {
    case 'checking':
      return t('quizFailurePhoto.status.checking');
    case 'uploaded':
      return t('quizFailurePhoto.status.uploaded');
    case 'failed':
      return t('quizFailurePhoto.status.failed');
  }
}

export default function QuizFailurePhotoScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    activatedByDisplayName?: string;
    localPhotoUri?: string;
    requiredQuestionCount?: string;
  }>();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('checking');

  useEffect(() => {
    // Read (via recordWakeAttemptOutcome) before clearing -- clearWakeChallengeAttempt
    // removes the very attempt record it needs to know when the alarm rang.
    const requiredQuestionCount = params.requiredQuestionCount
      ? Number(params.requiredQuestionCount)
      : null;

    recordWakeAttemptOutcome('failure', requiredQuestionCount).catch(() => {});
    clearWakeChallengeAttempt().catch(() => {});
  }, [params.requiredQuestionCount]);

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
    logWakeChallengeFailure().catch(() => {});
    // See quiz-failure.tsx: the Challenge is over (the quiz timed out), so the alarm
    // must stop here too or it rings with no in-app way to silence it.
    stopRingingAlarm().catch(() => {});
  }, [failureReason, uploadStatus]);
  const actionLabel =
    accessOutcome === 'allowed'
      ? t('quizFailurePhoto.feedButton')
      : t('quizFailurePhoto.backToAlarmButton');

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
            <Text style={challengeStyles.lightTitle}>
              {t('quizFailurePhoto.title')}
            </Text>
            <Text style={challengeStyles.lightCaption}>
              {getStatusCopy(uploadStatus, t)}
            </Text>
            {!!params.activatedByDisplayName && (
              <Text style={styles.activatedBy}>
                {t('quizFailurePhoto.activatedByLabel', {
                  displayName: params.activatedByDisplayName,
                })}
              </Text>
            )}
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
                    accessibilityLabel={t('quizFailurePhoto.uploadingPhoto')}
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
  activatedBy: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
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
