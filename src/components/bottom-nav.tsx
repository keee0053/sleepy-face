import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type BottomNavRoute = '/alarms' | '/home' | '/friends' | '/profile';

type BottomNavTab = {
  icon: SymbolViewProps['name'];
  labelKey: string;
  route: BottomNavRoute;
};

const BOTTOM_NAV_TABS: BottomNavTab[] = [
  {
    icon: { ios: 'alarm', android: 'alarm', web: 'alarm' },
    labelKey: 'bottomNav.alarms',
    route: '/alarms',
  },
  {
    icon: { ios: 'house', android: 'home', web: 'home' },
    labelKey: 'bottomNav.home',
    route: '/home',
  },
  {
    icon: { ios: 'person.2', android: 'group', web: 'group' },
    labelKey: 'bottomNav.friends',
    route: '/friends',
  },
  {
    icon: { ios: 'gearshape', android: 'settings', web: 'settings' },
    labelKey: 'bottomNav.settings',
    route: '/profile',
  },
];

type BottomNavProps = {
  activeRoute: BottomNavRoute;
};

export function BottomNav({ activeRoute }: BottomNavProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.bottomNav}>
      {BOTTOM_NAV_TABS.map((tab) => {
        const isActive = tab.route === activeRoute;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={tab.labelKey}
            onPress={() => router.navigate(tab.route as Href)}
            style={styles.bottomNavItem}
          >
            <SymbolView
              name={tab.icon}
              size={24}
              tintColor={isActive ? '#171717' : '#a3a3a3'}
              type="monochrome"
            />
            <Text
              style={[
                styles.bottomNavLabel,
                isActive && styles.bottomNavLabelActive,
              ]}
            >
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: '#f1f1f1',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: 74,
    justifyContent: 'space-around',
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  bottomNavItem: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 54,
  },
  bottomNavLabel: {
    color: '#a3a3a3',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomNavLabelActive: {
    color: '#171717',
  },
});
