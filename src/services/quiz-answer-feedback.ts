export type SoundEffectPlayer = {
  play: () => void;
  seekTo: (seconds: number) => Promise<void>;
};

export type ErrorHapticNotifier = () => Promise<void>;

export function replaySoundEffect(player: SoundEffectPlayer): void {
  try {
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Feedback is best-effort and must never interrupt quiz progress.
  }
}

export function playIncorrectQuizAnswerFeedback(
  player: SoundEffectPlayer,
  notifyError: ErrorHapticNotifier,
): void {
  replaySoundEffect(player);

  try {
    void notifyError().catch(() => {});
  } catch {
    // Haptics are best-effort and must never interrupt quiz progress.
  }
}
