import AsyncStorage from '@react-native-async-storage/async-storage';

const DEV_QUIZ_QUESTION_COUNT_STORAGE_KEY =
  'sleepy-face:dev-quiz-question-count';

// Kept in sync with MIN/MAX/DEFAULT_QUIZ_QUESTION_COUNT in alarm.ts. Not imported from
// there directly to avoid pulling alarm.ts's native alarm-scheduling dependencies into
// this small, storage-only module.
const MIN_QUIZ_QUESTION_COUNT = 5;
const MAX_QUIZ_QUESTION_COUNT = 30;
const DEFAULT_QUIZ_QUESTION_COUNT = 5;

function clampQuestionCount(value: number): number {
  return Math.min(
    Math.max(Math.round(value), MIN_QUIZ_QUESTION_COUNT),
    MAX_QUIZ_QUESTION_COUNT,
  );
}

export async function getDevQuizQuestionCount(): Promise<number> {
  const storedValue = await AsyncStorage.getItem(
    DEV_QUIZ_QUESTION_COUNT_STORAGE_KEY,
  );
  const parsedValue = storedValue === null ? NaN : Number(storedValue);

  if (!Number.isInteger(parsedValue)) {
    return DEFAULT_QUIZ_QUESTION_COUNT;
  }

  return clampQuestionCount(parsedValue);
}

export async function setDevQuizQuestionCount(
  questionCount: number,
): Promise<number> {
  const clampedQuestionCount = clampQuestionCount(questionCount);

  await AsyncStorage.setItem(
    DEV_QUIZ_QUESTION_COUNT_STORAGE_KEY,
    String(clampedQuestionCount),
  );

  return clampedQuestionCount;
}
