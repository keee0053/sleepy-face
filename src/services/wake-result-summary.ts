// Shared by quiz-success.tsx / quiz-failure.tsx / quiz-failure-photo.tsx to build the
// numbers shown on the share card (see components/wake-result-card.tsx) from the same
// firedAt a recordWakeAttemptOutcome() call already computes -- no new tracking needed.
export function formatAlarmTimeLabel(firedAt: string): string {
  const date = new Date(firedAt);

  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

export function formatElapsedLabel(
  firedAt: string,
  now: Date = new Date(),
): string | null {
  const firedAtMs = Date.parse(firedAt);

  if (Number.isNaN(firedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.round((now.getTime() - firedAtMs) / 1000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
