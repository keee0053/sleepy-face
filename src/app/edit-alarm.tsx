import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { MockButton, MockCard, MockScreen } from '@/components/mock-ui';
import { mockAlarms, weekdayLabels } from '@/mocks/ui';
import type { Weekday } from '@/services/alarm';

const editableAlarm = mockAlarms[0];
const weekdays = Object.keys(weekdayLabels).map(Number) as Weekday[];

export default function EditAlarmScreen() {
  const [isEnabled, setIsEnabled] = useState(editableAlarm.isEnabled);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>(
    editableAlarm.weekdays,
  );

  function toggleWeekday(weekday: Weekday) {
    setSelectedWeekdays((currentWeekdays) =>
      currentWeekdays.includes(weekday)
        ? currentWeekdays.filter((item) => item !== weekday)
        : [...currentWeekdays, weekday].sort(),
    );
  }

  return (
    <MockScreen
      backTo="/alarms"
      subtitle="時刻、曜日、有効状態を確認して保存できます。"
      title="アラーム編集"
    >
      <MockCard>
        <View style={styles.enabledRow}>
          <View>
            <Text style={styles.label}>状態</Text>
            <Text style={styles.enabledText}>{isEnabled ? 'ON' : 'OFF'}</Text>
          </View>
          <Switch onValueChange={setIsEnabled} value={isEnabled} />
        </View>
      </MockCard>

      <MockCard>
        <Text style={styles.label}>時刻</Text>
        <Text style={styles.timeText}>07:30</Text>
      </MockCard>

      <MockCard>
        <Text style={styles.label}>繰り返す曜日</Text>
        <View style={styles.weekdayGrid}>
          {weekdays.map((weekday) => {
            const isSelected = selectedWeekdays.includes(weekday);

            return (
              <Pressable
                accessibilityRole="button"
                key={weekday}
                onPress={() => toggleWeekday(weekday)}
                style={[
                  styles.weekdayButton,
                  isSelected && styles.weekdayButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.weekdayText,
                    isSelected && styles.weekdayTextSelected,
                  ]}
                >
                  {weekdayLabels[weekday]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </MockCard>

      <View style={styles.actions}>
        <MockButton label="保存" onPress={() => router.navigate('/alarms')} />
        <MockButton
          label="削除"
          onPress={() => router.navigate('/alarms')}
          variant="danger"
        />
      </View>
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  enabledRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  enabledText: {
    color: '#171717',
    fontSize: 22,
    fontWeight: '900',
  },
  timeText: {
    color: '#171717',
    fontSize: 64,
    fontWeight: '900',
    textAlign: 'center',
  },
  weekdayGrid: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  weekdayButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderRadius: 18,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  weekdayButtonSelected: {
    backgroundColor: '#171717',
    borderColor: '#171717',
  },
  weekdayText: {
    color: '#525252',
    fontSize: 13,
    fontWeight: '900',
  },
  weekdayTextSelected: {
    color: '#ffffff',
  },
  actions: {
    gap: 12,
  },
});
