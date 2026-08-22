// Keep in sync with the native raw resource names in
// modules/alarm-ringing/android/src/main/res/raw and the `when` mapping in
// AlarmRingingService.kt (resourceIdForSound).
export const ALARM_SOUND_IDS = [
  'default',
  'classic_beep',
  'digital_pulse',
  'gentle_chime',
] as const;

export type AlarmSoundId = (typeof ALARM_SOUND_IDS)[number];

export const DEFAULT_ALARM_SOUND_ID: AlarmSoundId = 'default';

export const ALARM_SOUND_LABELS: Record<AlarmSoundId, string> = {
  classic_beep: 'クラシックビープ',
  default: '端末のデフォルト',
  digital_pulse: 'デジタルパルス',
  gentle_chime: 'やさしいチャイム',
};

export function isAlarmSoundId(value: string): value is AlarmSoundId {
  return (ALARM_SOUND_IDS as readonly string[]).includes(value);
}

export function toAlarmSoundId(value: string | null | undefined): AlarmSoundId {
  return value != null && isAlarmSoundId(value)
    ? value
    : DEFAULT_ALARM_SOUND_ID;
}
