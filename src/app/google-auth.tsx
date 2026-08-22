import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/loading';

// The Google OAuth redirect lands here (`sleepyface://google-auth`) because the app's
// Android intent-filter matches the whole `sleepyface://` scheme, not just the specific
// paths `expo-web-browser`'s auth session listens for internally. Without a registered
// route here, Expo Router has nothing to match and briefly shows the built-in "Unmatched
// Route" screen. `signin.tsx`'s own handler already replaces to `/home` or `/profile-setup`
// once the login promise resolves, so this screen only needs to render a neutral loading
// state for that brief window.
export default function GoogleAuthScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <LoadingState message="ログインを確認しています..." variant="screen" />
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
