import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { AlarmListLoadingSkeleton } from '@/components/loading-skeletons';
import { QuestionCountStepper } from '@/components/question-count-stepper';
import {
  ALARM_SOUND_IDS,
  getAlarmSoundLabel,
  DEFAULT_ALARM_SOUND_ID,
  type AlarmSoundId,
} from '@/constants/alarm-sounds';
import {
  AlarmServiceError,
  alarmWillSkipToday,
  clearAlarmFiredToday,
  listSavedAlarms,
  setSavedAlarmEnabled,
  type SavedAlarm,
  type Weekday,
} from '@/services/alarm';
import {
  AndroidAlarmMechanicsError,
  ensureAlarmPermissions,
  scheduleTestAlarm,
} from '@/services/android-alarm-mechanics';
import { getDevMode } from '@/services/dev-mode';
import {
  getDevQuizQuestionCount,
  setDevQuizQuestionCount,
} from '@/services/dev-quiz-settings';

const WEEKDAY_KEYS: Record<Weekday, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};
const DISPLAY_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function formatTime(alarm: SavedAlarm): string {
  return `${String(alarm.hour).padStart(2, '0')}:${String(
    alarm.minute,
  ).padStart(2, '0')}`;
}

function formatWeekdays(
  weekdays: Weekday[],
  t: (key: string) => string,
): string {
  if (weekdays.length === 0) {
    return t('alarms.noRepeat');
  }

  return DISPLAY_WEEKDAYS.filter((weekday) => weekdays.includes(weekday))
    .map((weekday) => t(`common.weekdaysShort.${WEEKDAY_KEYS[weekday]}`))
    .join(' ');
}

function getAlarmErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof AlarmServiceError) {
    switch (error.code) {
      case 'saved_alarm_not_found':
        return t('alarms.errors.notFound');
      case 'storage_read_failed':
      case 'storage_parse_failed':
        return t('alarms.errors.loadFailed');
      case 'storage_write_failed':
        return t('alarms.errors.saveStateFailed');
      case 'invalid_alarm_input':
      case 'storage_clear_failed':
      case 'weekday_already_used':
        return t('alarms.errors.updateFailed');
      case 'alarm_scheduling_failed':
        return t('alarms.errors.schedulingFailed');
    }
  }

  return t('alarms.errors.updateFailed');
}

function getPermissionDeniedMessage(
  reason:
    | 'exact_alarm_unavailable'
    | 'notification_permission_denied'
    | 'battery_optimization_enabled',
  t: (key: string) => string,
): string {
  switch (reason) {
    case 'notification_permission_denied':
      return t('common.errors.notificationPermissionRequired');
    case 'battery_optimization_enabled':
      return t('common.errors.batteryOptimizationEnabled');
    case 'exact_alarm_unavailable':
      return t('common.errors.alarmPermissionRequired');
  }
}

export default function AlarmsScreen() {
  const { t } = useTranslation();
  const [alarms, setAlarms] = useState<SavedAlarm[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingAlarmId, setUpdatingAlarmId] = useState<string | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);
  const [devTestSoundId, setDevTestSoundId] = useState<AlarmSoundId>(
    DEFAULT_ALARM_SOUND_ID,
  );
  const [devTestQuestionCount, setDevTestQuestionCount] = useState(5);

  useEffect(() => {
    let isActive = true;

    getDevMode().then((devMode) => {
      if (isActive) {
        setIsDevMode(devMode);
      }
    });

    getDevQuizQuestionCount().then((questionCount) => {
      if (isActive) {
        setDevTestQuestionCount(questionCount);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const handleChangeDevTestQuestionCount = useCallback(
    (nextQuestionCount: number) => {
      setDevTestQuestionCount(nextQuestionCount);
      setDevQuizQuestionCount(nextQuestionCount).catch(() => {});
    },
    [],
  );

  const loadAlarms = useCallback(async () => {
    setErrorMessage(null);
    setIsRefreshing(true);

    try {
      setAlarms(await listSavedAlarms());
    } catch (error) {
      setErrorMessage(getAlarmErrorMessage(error, t));
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    let isActive = true;

    listSavedAlarms()
      .then((nextAlarms) => {
        if (isActive) {
          setAlarms(nextAlarms);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getAlarmErrorMessage(error, t));
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

  const handleToggleAlarm = useCallback(
    async (alarm: SavedAlarm, isEnabled: boolean) => {
      const previousAlarms = alarms;

      setErrorMessage(null);
      setUpdatingAlarmId(alarm.id);
      setAlarms((currentAlarms) =>
        currentAlarms.map((currentAlarm) =>
          currentAlarm.id === alarm.id
            ? { ...currentAlarm, isEnabled }
            : currentAlarm,
        ),
      );

      try {
        if (isEnabled) {
          const permissionResult = await ensureAlarmPermissions();

          if (!permissionResult.granted) {
            setAlarms(previousAlarms);
            setErrorMessage(
              getPermissionDeniedMessage(permissionResult.reason, t),
            );
            return;
          }
        }

        const updatedAlarm = await setSavedAlarmEnabled(alarm.id, isEnabled);
        setAlarms((currentAlarms) =>
          currentAlarms.map((currentAlarm) =>
            currentAlarm.id === updatedAlarm.id ? updatedAlarm : currentAlarm,
          ),
        );
      } catch (error) {
        setAlarms(previousAlarms);
        setErrorMessage(getAlarmErrorMessage(error, t));
      } finally {
        setUpdatingAlarmId(null);
      }
    },
    [alarms, t],
  );

  const handleFireTestAlarm = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const permissionResult = await ensureAlarmPermissions();

      if (!permissionResult.granted) {
        setErrorMessage(getPermissionDeniedMessage(permissionResult.reason, t));
        return;
      }

      await scheduleTestAlarm(devTestSoundId);
      setSuccessMessage(t('alarms.testAlarmScheduled'));
    } catch (error) {
      if (error instanceof AndroidAlarmMechanicsError) {
        setErrorMessage(t('alarms.testAlarmFailed'));
        return;
      }

      setErrorMessage(getAlarmErrorMessage(error, t));
    }
  }, [devTestSoundId, t]);

  const handleClearFiredToday = useCallback(
    async (alarmId: string) => {
      setErrorMessage(null);

      try {
        const updatedAlarm = await clearAlarmFiredToday(alarmId);
        setAlarms((currentAlarms) =>
          currentAlarms.map((currentAlarm) =>
            currentAlarm.id === updatedAlarm.id ? updatedAlarm : currentAlarm,
          ),
        );
      } catch (error) {
        setErrorMessage(getAlarmErrorMessage(error, t));
      }
    },
    [t],
  );

  const renderItem: ListRenderItem<SavedAlarm> = ({ item }) => {
    const isUpdating = updatingAlarmId === item.id;

    return (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.navigate({
            pathname: '/edit-alarm',
            params: { id: item.id },
          })
        }
        style={({ pressed }) => [
          styles.alarmCard,
          pressed && styles.cardPressed,
          !item.isEnabled && styles.alarmCardDisabled,
        ]}
      >
        <View style={styles.alarmMain}>
          <View style={styles.alarmTopRow}>
            <Text
              style={[
                styles.alarmTime,
                !item.isEnabled && styles.alarmTextDisabled,
              ]}
            >
              {formatTime(item)}
            </Text>
            <Text
              style={[
                styles.statusText,
                !item.isEnabled && styles.alarmTextDisabled,
              ]}
            >
              {item.isEnabled ? t('alarms.status.on') : t('alarms.status.off')}
            </Text>
          </View>

          <Text
            style={[
              styles.weekdayText,
              !item.isEnabled && styles.alarmTextDisabled,
            ]}
          >
            {formatWeekdays(item.weekdays, t)}
          </Text>

          {alarmWillSkipToday(item) && (
            <Text style={styles.skipTodayText}>{t('alarms.skipToday')}</Text>
          )}

          {isDevMode && item.lastFiredLocalDay && (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                void handleClearFiredToday(item.id);
              }}
            >
              <Text style={styles.debugToggleText}>
                {t('alarms.devClearFiredToday')}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: item.isEnabled, disabled: isUpdating }}
          disabled={isUpdating}
          hitSlop={12}
          onPress={(event) => {
            event.stopPropagation();
            void handleToggleAlarm(item, !item.isEnabled);
          }}
          style={[
            styles.switchTrack,
            item.isEnabled ? styles.switchTrackOn : styles.switchTrackOff,
          ]}
        >
          <View
            style={[
              styles.switchThumb,
              item.isEnabled ? styles.switchThumbOn : styles.switchThumbOff,
            ]}
          />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('alarms.title')}</Text>

          {isDevMode && (
            <Pressable accessibilityRole="button" onPress={handleFireTestAlarm}>
              <Text style={styles.debugToggleText}>
                {t('alarms.devFireTestAlarm')}
              </Text>
            </Pressable>
          )}
        </View>

        {isDevMode && (
          <View style={styles.devSoundRow}>
            {ALARM_SOUND_IDS.map((id) => {
              const isSelected = id === devTestSoundId;

              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  key={id}
                  onPress={() => setDevTestSoundId(id)}
                  style={[
                    styles.devSoundOption,
                    isSelected && styles.devSoundOptionSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.devSoundOptionText,
                      isSelected && styles.devSoundOptionTextSelected,
                    ]}
                  >
                    {getAlarmSoundLabel(id, t)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {isDevMode && (
          <View style={styles.devQuestionCountRow}>
            <Text style={styles.debugToggleText}>
              {t('alarms.devQuestionCountLabel')}
            </Text>
            <QuestionCountStepper
              onChange={handleChangeDevTestQuestionCount}
              value={devTestQuestionCount}
            />
          </View>
        )}

        <View style={styles.content}>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {successMessage && (
            <Text style={styles.successText}>{successMessage}</Text>
          )}

          {isLoading ? (
            <AlarmListLoadingSkeleton />
          ) : (
            <FlatList
              contentContainerStyle={styles.alarmList}
              data={alarms}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>
                    {t('alarms.empty.title')}
                  </Text>
                  <Text style={styles.emptyText}>
                    {t('alarms.empty.description')}
                  </Text>
                </View>
              }
              onRefresh={loadAlarms}
              refreshing={isRefreshing}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <Pressable
          accessibilityLabel={t('alarms.addAlarmAccessibilityLabel')}
          accessibilityRole="button"
          onPress={() => router.push('/add-alarm')}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>

        <BottomNav activeRoute="/alarms" />
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
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 20,
  },
  debugToggleText: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700',
  },
  devSoundRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  devQuestionCountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  devSoundOption: {
    borderColor: '#e5e5e5',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  devSoundOptionSelected: {
    backgroundColor: '#b42318',
    borderColor: '#b42318',
  },
  devSoundOptionText: {
    color: '#b42318',
    fontSize: 11,
    fontWeight: '700',
  },
  devSoundOptionTextSelected: {
    color: '#ffffff',
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
  successText: {
    color: '#067647',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  alarmList: {
    gap: 14,
    paddingBottom: 116,
  },
  alarmCard: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 110,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  alarmCardDisabled: {
    backgroundColor: '#ffffff',
    opacity: 0.62,
  },
  cardPressed: {
    opacity: 0.78,
  },
  alarmMain: {
    flex: 1,
    marginRight: 16,
  },
  alarmTopRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  alarmTime: {
    color: '#171717',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  statusText: {
    color: '#171717',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 24,
  },
  weekdayText: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '700',
  },
  alarmTextDisabled: {
    color: '#737373',
  },
  skipTodayText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  switchTrack: {
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },
  switchTrackOn: {
    alignItems: 'flex-end',
    backgroundColor: '#171717',
  },
  switchTrackOff: {
    alignItems: 'flex-start',
    backgroundColor: '#d4d4d4',
  },
  switchThumb: {
    backgroundColor: '#ffffff',
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  switchThumbOn: {
    backgroundColor: '#ffffff',
  },
  switchThumbOff: {
    backgroundColor: '#ffffff',
  },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    fontFamily: 'NotoSansJP_700Bold',
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
    fontFamily: 'NotoSansJP_700Bold',
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
