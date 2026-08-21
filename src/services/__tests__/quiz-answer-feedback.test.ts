import { describe, expect, it, vi } from 'vitest';

import {
  playIncorrectQuizAnswerFeedback,
  replaySoundEffect,
} from '../quiz-answer-feedback';

describe('replaySoundEffect', () => {
  it('rewinds and plays a sound effect', () => {
    const seekTo = vi.fn().mockResolvedValue(undefined);
    const play = vi.fn();

    replaySoundEffect({ play, seekTo });

    expect(seekTo).toHaveBeenCalledWith(0);
    expect(play).toHaveBeenCalledOnce();
  });

  it('does not throw when playback fails synchronously', () => {
    const playbackError = new Error('Audio is unavailable.');

    expect(() =>
      replaySoundEffect({
        play: () => {
          throw playbackError;
        },
        seekTo: vi.fn().mockResolvedValue(undefined),
      }),
    ).not.toThrow();
  });

  it('handles an asynchronous rewind failure', async () => {
    const rewindError = new Error('Audio is not loaded.');

    replaySoundEffect({
      play: vi.fn(),
      seekTo: vi.fn().mockRejectedValue(rewindError),
    });

    await Promise.resolve();
  });
});

describe('playIncorrectQuizAnswerFeedback', () => {
  it('plays the incorrect sound and triggers an error haptic', () => {
    const play = vi.fn();
    const seekTo = vi.fn().mockResolvedValue(undefined);
    const notifyError = vi.fn().mockResolvedValue(undefined);

    playIncorrectQuizAnswerFeedback({ play, seekTo }, notifyError);

    expect(seekTo).toHaveBeenCalledWith(0);
    expect(play).toHaveBeenCalledOnce();
    expect(notifyError).toHaveBeenCalledOnce();
  });

  it('does not throw when haptics fail synchronously', () => {
    expect(() =>
      playIncorrectQuizAnswerFeedback(
        {
          play: vi.fn(),
          seekTo: vi.fn().mockResolvedValue(undefined),
        },
        () => {
          throw new Error('Haptics are unavailable.');
        },
      ),
    ).not.toThrow();
  });

  it('handles an asynchronous haptic failure', async () => {
    playIncorrectQuizAnswerFeedback(
      {
        play: vi.fn(),
        seekTo: vi.fn().mockResolvedValue(undefined),
      },
      vi.fn().mockRejectedValue(new Error('Haptics are unavailable.')),
    );

    await Promise.resolve();
  });
});
