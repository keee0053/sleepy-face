import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/loading';

export default function Index() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <LoadingState message={t('index.loading')} variant="screen" />
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
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
