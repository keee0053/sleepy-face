import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';

import {
  AlarmServiceError,
  getNextAlarmOccurrence,
  listSavedAlarms,
  setSavedAlarmEnabled,
  type SavedAlarm,
  type Weekday,
} from '@/services/alarm';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: '日',
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
};
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

function formatTime(alarm: SavedAlarm): string {
  return `${String(alarm.hour).padStart(2, '0')}:${String(
    alarm.minute,
  ).padStart(2, '0')}`;
}

function formatWeekdays(weekdays: Weekday[]): string {
  if (weekdays.length === 7) {
    return '毎日';
  }

  if (
    weekdays.length === WEEKDAYS.length &&
    weekdays.every((weekday, index) => weekday === WEEKDAYS[index])
  ) {
    return '平日';
  }

  if (weekdays.length === 2 && weekdays.includes(0) && weekdays.includes(6)) {
    return '週末';
  }

  return weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join('・');
}

function formatNextOccurrence(alarm: SavedAlarm): string {
  const nextOccurrence = getNextAlarmOccurrence(alarm);
  const month = nextOccurrence.getMonth() + 1;
  const date = nextOccurrence.getDate();
  const weekday = WEEKDAY_LABELS[nextOccurrence.getDay() as Weekday];

  return `${month}/${date}(${weekday}) ${formatTime(alarm)}`;
}

function getAlarmErrorMessage(error: unknown): string {
  if (error instanceof AlarmServiceError) {
    switch (error.code) {
      case 'saved_alarm_not_found':
        return 'アラームが見つかりませんでした。';
      case 'storage_read_failed':
      case 'storage_parse_failed':
        return 'アラーム一覧を読み込めませんでした。';
      case 'storage_write_failed':
        return 'アラームの状態を保存できませんでした。';
      case 'invalid_alarm_input':
      case 'storage_clear_failed':
      case 'weekday_already_used':
        return 'アラーム情報を更新できませんでした。';
    }
  }

  return 'アラーム情報を更新できませんでした。';
}

export default function AlarmsScreen() {
  const [alarms, setAlarms] = useState<SavedAlarm[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingAlarmId, setUpdatingAlarmId] = useState<string | null>(null);

  const loadAlarms = useCallback(async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      setAlarms(await listSavedAlarms());
    } catch (error) {
      setErrorMessage(getAlarmErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

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
          setErrorMessage(getAlarmErrorMessage(error));
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
        const updatedAlarm = await setSavedAlarmEnabled(alarm.id, isEnabled);
        setAlarms((currentAlarms) =>
          currentAlarms.map((currentAlarm) =>
            currentAlarm.id === updatedAlarm.id ? updatedAlarm : currentAlarm,
          ),
        );
      } catch (error) {
        setAlarms(previousAlarms);
        setErrorMessage(getAlarmErrorMessage(error));
      } finally {
        setUpdatingAlarmId(null);
      }
    },
    [alarms],
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
              styles.weekdayText,
              !item.isEnabled && styles.alarmTextDisabled,
            ]}
          >
            {formatWeekdays(item.weekdays)}
          </Text>
          <Text style={styles.nextText}>
            {item.isEnabled ? `次回 ${formatNextOccurrence(item)}` : '停止中'}
          </Text>
        </View>

        <View style={styles.switchColumn}>
          <Switch
            disabled={isUpdating}
            onValueChange={(value) => handleToggleAlarm(item, value)}
            value={item.isEnabled}
          />
          <Text style={styles.switchLabel}>
            {item.isEnabled ? 'ON' : 'OFF'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SLEEPY FACE</Text>
          <Text style={styles.title}>アラーム</Text>
          <Text style={styles.description}>
            登録済みアラームの時刻、繰り返し曜日、ON/OFF状態を確認できます。
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={loadAlarms}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>再読み込み</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/add-alarm')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>追加</Text>
          </Pressable>
        </View>

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>アラームを読み込み中...</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.alarmList}
            data={alarms}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>アラームがありません</Text>
                <Text style={styles.emptyText}>
                  追加ボタンから新しいアラームを作成できます。
                </Text>
              </View>
            }
            renderItem={renderItem}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    color: '#536dfe',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: '#172033',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  description: {
    color: '#657086',
    fontSize: 15,
    lineHeight: 23,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#172033',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8deea',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  loadingBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingText: {
    color: '#657086',
    fontSize: 14,
  },
  alarmList: {
    gap: 12,
    paddingBottom: 32,
  },
  alarmCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 116,
    padding: 16,
  },
  alarmCardDisabled: {
    backgroundColor: '#f8fafc',
  },
  cardPressed: {
    opacity: 0.86,
  },
  alarmMain: {
    flex: 1,
    marginRight: 14,
  },
  alarmTime: {
    color: '#172033',
    fontSize: 40,
    fontWeight: '800',
    marginBottom: 6,
  },
  weekdayText: {
    color: '#344054',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  nextText: {
    color: '#657086',
    fontSize: 13,
    lineHeight: 19,
  },
  alarmTextDisabled: {
    color: '#98a2b3',
  },
  switchColumn: {
    alignItems: 'center',
    minWidth: 58,
  },
  switchLabel: {
    color: '#657086',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  emptyBox: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
  },
  emptyTitle: {
    color: '#172033',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#657086',
    fontSize: 14,
    lineHeight: 21,
  },
});
