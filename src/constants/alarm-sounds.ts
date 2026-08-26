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

// A plain Record can't reactively follow a runtime language switch, so this is a
// function taking `t` from the calling component's own useTranslation(), same pattern
// as getProfileIconLabel in src/constants/profile-icons.ts.
export function getAlarmSoundLabel(
  soundId: AlarmSoundId,
  t: (key: string) => string,
): string {
  return t(`alarmSounds.${soundId === 'default' ? 'deviceDefault' : soundId}`);
}

export function isAlarmSoundId(value: string): value is AlarmSoundId {
  return (ALARM_SOUND_IDS as readonly string[]).includes(value);
}

export function toAlarmSoundId(value: string | null | undefined): AlarmSoundId {
  return value != null && isAlarmSoundId(value)
    ? value
    : DEFAULT_ALARM_SOUND_ID;
}
