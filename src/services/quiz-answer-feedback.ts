export type SoundEffectPlayer = {
  play: () => void;
  seekTo: (seconds: number) => Promise<void>;
};

export function replaySoundEffect(player: SoundEffectPlayer): void {
  try {
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Feedback is best-effort and must never interrupt quiz progress.
  }
}
