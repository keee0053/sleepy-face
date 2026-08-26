import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { LoadingButtonContent, LoadingState } from '@/components/loading';
import { QuestionCountStepper } from '@/components/question-count-stepper';
import {
  ALARM_SOUND_IDS,
  getAlarmSoundLabel,
  DEFAULT_ALARM_SOUND_ID,
  type AlarmSoundId,
} from '@/constants/alarm-sounds';
import {
  AlarmServiceError,
  DEFAULT_QUIZ_QUESTION_COUNT,
  deleteSavedAlarm,
  listSavedAlarms,
  updateSavedAlarm,
  type Weekday,
} from '@/services/alarm';
import { previewAlarmSound } from '@/services/alarm-sound-preview';
import { ensureAlarmPermissions } from '@/services/android-alarm-mechanics';

const ITEM_HEIGHT = 64;
const WHEEL_VIEWPORT_HEIGHT = 150;
const WHEEL_VERTICAL_PADDING = (WHEEL_VIEWPORT_HEIGHT - ITEM_HEIGHT) / 2;
const WHEEL_REPEAT_COUNT = 80;
const WHEEL_START_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_KEYS: Record<Weekday, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

function formatNumber(value: number): string {
  return String(value).padStart(2, '0');
}

function getAlarmErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof AlarmServiceError) {
    if (error.code === 'weekday_already_used') {
      return t('editAlarm.errors.weekdayAlreadyUsed');
    }

    if (error.code === 'invalid_alarm_input') {
      return t('editAlarm.errors.invalidInput');
    }

    if (error.code === 'saved_alarm_not_found') {
      return t('editAlarm.errors.notFound');
    }

    if (error.code === 'alarm_scheduling_failed') {
      return t('editAlarm.errors.schedulingFailed');
    }
  }

  return t('editAlarm.errors.updateFailed');
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
  const previousValue = (displayValue - 1 + options.length) % options.length;
  const nextValue = (displayValue + 1) % options.length;

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
        <View pointerEvents="none" style={styles.timeWheelVisibleValues}>
          <Text style={[styles.timeItemText, styles.timeItemTextMuted]}>
            {formatNumber(previousValue)}
          </Text>
          <Text style={[styles.timeItemText, styles.timeItemTextActive]}>
            {formatNumber(displayValue)}
          </Text>
          <Text style={[styles.timeItemText, styles.timeItemTextMuted]}>
            {formatNumber(nextValue)}
          </Text>
        </View>

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
          removeClippedSubviews
          renderItem={() => <View style={styles.timeItem} />}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          style={[styles.timeWheelScroll, styles.timeWheelTouchLayer]}
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

export default function EditAlarmScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const rawAlarmId = params.id;
  const alarmId = Array.isArray(rawAlarmId) ? rawAlarmId[0] : rawAlarmId;
  const weekdayOptions = useMemo<{ label: string; value: Weekday }[]>(
    () =>
      WEEKDAY_ORDER.map((value) => ({
        label: t(`common.weekdaysShort.${WEEKDAY_KEYS[value]}`),
        value,
      })),
    [t],
  );

  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([
    1, 2, 3, 4, 5,
  ]);
  const [soundId, setSoundId] = useState<AlarmSoundId>(DEFAULT_ALARM_SOUND_ID);
  const [questionCount, setQuestionCount] = useState(
    DEFAULT_QUIZ_QUESTION_COUNT,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadAlarm() {
      if (!alarmId) {
        setErrorMessage(t('editAlarm.errors.noAlarmSpecified'));
        setIsLoading(false);
        return;
      }

      try {
        const savedAlarms = await listSavedAlarms();
        const targetAlarm = savedAlarms.find((alarm) => alarm.id === alarmId);

        if (!targetAlarm) {
          throw new AlarmServiceError(
            'saved_alarm_not_found',
            'Saved Alarm could not be found.',
          );
        }

        if (!isMounted) {
          return;
        }

        setHour(targetAlarm.hour);
        setMinute(targetAlarm.minute);
        setSelectedWeekdays(targetAlarm.weekdays);
        setSoundId(targetAlarm.soundId);
        setQuestionCount(targetAlarm.questionCount);
        setErrorMessage(null);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getAlarmErrorMessage(error, t));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAlarm();

    return () => {
      isMounted = false;
    };
  }, [alarmId, t]);

  const toggleWeekday = useCallback((weekday: Weekday) => {
    setErrorMessage(null);
    setSelectedWeekdays((currentWeekdays) =>
      currentWeekdays.includes(weekday)
        ? currentWeekdays.filter((currentWeekday) => currentWeekday !== weekday)
        : [...currentWeekdays, weekday],
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!alarmId) {
      setErrorMessage(t('editAlarm.errors.noAlarmSpecified'));
      return;
    }

    if (selectedWeekdays.length === 0) {
      setErrorMessage(t('editAlarm.errors.noWeekdaySelected'));
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const permissionResult = await ensureAlarmPermissions();

      if (!permissionResult.granted) {
        setErrorMessage(getPermissionDeniedMessage(permissionResult.reason, t));
        return;
      }

      await updateSavedAlarm(alarmId, {
        hour,
        minute,
        questionCount,
        soundId,
        weekdays: selectedWeekdays,
      });
      router.replace('/alarms');
    } catch (error) {
      setErrorMessage(getAlarmErrorMessage(error, t));
    } finally {
      setIsSaving(false);
    }
  }, [alarmId, hour, minute, questionCount, selectedWeekdays, soundId, t]);

  const handleDelete = useCallback(async () => {
    if (!alarmId) {
      setErrorMessage(t('editAlarm.errors.noAlarmToDelete'));
      return;
    }

    setErrorMessage(null);
    setIsDeleting(true);

    try {
      await deleteSavedAlarm(alarmId);
      router.replace('/alarms');
    } catch (error) {
      setErrorMessage(getAlarmErrorMessage(error, t));
    } finally {
      setIsDeleting(false);
    }
  }, [alarmId, t]);

  const isBusy = isLoading || isSaving || isDeleting;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t('editAlarm.backToAlarmsAccessibilityLabel')}
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
          <Text style={styles.title}>{t('editAlarm.title')}</Text>
        </View>

        {isLoading ? (
          <LoadingState
            message={t('editAlarm.loading')}
            size="large"
            style={styles.loadingArea}
            variant="screen"
          />
        ) : (
          <>
            <View style={styles.timeSection}>
              <TimeWheel onChange={setHour} options={HOURS} value={hour} />
              <Text style={styles.timeColon}>:</Text>
              <TimeWheel
                onChange={setMinute}
                options={MINUTES}
                value={minute}
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              style={styles.scroll}
            >
              <View style={styles.weekdaySection}>
                <Text style={styles.weekdayTitle}>{t('editAlarm.repeat')}</Text>
                <View style={styles.weekdayRow}>
                  {weekdayOptions.map((weekday) => {
                    const isSelected = selectedWeekdays.includes(weekday.value);

                    return (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy}
                        key={weekday.value}
                        onPress={() => toggleWeekday(weekday.value)}
                        style={[
                          styles.weekdayButton,
                          isSelected && styles.weekdayButtonSelected,
                          isBusy && styles.disabled,
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
                <Text style={styles.weekdayTitle}>
                  {t('editAlarm.alarmSound')}
                </Text>
                <View style={styles.soundList}>
                  {ALARM_SOUND_IDS.map((id) => {
                    const isSelected = id === soundId;

                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        disabled={isBusy}
                        key={id}
                        onPress={() => {
                          setSoundId(id);
                          previewAlarmSound(id);
                        }}
                        style={[
                          styles.soundOption,
                          isSelected && styles.soundOptionSelected,
                          isBusy && styles.disabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.soundOptionText,
                            isSelected && styles.soundOptionTextSelected,
                          ]}
                        >
                          {getAlarmSoundLabel(id, t)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.soundSection}>
                <Text style={styles.weekdayTitle}>
                  {t('editAlarm.questionCountLabel')}
                </Text>
                <QuestionCountStepper
                  disabled={isBusy}
                  onChange={setQuestionCount}
                  value={questionCount}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.deleteButton,
                  (pressed || isDeleting) && styles.deleteButtonPressed,
                ]}
              >
                <LoadingButtonContent
                  label={t('editAlarm.deleteButton')}
                  loading={isDeleting}
                  loadingLabel={t('editAlarm.deleting')}
                  textStyle={styles.deleteButtonText}
                />
              </Pressable>
            </ScrollView>
          </>
        )}

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <View pointerEvents="none" style={styles.footerDivider} />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || isSaving || isBusy) && styles.saveButtonPressed,
            ]}
          >
            <LoadingButtonContent
              label={t('common.save')}
              loading={isSaving}
              loadingLabel={t('common.saving')}
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
    fontFamily: 'NoteSansJP_700Bold',
  },
  loadingArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
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
  timeWheelTouchLayer: {
    opacity: 0,
  },
  timeWheelViewport: {
    height: WHEEL_VIEWPORT_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 96,
  },
  timeWheelVisibleValues: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
    fontFamily: 'NotoSansJP_500Medium',
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
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 46,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  deleteButtonPressed: {
    opacity: 0.62,
  },
  deleteButtonText: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '800',
    textDecorationColor: '#171717',
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.58,
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
    fontFamily: 'NOtoSansJP_700Bold',
  },
});
