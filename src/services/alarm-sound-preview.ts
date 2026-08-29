import { createAudioPlayer } from 'expo-audio';
import { Platform, ToastAndroid } from 'react-native';

import type { AlarmSoundId } from '@/constants/alarm-sounds';

// "default" has no bundled asset -- it only resolves to the device's own alarm tone at
// ring time (see AlarmRingingService.kt's resourceIdForSound), so there's nothing to
// preview in-app for it.
const ALARM_SOUND_PREVIEW_SOURCES: Partial<Record<AlarmSoundId, number>> = {
  classic_beep: require('@/assets/sounds/classic_beep.wav'),
  digital_pulse: require('@/assets/sounds/digital_pulse.wav'),
  gentle_chime: require('@/assets/sounds/gentle_chime.wav'),
};

// Lets a user audition an Alarm Sound option by tapping it, without touching the native
// alarm-ringing scheduler at all. Fire-and-forget: each tap gets its own short-lived
// player, released once playback finishes so rapid re-taps don't leak players.
export function previewAlarmSound(
  soundId: AlarmSoundId,
  notPreviewableMessage?: string,
): void {
  const source = ALARM_SOUND_PREVIEW_SOURCES[soundId];

  if (source == null) {
    // A silent tap reads as broken (reported by a closed tester) since there's no
    // in-app way to audition the device's own default tone -- a short explanation
    // beats doing nothing.
    if (notPreviewableMessage && Platform.OS === 'android') {
      ToastAndroid.show(notPreviewableMessage, ToastAndroid.SHORT);
    }

    return;
  }

  const player = createAudioPlayer(source);

  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      subscription.remove();
      player.remove();
    }
  });

  player.play();
}
