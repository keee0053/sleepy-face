import { useAudioPlayer } from 'expo-audio';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { replaySoundEffect } from '@/services/quiz-answer-feedback';

const correctAnswerSound = require('../../assets/sounds/quiz-correct.wav');

type QuizAnswerFeedbackContextValue = {
  playCorrectAnswerFeedback: () => void;
};

const QuizAnswerFeedbackContext =
  createContext<QuizAnswerFeedbackContextValue | null>(null);

export function QuizAnswerFeedbackProvider({ children }: PropsWithChildren) {
  const correctAnswerPlayer = useAudioPlayer(correctAnswerSound);

  const playCorrectAnswerFeedback = useCallback(() => {
    replaySoundEffect(correctAnswerPlayer);
  }, [correctAnswerPlayer]);

  const value = useMemo(
    () => ({ playCorrectAnswerFeedback }),
    [playCorrectAnswerFeedback],
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
