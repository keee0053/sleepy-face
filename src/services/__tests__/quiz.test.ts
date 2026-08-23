import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QuizServiceModule = typeof import('../quiz');

let quizService: QuizServiceModule;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const mocks = vi.hoisted(() => ({
  arrayBuffer: vi.fn(),
  dbFrom: vi.fn(),
  fetch: vi.fn(),
  getInfoAsync: vi.fn(),
  getPublicUrl: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///document/',
  getInfoAsync: mocks.getInfoAsync,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.dbFrom,
    storage: {
      from: mocks.storageFrom,
    },
  },
}));

function sequenceRandom(values: number[]) {
  let index = 0;

  return () => {
    const value = values[index];
    index += 1;

    return value ?? 0;
  };
}

function expectQuizServiceError(
  error: unknown,
  code: InstanceType<QuizServiceModule['QuizServiceError']>['code'],
) {
  expect(error).toBeInstanceOf(quizService.QuizServiceError);
  expect(
    (error as InstanceType<QuizServiceModule['QuizServiceError']>).code,
  ).toBe(code);
}

function setupSuccessfulPhotoRecording() {
  mocks.getInfoAsync.mockResolvedValue({ exists: true });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'auth-user-id' } },
    error: null,
  });
  mocks.fetch.mockResolvedValue({ arrayBuffer: mocks.arrayBuffer });
  mocks.arrayBuffer.mockResolvedValue(new ArrayBuffer(3));
  mocks.storageFrom.mockReturnValue({
    getPublicUrl: mocks.getPublicUrl,
    upload: mocks.upload,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({
    data: {
      publicUrl: 'https://storage.example/failure-photo.jpg',
    },
  });
  mocks.dbFrom.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({
    data: {
      created_at: '2026-08-18T00:00:00.000Z',
      id: 'photo-id',
      image_url: 'https://storage.example/failure-photo.jpg',
      profile_id: 'auth-user-id',
    },
    error: null,
  });
}

describe('Quiz Question service', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    quizService = await import('../quiz');
  });

  it('returns null before a quiz starts', () => {
    expect(quizService.getQuizState()).toBeNull();
  });

  it('starts a quiz with a public first Quiz Question', () => {
    const state = quizService.startQuiz({ random: sequenceRandom([0, 0, 0]) });

    expect(state).toEqual({
      attemptNumber: 1,
      correctAnswerCount: 0,
      lastAnswerCorrect: null,
      question: {
        id: 'quiz-question-1',
        prompt: '10 + 10',
      },
      requiredCorrectAnswerCount: 5,
      status: 'active',
    });
    if (state.status !== 'active') {
      throw new Error('Expected active quiz state.');
    }

    expect('answer' in state.question).toBe(false);
    expect(quizService.getQuizState()).toEqual(state);
  });

  it('throws a typed error when submitting before a quiz starts', () => {
    expect(() => quizService.submitQuizAnswer('20')).toThrow(
      quizService.QuizServiceError,
    );

    try {
      quizService.submitQuizAnswer('20');
    } catch (error) {
      expectQuizServiceError(error, 'quiz_not_started');
    }
  });

  it('accepts trimmed integer text for a correct answer', () => {
    quizService.startQuiz({ random: sequenceRandom([0, 0, 0, 0.1, 0.2, 0]) });

    expect(quizService.submitQuizAnswer(' 20 ')).toEqual({
      attemptNumber: 2,
      correctAnswerCount: 1,
      lastAnswerCorrect: true,
      question: {
        id: 'quiz-question-2',
        prompt: '19 + 28',
      },
      requiredCorrectAnswerCount: 5,
      status: 'active',
    });
  });

  it.each(['', '20.0', '20abc', 'not awake'])(
    'treats invalid answer text %s as an incorrect answer',
    (answerText) => {
      quizService.startQuiz({
        random: sequenceRandom([0, 0, 0, 0.2, 0.3, 0]),
      });

      expect(quizService.submitQuizAnswer(answerText)).toEqual({
        attemptNumber: 2,
        correctAnswerCount: 0,
        lastAnswerCorrect: false,
        question: {
          id: 'quiz-question-2',
          prompt: '28 + 37',
        },
        requiredCorrectAnswerCount: 5,
        status: 'active',
      });
    },
  );

  it('advances Quiz Attempt Number but not Quiz Progress after a wrong answer', () => {
    quizService.startQuiz({ random: sequenceRandom([0, 0, 0, 0.4, 0.5, 0]) });

    expect(quizService.submitQuizAnswer('19')).toEqual({
      attemptNumber: 2,
      correctAnswerCount: 0,
      lastAnswerCorrect: false,
      question: {
        id: 'quiz-question-2',
        prompt: '46 + 55',
      },
      requiredCorrectAnswerCount: 5,
      status: 'active',
    });
  });

  it('does not repeat the same prompt when replacing a wrong-answer question', () => {
    quizService.startQuiz({ random: sequenceRandom([0, 0, 0, 0, 0, 0]) });

    expect(quizService.submitQuizAnswer('19')).toMatchObject({
      attemptNumber: 2,
      correctAnswerCount: 0,
      lastAnswerCorrect: false,
      question: {
        id: 'quiz-question-2',
        prompt: '10 - 10',
      },
      status: 'active',
    });
  });

  it('completes after five correct answers', () => {
    quizService.startQuiz({
      random: sequenceRandom([
        0, 0, 0, 0.1, 0.2, 0, 0.3, 0.4, 0, 0.5, 0.6, 0, 0.7, 0.8, 0,
      ]),
    });

    quizService.submitQuizAnswer('20');
    quizService.submitQuizAnswer('47');
    quizService.submitQuizAnswer('83');
    quizService.submitQuizAnswer('119');

    expect(quizService.submitQuizAnswer('154')).toEqual({
      attemptNumber: 5,
      correctAnswerCount: 5,
      lastAnswerCorrect: true,
      question: null,
      requiredCorrectAnswerCount: 5,
      status: 'completed',
    });
  });

  it('throws a typed error when submitting after Quiz Completion', () => {
    quizService.startQuiz({
      random: sequenceRandom([
        0, 0, 0, 0.1, 0.2, 0, 0.3, 0.4, 0, 0.5, 0.6, 0, 0.7, 0.8, 0,
      ]),
    });
    quizService.submitQuizAnswer('20');
    quizService.submitQuizAnswer('47');
    quizService.submitQuizAnswer('83');
    quizService.submitQuizAnswer('119');
    quizService.submitQuizAnswer('154');

    try {
      quizService.submitQuizAnswer('1');
    } catch (error) {
      expectQuizServiceError(error, 'quiz_already_completed');
    }
  });

  it('replaces any previous quiz when starting again', () => {
    quizService.startQuiz({ random: sequenceRandom([0, 0, 0]) });
    quizService.submitQuizAnswer('20');

    expect(
      quizService.startQuiz({ random: sequenceRandom([0.5, 0.2, 0]) }),
    ).toEqual({
      attemptNumber: 1,
      correctAnswerCount: 0,
      lastAnswerCorrect: null,
      question: {
        id: 'quiz-question-1',
        prompt: '55 + 28',
      },
      requiredCorrectAnswerCount: 5,
      status: 'active',
    });
  });

  it('replaces a completed quiz when starting again', () => {
    quizService.startQuiz({
      random: sequenceRandom([0, 0, 0, 0.1, 0.2, 0, 0.3, 0.4, 0]),
    });
    quizService.submitQuizAnswer('20');
    quizService.submitQuizAnswer('47');
    quizService.submitQuizAnswer('83');

    expect(
      quizService.startQuiz({ random: sequenceRandom([0.5, 0.2, 0]) }),
    ).toEqual({
      attemptNumber: 1,
      correctAnswerCount: 0,
      lastAnswerCorrect: null,
      question: {
        id: 'quiz-question-1',
        prompt: '55 + 28',
      },
      requiredCorrectAnswerCount: 5,
      status: 'active',
    });
  });

  it('generates two-digit subtraction questions', () => {
    expect(
      quizService.startQuiz({ random: sequenceRandom([0, 0, 0.9]) }),
    ).toMatchObject({
      question: {
        prompt: '10 - 10',
      },
    });
  });
});

describe('recordQuizFailurePhoto', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mocks.fetch);
    vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));
    quizService = await import('../quiz');
  });

  it('records a quiz-failure photo against the current schema', async () => {
    setupSuccessfulPhotoRecording();

    await expect(
      quizService.recordQuizFailurePhoto('file:///document/failure-photo.jpg'),
    ).resolves.toEqual({
      imageUrl: 'https://storage.example/failure-photo.jpg',
      localUri: 'file:///document/failure-photo.jpg',
      photoRecord: {
        createdAt: '2026-08-18T00:00:00.000Z',
        id: 'photo-id',
        imageUrl: 'https://storage.example/failure-photo.jpg',
        profileId: 'auth-user-id',
      },
      storagePath: 'auth-user-id/1787011200000.jpg',
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith('failure-photos');
    expect(mocks.upload).toHaveBeenCalledWith(
      'auth-user-id/1787011200000.jpg',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/jpeg',
        upsert: false,
      },
    );
    expect(mocks.dbFrom).toHaveBeenCalledWith('photos');
    expect(mocks.insert).toHaveBeenCalledWith({
      image_url: 'https://storage.example/failure-photo.jpg',
      profile_id: 'auth-user-id',
    });
  });

  it('throws a typed error when the local photo is missing', async () => {
    mocks.getInfoAsync.mockResolvedValue({ exists: false });

    await quizService
      .recordQuizFailurePhoto('file:///missing.jpg')
      .catch((error: unknown) => {
        expectQuizServiceError(error, 'local_photo_missing');
      });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it('throws a typed error when the user is not authenticated', async () => {
    mocks.getInfoAsync.mockResolvedValue({ exists: true });
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('not authenticated'),
    });

    await quizService
      .recordQuizFailurePhoto('file:///document/failure-photo.jpg')
      .catch((error: unknown) => {
        expectQuizServiceError(error, 'not_authenticated');
      });
  });

  it('throws a typed error when Storage upload fails', async () => {
    setupSuccessfulPhotoRecording();
    mocks.upload.mockResolvedValue({ error: new Error('storage failed') });

    await quizService
      .recordQuizFailurePhoto('file:///document/failure-photo.jpg')
      .catch((error: unknown) => {
        expectQuizServiceError(error, 'storage_upload_failed');
      });
  });

  it('throws a typed error when photo record insert fails', async () => {
    setupSuccessfulPhotoRecording();
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('insert failed'),
    });

    await quizService
      .recordQuizFailurePhoto('file:///document/failure-photo.jpg')
      .catch((error: unknown) => {
        expectQuizServiceError(error, 'photo_record_insert_failed');
      });
  });
});
