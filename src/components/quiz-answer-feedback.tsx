import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import {
  playIncorrectQuizAnswerFeedback,
  replaySoundEffect,
} from '@/services/quiz-answer-feedback';

const correctAnswerSound = require('../../assets/sounds/quiz-correct.wav');
const incorrectAnswerSound = require('../../assets/sounds/quiz-incorrect.wav');

type QuizAnswerFeedbackContextValue = {
  playCorrectAnswerFeedback: () => void;
  playIncorrectAnswerFeedback: () => void;
};

const QuizAnswerFeedbackContext =
  createContext<QuizAnswerFeedbackContextValue | null>(null);

export function QuizAnswerFeedbackProvider({ children }: PropsWithChildren) {
  const correctAnswerPlayer = useAudioPlayer(correctAnswerSound);
  const incorrectAnswerPlayer = useAudioPlayer(incorrectAnswerSound);

  const playCorrectAnswerFeedback = useCallback(() => {
    replaySoundEffect(correctAnswerPlayer);
  }, [correctAnswerPlayer]);

  const playIncorrectAnswerFeedback = useCallback(() => {
    playIncorrectQuizAnswerFeedback(incorrectAnswerPlayer, () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    );
  }, [incorrectAnswerPlayer]);

  const value = useMemo(
    () => ({ playCorrectAnswerFeedback, playIncorrectAnswerFeedback }),
    [playCorrectAnswerFeedback, playIncorrectAnswerFeedback],
  );

  return (
    <QuizAnswerFeedbackContext.Provider value={value}>
      {children}
    </QuizAnswerFeedbackContext.Provider>
  );
}

export function useQuizAnswerFeedback(): QuizAnswerFeedbackContextValue {
  const context = useContext(QuizAnswerFeedbackContext);

  if (!context) {
    throw new Error(
      'useQuizAnswerFeedback must be used within QuizAnswerFeedbackProvider.',
    );
  }

  return context;
}
