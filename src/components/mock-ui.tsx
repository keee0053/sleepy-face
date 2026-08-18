import { type Href, router } from 'expo-router';
import type React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MockScreenProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  backTo?: Href;
  footer?: React.ReactNode;
};

type MockButtonProps = {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

type BottomNavProps = {
  active: 'home' | 'alarms' | 'friends' | 'profile';
};

type FloatingActionButtonProps = {
  onPress: PressableProps['onPress'];
};

export function MockScreen({
  backTo,
  children,
  footer,
  subtitle,
  title,
}: MockScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {backTo && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate(backTo)}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>
          )}
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {children}
      </ScrollView>

      {footer}
    </SafeAreaView>
  );
}

export function MockButton({
  disabled,
  label,
  onPress,
  variant = 'primary',
}: MockButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.secondaryButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MockBottomNav({ active }: BottomNavProps) {
  const items = [
    { icon: '⌂', key: 'home', label: 'ホーム', route: '/home' },
    { icon: '○', key: 'alarms', label: 'アラーム', route: '/alarms' },
    { icon: '+', key: 'friends', label: '友達', route: '/add-friend' },
    { icon: '⚙', key: 'profile', label: '設定', route: '/profile-setup' },
  ] as const;

  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const isActive = active === item.key;

        return (
          <Pressable
            accessibilityRole="button"
            key={item.key}
            onPress={() => router.navigate(item.route)}
            style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
          >
            <Text style={[styles.navIcon, isActive && styles.navIconActive]}>
              {item.icon}
            </Text>
            <Text
              style={[styles.navText, isActive && styles.navTextActive]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MockFloatingActionButton({
  onPress,
}: FloatingActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel="アラームを追加"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
    >
      <Text style={styles.fabText}>+</Text>
    </Pressable>
  );
}

export function MockCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function MockAvatar({ label }: { label: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function MockPhotoBlock({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <View style={[styles.photoBlock, { backgroundColor: color }]}>
      <View style={styles.photoFace}>
        <Text style={styles.photoFaceText}>{label.slice(0, 1)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 124,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginBottom: 12,
    width: 44,
  },
  backButtonText: {
    color: '#171717',
    fontSize: 40,
    fontWeight: '300',
    lineHeight: 44,
  },
  title: {
    color: '#171717',
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: '#737373',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  primaryButton: {
    backgroundColor: '#171717',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderColor: '#d4d4d4',
    borderWidth: 1,
  },
  dangerButton: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#171717',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.78,
  },
  nav: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e5e5',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingBottom: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 58,
  },
  navIcon: {
    color: '#a3a3a3',
    fontSize: 23,
    fontWeight: '900',
    height: 26,
    lineHeight: 26,
  },
  navIconActive: {
    color: '#171717',
  },
  navText: {
    color: '#a3a3a3',
    fontSize: 10,
    fontWeight: '800',
  },
  navTextActive: {
    color: '#171717',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 28,
    bottom: 102,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 28,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: 56,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '400',
    lineHeight: 38,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '800',
  },
  photoBlock: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 16,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  photoFace: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  photoFaceText: {
    color: '#171717',
    fontSize: 34,
    fontWeight: '800',
  },
});
