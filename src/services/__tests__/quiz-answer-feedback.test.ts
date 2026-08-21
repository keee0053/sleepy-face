import { describe, expect, it, vi } from 'vitest';

import { replaySoundEffect } from '../quiz-answer-feedback';

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
