import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDevQuizQuestionCount,
  setDevQuizQuestionCount,
} from '../dev-quiz-settings';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
  },
}));

describe('Dev Quiz Settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getItem.mockResolvedValue(null);
    mocks.setItem.mockResolvedValue(undefined);
  });

  it('reads the default question count when nothing is stored', async () => {
    await expect(getDevQuizQuestionCount()).resolves.toBe(5);
  });

  it('reads back a stored question count', async () => {
    mocks.getItem.mockResolvedValue('12');

    await expect(getDevQuizQuestionCount()).resolves.toBe(12);
  });

  it('falls back to the default for unparsable stored data', async () => {
    mocks.getItem.mockResolvedValue('not-a-number');

    await expect(getDevQuizQuestionCount()).resolves.toBe(5);
  });

  it('persists a valid question count', async () => {
    await expect(setDevQuizQuestionCount(20)).resolves.toBe(20);

    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:dev-quiz-question-count',
      '20',
    );
  });

  it('clamps a question count below the allowed minimum', async () => {
    await expect(setDevQuizQuestionCount(1)).resolves.toBe(5);

    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:dev-quiz-question-count',
      '5',
    );
  });

  it('clamps a question count above the allowed maximum', async () => {
    await expect(setDevQuizQuestionCount(999)).resolves.toBe(30);

    expect(mocks.setItem).toHaveBeenCalledWith(
      'sleepy-face:dev-quiz-question-count',
      '30',
    );
  });
});
