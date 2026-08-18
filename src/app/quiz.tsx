import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MockButton, MockCard, MockScreen } from '@/components/mock-ui';
import { mockQuizQuestions } from '@/mocks/ui';

export default function QuizScreen() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const currentQuestion = mockQuizQuestions[questionIndex];
  const correctCount = questionIndex;

  function submitAnswer() {
    if (questionIndex >= mockQuizQuestions.length - 1) {
      router.navigate('/quiz-success');
      return;
    }

    setQuestionIndex((currentIndex) => currentIndex + 1);
    setAnswer('');
  }

  return (
    <MockScreen
      subtitle="3問正解すると起床成功です。制限時間内に回答してください。"
      title="クイズ"
    >
      <MockCard>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>正解数</Text>
          <Text style={styles.progressValue}>{correctCount} / 3</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${correctCount * 33}%` }]}
          />
        </View>
      </MockCard>

      <MockCard>
        <Text style={styles.timerLabel}>残り時間</Text>
        <Text style={styles.timer}>01:48</Text>
      </MockCard>

      <View style={styles.questionBlock}>
        <Text style={styles.question}>{currentQuestion.prompt}</Text>
      </View>

      <TextInput
        keyboardType="number-pad"
        onChangeText={setAnswer}
        placeholder="答えを入力"
        placeholderTextColor="#a3a3a3"
        style={styles.answerInput}
        value={answer}
      />

      <View style={styles.actions}>
        <MockButton label="回答する" onPress={submitAnswer} />
        <MockButton
          label="時間切れの表示確認"
          onPress={() => router.navigate('/quiz-failure')}
          variant="secondary"
        />
      </View>
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '900',
  },
  progressValue: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '900',
  },
  progressTrack: {
    backgroundColor: '#e5e5e5',
    borderRadius: 6,
    height: 8,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#171717',
    height: '100%',
  },
  timerLabel: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  timer: {
    color: '#171717',
    fontSize: 42,
    fontWeight: '900',
  },
  questionBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  question: {
    color: '#171717',
    fontSize: 52,
    fontWeight: '900',
  },
  answerInput: {
    backgroundColor: '#fafafa',
    borderColor: '#d4d4d4',
    borderRadius: 16,
    borderWidth: 1,
    color: '#171717',
    fontSize: 28,
    fontWeight: '900',
    minHeight: 64,
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
    marginTop: 20,
  },
});
