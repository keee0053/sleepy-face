import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MockButton, MockCard, MockScreen } from '@/components/mock-ui';
import { weekdayLabels } from '@/mocks/ui';
import type { Weekday } from '@/services/alarm';

const weekdays = Object.keys(weekdayLabels).map(Number) as Weekday[];

export default function AddAlarmScreen() {
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([
    1, 2, 3, 4, 5,
  ]);

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
      subtitle="MVPでは時刻と曜日を指定して、ローカルにアラームを保存します。"
      title="アラーム追加"
    >
      <MockCard>
        <Text style={styles.label}>時刻</Text>
        <View style={styles.timePicker}>
          <Text style={styles.timeText}>07</Text>
          <Text style={styles.separator}>:</Text>
          <Text style={styles.timeText}>30</Text>
        </View>
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

      <MockCard>
        <Text style={styles.label}>アラーム名</Text>
        <TextInput
          placeholder="朝のアラーム"
          placeholderTextColor="#a3a3a3"
          style={styles.input}
        />

        <Text style={[styles.label, styles.soundLabel]}>アラーム音</Text>
        <View style={styles.soundRow}>
          <Text style={styles.soundText}>標準アラーム</Text>
          <Text style={styles.soundArrow}>›</Text>
        </View>
      </MockCard>

      <MockButton label="保存" onPress={() => router.navigate('/alarms')} />
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 12,
  },
  timePicker: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  timeText: {
    color: '#171717',
    fontSize: 64,
    fontWeight: '900',
  },
  separator: {
    color: '#171717',
    fontSize: 56,
    fontWeight: '800',
    marginHorizontal: 8,
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
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderRadius: 12,
    borderWidth: 1,
    color: '#171717',
    fontSize: 16,
    fontWeight: '700',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  soundLabel: {
    marginTop: 18,
  },
  soundRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  soundText: {
    color: '#171717',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  soundArrow: {
    color: '#737373',
    fontSize: 28,
  },
});
