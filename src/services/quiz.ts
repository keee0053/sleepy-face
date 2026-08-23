import {
  FailurePhotoUploadError,
  type FailurePhotoUploadErrorCode,
  type UploadedFailurePhoto,
  uploadFailurePhoto,
} from './wakeChallenge';

export type PublicQuizQuestion = {
  id: string;
  prompt: string;
};

export type QuizState =
  | {
      status: 'active';
      question: PublicQuizQuestion;
      correctAnswerCount: number;
      attemptNumber: number;
      requiredCorrectAnswerCount: 5;
      lastAnswerCorrect: boolean | null;
    }
  | {
      status: 'completed';
      question: null;
      correctAnswerCount: number;
      attemptNumber: number;
      requiredCorrectAnswerCount: 5;
      lastAnswerCorrect: boolean;
    };

export type QuizFailurePhotoRecord = UploadedFailurePhoto;

export type QuizServiceErrorCode =
  | 'quiz_not_started'
  | 'quiz_already_completed'
  | FailurePhotoUploadErrorCode
  | 'unexpected_error';

type QuizQuestion = PublicQuizQuestion & {
  answer: number;
  leftOperand: number;
  operator: '+' | '-';
  rightOperand: number;
};

type ActiveQuizSession = {
  status: 'active';
  question: QuizQuestion;
  correctAnswerCount: number;
  attemptNumber: number;
  random: () => number;
  lastAnswerCorrect: boolean | null;
};

type CompletedQuizSession = {
  status: 'completed';
  correctAnswerCount: number;
  attemptNumber: number;
  lastAnswerCorrect: boolean;
};

type QuizSession = ActiveQuizSession | CompletedQuizSession;

type StartQuizOptions = {
  random?: () => number;
};

const REQUIRED_CORRECT_ANSWER_COUNT = 5;
const MIN_TWO_DIGIT_NUMBER = 10;
const TWO_DIGIT_NUMBER_RANGE = 90;

let quizSession: QuizSession | null = null;

export class QuizServiceError extends Error {
  constructor(
    public readonly code: QuizServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'QuizServiceError';
  }
}

function randomTwoDigitInteger(random: () => number): number {
  return MIN_TWO_DIGIT_NUMBER + Math.floor(random() * TWO_DIGIT_NUMBER_RANGE);
}

function generateQuizQuestion(
  attemptNumber: number,
  random: () => number,
): QuizQuestion {
  const leftOperand = randomTwoDigitInteger(random);
  const rightOperand = randomTwoDigitInteger(random);
  const operator = random() < 0.5 ? '+' : '-';
  const answer =
    operator === '+' ? leftOperand + rightOperand : leftOperand - rightOperand;

  return {
    answer,
    id: `quiz-question-${attemptNumber}`,
    leftOperand,
    operator,
    prompt: `${leftOperand} ${operator} ${rightOperand}`,
    rightOperand,
  };
}

function flipRepeatedQuizQuestion(
  attemptNumber: number,
  previousQuestion: QuizQuestion,
): QuizQuestion {
  const operator = previousQuestion.operator === '+' ? '-' : '+';
  const answer =
    operator === '+'
      ? previousQuestion.leftOperand + previousQuestion.rightOperand
      : previousQuestion.leftOperand - previousQuestion.rightOperand;

  return {
    answer,
    id: `quiz-question-${attemptNumber}`,
    leftOperand: previousQuestion.leftOperand,
    operator,
    prompt: `${previousQuestion.leftOperand} ${operator} ${previousQuestion.rightOperand}`,
    rightOperand: previousQuestion.rightOperand,
  };
}

function generateReplacementQuizQuestion(
  attemptNumber: number,
  previousQuestion: QuizQuestion,
  random: () => number,
): QuizQuestion {
  const nextQuestion = generateQuizQuestion(attemptNumber, random);

  if (nextQuestion.prompt !== previousQuestion.prompt) {
    return nextQuestion;
  }

  return flipRepeatedQuizQuestion(attemptNumber, previousQuestion);
}

function toPublicQuizState(session: QuizSession): QuizState {
  if (session.status === 'completed') {
    return {
      attemptNumber: session.attemptNumber,
      correctAnswerCount: session.correctAnswerCount,
      lastAnswerCorrect: session.lastAnswerCorrect,
      question: null,
      requiredCorrectAnswerCount: REQUIRED_CORRECT_ANSWER_COUNT,
      status: 'completed',
    };
  }

  return {
    attemptNumber: session.attemptNumber,
    correctAnswerCount: session.correctAnswerCount,
    lastAnswerCorrect: session.lastAnswerCorrect,
    question: {
      id: session.question.id,
      prompt: session.question.prompt,
    },
    requiredCorrectAnswerCount: REQUIRED_CORRECT_ANSWER_COUNT,
    status: 'active',
  };
}

function parseAnswerText(answerText: string): number | null {
  const trimmedAnswer = answerText.trim();

  if (!/^-?\d+$/.test(trimmedAnswer)) {
    return null;
  }

  const answer = Number(trimmedAnswer);

  if (!Number.isSafeInteger(answer)) {
    return null;
  }

  return answer;
}

function toQuizServiceError(error: unknown): QuizServiceError {
  if (error instanceof QuizServiceError) {
    return error;
  }

  if (error instanceof FailurePhotoUploadError) {
    return new QuizServiceError(error.code, error.message, error);
  }

  return new QuizServiceError(
    'unexpected_error',
    'Quiz service operation failed unexpectedly.',
    error,
  );
}

export function startQuiz(options: StartQuizOptions = {}): QuizState {
  const random = options.random ?? Math.random;

  quizSession = {
    attemptNumber: 1,
    correctAnswerCount: 0,
    lastAnswerCorrect: null,
    question: generateQuizQuestion(1, random),
    random,
    status: 'active',
  };

  return toPublicQuizState(quizSession);
}

export function getQuizState(): QuizState | null {
  return quizSession ? toPublicQuizState(quizSession) : null;
}

export function submitQuizAnswer(answerText: string): QuizState {
  if (!quizSession) {
    throw new QuizServiceError(
      'quiz_not_started',
      'Quiz answer submission requires an active quiz.',
    );
  }

  if (quizSession.status === 'completed') {
    throw new QuizServiceError(
      'quiz_already_completed',
      'Quiz answer submission cannot continue after Quiz Completion.',
    );
  }

  const parsedAnswer = parseAnswerText(answerText);
  const isCorrect = parsedAnswer === quizSession.question.answer;
  const correctAnswerCount =
    quizSession.correctAnswerCount + (isCorrect ? 1 : 0);

  if (correctAnswerCount >= REQUIRED_CORRECT_ANSWER_COUNT) {
    quizSession = {
      attemptNumber: quizSession.attemptNumber,
      correctAnswerCount,
      lastAnswerCorrect: true,
      status: 'completed',
    };

    return toPublicQuizState(quizSession);
  }

  const nextAttemptNumber = quizSession.attemptNumber + 1;

  quizSession = {
    attemptNumber: nextAttemptNumber,
    correctAnswerCount,
    lastAnswerCorrect: isCorrect,
    question: generateReplacementQuizQuestion(
      nextAttemptNumber,
      quizSession.question,
      quizSession.random,
    ),
    random: quizSession.random,
    status: 'active',
  };

  return toPublicQuizState(quizSession);
}

export async function recordQuizFailurePhoto(
  localPhotoUri: string,
): Promise<QuizFailurePhotoRecord> {
  try {
    return await uploadFailurePhoto(localPhotoUri);
  } catch (error) {
    throw toQuizServiceError(error);
  }
}
