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

import { FriendListLoadingSkeleton } from '@/components/loading-skeletons';
import { QuestionCountStepper } from '@/components/question-count-stepper';
import { getProfileIconSource } from '@/constants/profile-icons';
import { DEFAULT_QUIZ_QUESTION_COUNT } from '@/services/alarm';
import {
  activateWakeFriendAlarm,
  listWakeFriendTargets,
  type WakeFriendTarget,
} from '@/services/wake-friends';

function getLoadErrorMessage(t: (key: string) => string): string {
  return t('wakeFriends.errors.loadFailed');
}

export default function WakeFriendsScreen() {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<WakeFriendTarget[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activatingProfileId, setActivatingProfileId] = useState<string | null>(
    null,
  );
  const [questionCount, setQuestionCount] = useState(
    DEFAULT_QUIZ_QUESTION_COUNT,
  );

  const loadTargets = useCallback(async () => {
    setTargets(await listWakeFriendTargets());
  }, []);

  useEffect(() => {
    let isActive = true;

    listWakeFriendTargets()
      .then((nextTargets) => {
        if (isActive) {
          setTargets(nextTargets);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage(getLoadErrorMessage(t));
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
    setSuccessMessage(null);
    setIsRefreshing(true);

    try {
      await loadTargets();
    } catch {
      setErrorMessage(getLoadErrorMessage(t));
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTargets, t]);

  const handleActivateAlarm = useCallback(
    async (target: WakeFriendTarget) => {
      setActivatingProfileId(target.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        await activateWakeFriendAlarm(target.failureEntryId, questionCount);
        setTargets((currentTargets) =>
          currentTargets.filter(
            (currentTarget) => currentTarget.id !== target.id,
          ),
        );
        setSuccessMessage(
          t('wakeFriends.alarmSentSuccess', {
            displayName: target.displayName,
          }),
        );
      } catch {
        setErrorMessage(
          t('wakeFriends.alarmSentError', {
            displayName: target.displayName,
          }),
        );
      } finally {
        setActivatingProfileId(null);
      }
    },
    [questionCount, t],
  );

  const renderItem: ListRenderItem<WakeFriendTarget> = ({ item }) => {
    const isActivating = activatingProfileId === item.id;
    const isDisabled = activatingProfileId !== null;

    return (
      <View style={styles.friendCard}>
        <View style={styles.profileArea}>
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
            <Text style={styles.failureStatus}>
              {t('wakeFriends.failureStatus')}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel={t('wakeFriends.ringAlarmAccessibilityLabel', {
            displayName: item.displayName,
          })}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
          disabled={isDisabled}
          onPress={() => handleActivateAlarm(item)}
          style={({ pressed }) => [
            styles.alarmButton,
            pressed && styles.buttonPressed,
            isDisabled && !isActivating && styles.alarmButtonDisabled,
          ]}
        >
          {isActivating ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <SymbolView
              name={{ ios: 'alarm.fill', android: 'alarm', web: 'alarm' }}
              size={20}
              tintColor="#ffffff"
              type="monochrome"
            />
          )}
          <Text style={styles.alarmButtonText}>
            {isActivating
              ? t('wakeFriends.sending')
              : t('wakeFriends.ringButton')}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t('wakeFriends.backToHomeAccessibilityLabel')}
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.replace('/home')}
            style={styles.closeButton}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={24}
              tintColor="#737373"
              type="monochrome"
            />
          </Pressable>
          <Text style={styles.title}>{t('wakeFriends.title')}</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.description}>{t('wakeFriends.description')}</Text>

          <View style={styles.questionCountBox}>
            <Text style={styles.questionCountLabel}>
              {t('wakeFriends.questionCountLabel')}
            </Text>
            <QuestionCountStepper
              disabled={activatingProfileId !== null}
              onChange={setQuestionCount}
              value={questionCount}
            />
          </View>

          {errorMessage && (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {errorMessage}
            </Text>
          )}
          {successMessage && (
            <Text accessibilityLiveRegion="polite" style={styles.successText}>
              {successMessage}
            </Text>
          )}

          {isLoading ? (
            <FriendListLoadingSkeleton />
          ) : (
            <FlatList
              contentContainerStyle={styles.friendList}
              data={targets}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <View style={styles.emptyIcon}>
                    <SymbolView
                      name={{
                        ios: 'moon.zzz',
                        android: 'bedtime',
                        web: 'bedtime',
                      }}
                      size={30}
                      tintColor="#737373"
                      type="monochrome"
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {t('wakeFriends.emptyTitle')}
                  </Text>
                  <Text style={styles.emptyText}>
                    {t('wakeFriends.emptyText')}
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
    justifyContent: 'center',
    minHeight: 61,
    paddingHorizontal: 72,
    paddingVertical: 12,
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    left: 18,
    position: 'absolute',
    width: 44,
  },
  title: {
    color: '#171717',
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  description: {
    color: '#737373',
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  questionCountBox: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  questionCountLabel: {
    color: '#171717',
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#b42318',
    fontFamily: 'NotoSansJP_500Medium',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  successText: {
    color: '#067647',
    fontFamily: 'NotoSansJP_500Medium',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  friendList: {
    flexGrow: 1,
    gap: 10,
    paddingBottom: 32,
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 12,
  },
  profileArea: {
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 180,
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
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  userId: {
    color: '#737373',
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: 13,
  },
  failureStatus: {
    color: '#b45309',
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  alarmButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 104,
    paddingHorizontal: 16,
  },
  alarmButtonDisabled: {
    backgroundColor: '#a3a3a3',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  alarmButtonText: {
    color: '#ffffff',
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#f1f1f1',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginBottom: 16,
    width: 56,
  },
  emptyTitle: {
    color: '#171717',
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    color: '#737373',
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
