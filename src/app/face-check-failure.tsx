import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MockButton, MockScreen } from '@/components/mock-ui';

export default function FaceCheckFailureScreen() {
  return (
    <MockScreen title="">
      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>!</Text>
        </View>
        <Text style={styles.title}>顔を検出できません</Text>
        <Text style={styles.subtitle}>
          顔が撮影範囲に入るようにして、もう一度撮影してください。
        </Text>
      </View>

      <View style={styles.actions}>
        <MockButton
          label="再撮影する"
          onPress={() => router.navigate('/face-check')}
        />
        <MockButton
          label="アラームへ戻る"
          onPress={() => router.navigate('/ringing')}
          variant="secondary"
        />
      </View>
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
    fontWeight: '900',
  },
  title: {
    color: '#171717',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 14,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
  },
});
