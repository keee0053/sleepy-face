import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  MockBottomNav,
  MockCard,
  MockFloatingActionButton,
  MockScreen,
} from '@/components/mock-ui';
import { mockAlarms, type MockAlarm, weekdayLabels } from '@/mocks/ui';
import type { Weekday } from '@/services/alarm';

function formatTime(alarm: MockAlarm): string {
  return `${String(alarm.hour).padStart(2, '0')}:${String(
    alarm.minute,
  ).padStart(2, '0')}`;
}

function formatWeekdays(weekdays: Weekday[]): string {
  const weekdaysOnly: Weekday[] = [1, 2, 3, 4, 5];

  if (weekdays.length === 7) {
    return '毎日';
  }

  if (
    weekdays.length === weekdaysOnly.length &&
    weekdays.every((weekday, index) => weekday === weekdaysOnly[index])
  ) {
    return '平日';
  }

  if (weekdays.length === 2 && weekdays.includes(0) && weekdays.includes(6)) {
    return '週末';
  }

  return weekdays.map((weekday) => weekdayLabels[weekday]).join('・');
}

export default function AlarmsScreen() {
  const [alarms, setAlarms] = useState(mockAlarms);

  function toggleAlarm(targetAlarm: MockAlarm, isEnabled: boolean) {
    setAlarms((currentAlarms) =>
      currentAlarms.map((alarm) =>
        alarm.id === targetAlarm.id ? { ...alarm, isEnabled } : alarm,
      ),
    );
  }

  return (
    <MockScreen
      footer={
        <>
          <MockFloatingActionButton
            onPress={() => router.navigate('/add-alarm')}
          />
          <MockBottomNav active="alarms" />
        </>
      }
      subtitle="登録済みアラームの時刻、繰り返し曜日、ON/OFF状態を確認できます。"
      title="アラーム"
    >
      <View style={styles.list}>
        {alarms.map((alarm) => (
          <Pressable
            accessibilityRole="button"
            key={alarm.id}
            onPress={() =>
              router.navigate({
                pathname: '/edit-alarm',
                params: { id: alarm.id },
              })
            }
          >
            <MockCard>
              <View style={styles.alarmRow}>
                <View style={styles.alarmText}>
                  <Text
                    style={[
                      styles.time,
                      !alarm.isEnabled && styles.disabledText,
                    ]}
                  >
                    {formatTime(alarm)}
                  </Text>
                  <Text
                    style={[
                      styles.weekdays,
                      !alarm.isEnabled && styles.disabledText,
                    ]}
                  >
                    {formatWeekdays(alarm.weekdays)}
                  </Text>
                  <Text style={styles.nextText}>
                    {alarm.isEnabled ? '次回作動 明日' : '停止中'}
                  </Text>
                </View>

                <View style={styles.switchColumn}>
                  <Switch
                    onValueChange={(value) => toggleAlarm(alarm, value)}
                    value={alarm.isEnabled}
                  />
                  <Text style={styles.switchText}>
                    {alarm.isEnabled ? 'ON' : 'OFF'}
                  </Text>
                </View>
              </View>
            </MockCard>
          </Pressable>
        ))}
      </View>
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 18,
  },
  alarmRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  alarmText: {
    flex: 1,
  },
  time: {
    color: '#171717',
    fontSize: 44,
    fontWeight: '900',
  },
  weekdays: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  nextText: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  disabledText: {
    color: '#a3a3a3',
  },
  switchColumn: {
    alignItems: 'center',
    minWidth: 64,
  },
  switchText: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
  },
});
