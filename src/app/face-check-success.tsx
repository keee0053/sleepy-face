import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MockButton, MockScreen } from '@/components/mock-ui';

export default function FaceCheckSuccessScreen() {
  return (
    <MockScreen title="">
      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>✓</Text>
        </View>
        <Text style={styles.title}>顔判定成功！</Text>
        <Text style={styles.subtitle}>顔を検出できました</Text>
      </View>

      <MockButton label="クイズへ" onPress={() => router.navigate('/quiz')} />
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 500,
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
    fontWeight: '800',
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
});
