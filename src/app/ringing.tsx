import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MockButton, MockCard, MockScreen } from '@/components/mock-ui';

export default function RingingScreen() {
  return (
    <MockScreen
      subtitle="アラーム音が鳴っている間に、顔撮影とクイズを完了します。"
      title="アラーム"
    >
      <View style={styles.clockCircle}>
        <Text style={styles.currentTime}>07:30</Text>
      </View>

      <MockCard>
        <View style={styles.timerRow}>
          <View>
            <Text style={styles.timerLabel}>経過時間</Text>
            <Text style={styles.timerValue}>00:42</Text>
          </View>
          <View>
            <Text style={styles.timerLabel}>残り時間</Text>
            <Text style={styles.timerValue}>02:18</Text>
          </View>
        </View>
      </MockCard>

      <MockButton
        label="顔を撮影する"
        onPress={() => router.navigate('/face-check')}
      />
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  clockCircle: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 120,
    height: 240,
    justifyContent: 'center',
    marginVertical: 32,
    width: 240,
  },
  currentTime: {
    color: '#171717',
    fontSize: 54,
    fontWeight: '900',
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timerLabel: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  timerValue: {
    color: '#171717',
    fontSize: 28,
    fontWeight: '900',
  },
});
