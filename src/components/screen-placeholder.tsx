import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

type ScreenPlaceholderProps = {
  title: string;
};

export function ScreenPlaceholder({ title }: ScreenPlaceholderProps) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SLEEPY FACE</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/dev-menu')}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
        >
          <Text style={styles.backButtonText}>
            {t('screenPlaceholder.backToMenu')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 56,
  },
  eyebrow: {
    color: '#536dfe',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 14,
  },
  title: {
    color: '#172033',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#536dfe',
    borderRadius: 16,
    marginTop: 24,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backButtonPressed: {
    opacity: 0.82,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
