import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, challengeStyles } from '@/components/wake-challenge-ui';
import { recordFailureEvent } from '@/services/failure-log';
import { recordFailureAccessOutcome } from '@/services/friends-feed-access';
import type { WakeChallengeFailureReason } from '@/services/wake-challenge-rules';
import { clearWakeChallengeAttempt } from '@/services/wake-challenge-attempt';

type NoPhotoFailureReason = Extract<
  WakeChallengeFailureReason,
  'app-quit' | 'bad-photo-limit' | 'no-photo-timeout'
>;

function getFailureReason(reason?: string): NoPhotoFailureReason {
  switch (reason) {
    case 'app-quit':
    case 'bad-photo-limit':
    case 'no-photo-timeout':
      return reason;
    default:
      return 'no-photo-timeout';
  }
}

function getFailureCopy(reason: NoPhotoFailureReason) {
  switch (reason) {
    case 'app-quit':
      return 'チャレンジの途中でアプリが終了しました。今日はフィードを見られません。';
    case 'bad-photo-limit':
      return '顔写真を確認できなかったため、今日はフィードを見られません。';
    case 'no-photo-timeout':
      return '写真を残せないまま時間切れになりました。今日はフィードを見られません。';
  }
}

export default function QuizFailureScreen() {
  const params = useLocalSearchParams<{
    reason?: string;
  }>();

  const failureReason = getFailureReason(params.reason);

  useEffect(() => {
    clearWakeChallengeAttempt().catch(() => {});
    recordFailureAccessOutcome(failureReason).catch(() => {});
    recordFailureEvent(failureReason).catch((error) => {
      console.log(
        '[DEBUG-fle1] recordFailureEvent failed',
        failureReason,
        error,
      );
    });
  }, [failureReason]);

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
            <Text style={challengeStyles.darkTitle}>起床失敗</Text>
            <Text style={challengeStyles.darkCaption}>
              {getFailureCopy(failureReason)}
            </Text>
          </View>

          <ActionButton
            label="アラームへ戻る"
            onPress={() => router.replace('/home')}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 38,
    justifyContent: 'center',
    paddingBottom: 48,
  },
  screen: {
    backgroundColor: '#171717',
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
  copy: {
    gap: 12,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 48,
    borderWidth: 4,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  iconText: {
    color: '#ffffff',
    fontSize: 46,
    fontWeight: '900',
  },
});
