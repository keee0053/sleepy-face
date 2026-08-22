import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingButtonContent } from '@/components/loading';
import {
  ALARM_SOUND_IDS,
  ALARM_SOUND_LABELS,
  DEFAULT_ALARM_SOUND_ID,
  type AlarmSoundId,
} from '@/constants/alarm-sounds';
import { previewAlarmSound } from '@/services/alarm-sound-preview';
import {
  AlarmServiceError,
  createSavedAlarm,
  type Weekday,
} from '@/services/alarm';

const ITEM_HEIGHT = 64;
const WHEEL_VIEWPORT_HEIGHT = 150;
const WHEEL_VERTICAL_PADDING = (WHEEL_VIEWPORT_HEIGHT - ITEM_HEIGHT) / 2;
const WHEEL_REPEAT_COUNT = 80;
const WHEEL_START_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const WEEKDAY_OPTIONS: { label: string; value: Weekday }[] = [
  { label: '月', value: 1 },
  { label: '火', value: 2 },
  { label: '水', value: 3 },
  { label: '木', value: 4 },
  { label: '金', value: 5 },
  { label: '土', value: 6 },
  { label: '日', value: 0 },
];

function formatNumber(value: number): string {
  return String(value).padStart(2, '0');
}

function getCreateAlarmErrorMessage(error: unknown): string {
  if (error instanceof AlarmServiceError) {
    if (error.code === 'weekday_already_used') {
      return '選択した曜日には、すでに別のアラームがあります。';
    }

    if (error.code === 'invalid_alarm_input') {
      return '時刻と曜日を確認してください。';
    }

    if (error.code === 'alarm_scheduling_failed') {
      return 'アラームを端末に登録できませんでした。';
    }

    if (error.code === 'storage_write_failed') {
      return '端末内にアラームを保存できませんでした。';
    }

    if (
      error.code === 'storage_read_failed' ||
      error.code === 'storage_parse_failed'
    ) {
      return '保存済みアラームを読み込めませんでした。';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'アラームを保存できませんでした。';
}

function TimeWheel({
  onChange,
  options,
  value,
}: {
  onChange: (value: number) => void;
  options: number[];
  value: number;
}) {
  const normalizedValue =
    ((value % options.length) + options.length) % options.length;
  const [scrollPreviewValue, setScrollPreviewValue] = useState<number | null>(
    null,
  );
  const loopedOptions = useMemo(
    () => Array.from({ length: WHEEL_REPEAT_COUNT }).flatMap(() => options),
    [options],
  );
  const listRef = useRef<FlatList<number>>(null);
  const initialIndex = WHEEL_START_REPEAT * options.length + normalizedValue;

  const getValueFromOffset = useCallback(
    (offsetY: number) => {
      const nextIndex = Math.round(offsetY / ITEM_HEIGHT);
      const safeIndex = Math.min(
        Math.max(nextIndex, 0),
        loopedOptions.length - 1,
      );

      return loopedOptions[safeIndex] % options.length;
    },
    [loopedOptions, options.length],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollPreviewValue(
        getValueFromOffset(event.nativeEvent.contentOffset.y),
      );
    },
    [getValueFromOffset],
  );

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextValue = getValueFromOffset(event.nativeEvent.contentOffset.y);

      onChange(nextValue);
      setScrollPreviewValue(null);
    },
    [getValueFromOffset, onChange],
  );

  const displayValue = scrollPreviewValue ?? normalizedValue;
  const centeredIndex = WHEEL_START_REPEAT * options.length + normalizedValue;

  useEffect(() => {
    if (scrollPreviewValue !== null) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: centeredIndex,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [centeredIndex, scrollPreviewValue]);

  const getCircularDistance = useCallback(
    (itemValue: number) => {
      const directDistance = Math.abs(itemValue - displayValue);

      return Math.min(directDistance, options.length - directDistance);
    },
    [displayValue, options.length],
  );

  return (
    <View style={styles.timeWheel}>
      <SymbolView
        name={{
          ios: 'chevron.up',
          android: 'keyboard_arrow_up',
          web: 'keyboard_arrow_up',
        }}
        size={22}
        tintColor="#d4d4d4"
        type="monochrome"
      />

      <View style={styles.timeWheelViewport}>
        <FlatList
          contentContainerStyle={styles.timeWheelContent}
          data={loopedOptions}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            index,
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
          })}
          initialNumToRender={7}
          initialScrollIndex={initialIndex}
          keyExtractor={(_, index) => String(index)}
          maxToRenderPerBatch={8}
          nestedScrollEnabled
          onMomentumScrollEnd={handleScrollEnd}
          onScroll={handleScroll}
          onScrollEndDrag={handleScrollEnd}
          ref={listRef}
          removeClippedSubviews
          renderItem={({ item }) => {
            const itemValue = item % options.length;
            const distance = getCircularDistance(itemValue);
            const isActive = distance === 0;

            return (
              <View style={styles.timeItem}>
                <Text
                  style={[
                    styles.timeItemText,
                    isActive
                      ? styles.timeItemTextActive
                      : styles.timeItemTextMuted,
                    distance > 1 && styles.timeItemTextHidden,
                  ]}
                >
                  {formatNumber(itemValue)}
                </Text>
              </View>
            );
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          style={styles.timeWheelScroll}
          windowSize={5}
        />
      </View>

      <SymbolView
        name={{
          ios: 'chevron.down',
          android: 'keyboard_arrow_down',
          web: 'keyboard_arrow_down',
        }}
        size={22}
        tintColor="#d4d4d4"
        type="monochrome"
      />
    </View>
  );
}

export default function AddAlarmScreen() {
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([
    1, 2, 3, 4, 5,
  ]);
  const [soundId, setSoundId] = useState<AlarmSoundId>(DEFAULT_ALARM_SOUND_ID);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const toggleWeekday = useCallback((weekday: Weekday) => {
    setErrorMessage(null);
    setSelectedWeekdays((currentWeekdays) =>
      currentWeekdays.includes(weekday)
        ? currentWeekdays.filter((currentWeekday) => currentWeekday !== weekday)
        : [...currentWeekdays, weekday],
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (selectedWeekdays.length === 0) {
      setErrorMessage('曜日を1つ以上選択してください。');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      await createSavedAlarm({
        hour,
        minute,
        soundId,
        weekdays: selectedWeekdays,
      });
      router.replace('/alarms');
    } catch (error) {
      setErrorMessage(getCreateAlarmErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [hour, minute, selectedWeekdays, soundId]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="アラーム一覧に戻る"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.replace('/alarms')}
            style={styles.closeButton}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={24}
              tintColor="#737373"
              type="monochrome"
            />
          </Pressable>
          <Text style={styles.title}>アラームを追加</Text>
        </View>

        <View style={styles.timeSection}>
          <TimeWheel onChange={setHour} options={HOURS} value={hour} />
          <Text style={styles.timeColon}>:</Text>
          <TimeWheel onChange={setMinute} options={MINUTES} value={minute} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          style={styles.scroll}
        >
          <View style={styles.weekdaySection}>
            <Text style={styles.weekdayTitle}>繰り返し</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_OPTIONS.map((weekday) => {
                const isSelected = selectedWeekdays.includes(weekday.value);

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={weekday.value}
                    onPress={() => toggleWeekday(weekday.value)}
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
                      {weekday.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.soundSection}>
            <Text style={styles.weekdayTitle}>アラーム音</Text>
            <View style={styles.soundList}>
              {ALARM_SOUND_IDS.map((id) => {
                const isSelected = id === soundId;

                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    key={id}
                    onPress={() => {
                      setSoundId(id);
                      previewAlarmSound(id);
                    }}
                    style={[
                      styles.soundOption,
                      isSelected && styles.soundOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.soundOptionText,
                        isSelected && styles.soundOptionTextSelected,
                      ]}
                    >
                      {ALARM_SOUND_LABELS[id]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <View pointerEvents="none" style={styles.footerDivider} />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || isSaving) && styles.saveButtonPressed,
            ]}
          >
            <LoadingButtonContent
              label="保存"
              loading={isSaving}
              loadingLabel="保存中..."
              textStyle={styles.saveButtonText}
              tone="light"
            />
          </Pressable>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
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
    fontSize: 20,
    fontWeight: '800',
  },
  timeSection: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 200,
    paddingVertical: 24,
  },
  timeWheel: {
    alignItems: 'center',
    height: 150,
    justifyContent: 'center',
    width: 96,
  },
  timeWheelScroll: {
    height: WHEEL_VIEWPORT_HEIGHT,
  },
  timeWheelViewport: {
    height: WHEEL_VIEWPORT_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 96,
  },
  timeWheelContent: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  timeItem: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  timeItemText: {
    fontWeight: '800',
  },
  timeItemTextActive: {
    color: '#171717',
    fontSize: 60,
    lineHeight: 66,
  },
  timeItemTextMuted: {
    color: '#d4d4d4',
    fontSize: 24,
    lineHeight: 30,
  },
  timeItemTextHidden: {
    opacity: 0,
  },
  timeColon: {
    color: '#d4d4d4',
    fontSize: 54,
    fontWeight: '800',
    lineHeight: 62,
    marginHorizontal: 6,
  },
  weekdaySection: {
    paddingHorizontal: 40,
    paddingTop: 48,
  },
  weekdayTitle: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 18,
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
  },
  weekdayButton: {
    alignItems: 'center',
    borderColor: '#e5e5e5',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  weekdayButtonSelected: {
    backgroundColor: '#171717',
  },
  weekdayText: {
    color: '#a3a3a3',
    fontSize: 14,
    fontWeight: '800',
  },
  weekdayTextSelected: {
    color: '#ffffff',
  },
  soundSection: {
    paddingHorizontal: 40,
    paddingTop: 32,
  },
  soundList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  soundOption: {
    borderColor: '#e5e5e5',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  soundOptionSelected: {
    backgroundColor: '#171717',
    borderColor: '#171717',
  },
  soundOptionText: {
    color: '#a3a3a3',
    fontSize: 13,
    fontWeight: '800',
  },
  soundOptionTextSelected: {
    color: '#ffffff',
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    marginHorizontal: 36,
    marginTop: 24,
    textAlign: 'center',
  },
  footerDivider: {
    backgroundColor: '#f5f5f5',
    bottom: 104,
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  footer: {
    bottom: 24,
    left: 36,
    position: 'absolute',
    right: 36,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
  },
  saveButtonPressed: {
    opacity: 0.78,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
});
