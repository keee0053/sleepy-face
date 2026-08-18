import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  MockButton,
  MockCard,
  MockPhotoBlock,
  MockScreen,
} from '@/components/mock-ui';

export default function QuizFailureScreen() {
  return (
    <MockScreen title="">
      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>!</Text>
        </View>
        <Text style={styles.title}>起床失敗</Text>
        <Text style={styles.subtitle}>制限時間を超過しました</Text>
      </View>

      <MockCard>
        <Text style={styles.cardTitle}>写真が公開されました</Text>
        <Text style={styles.cardText}>
          友達のホーム画面に、今回撮影した失敗写真が表示されます。
        </Text>
        <MockPhotoBlock color="#e5e5e5" label="me" />
      </MockCard>

      <MockButton label="ホームへ" onPress={() => router.navigate('/home')} />
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 360,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    marginBottom: 34,
    width: 96,
  },
  icon: {
    color: '#171717',
    fontSize: 48,
    fontWeight: '900',
  },
  title: {
    color: '#171717',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 14,
  },
  cardTitle: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  cardText: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 14,
  },
});
