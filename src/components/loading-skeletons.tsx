import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const FEED_SKELETON_ITEMS = ['feed-1', 'feed-2'];
const ALARM_SKELETON_ITEMS = ['alarm-1', 'alarm-2'];
const FRIEND_SKELETON_ITEMS = ['friend-1', 'friend-2', 'friend-3', 'friend-4'];

type SkeletonBlockProps = {
  style: StyleProp<ViewStyle>;
};

function SkeletonBlock({ style }: SkeletonBlockProps) {
  return <View importantForAccessibility="no" style={[styles.block, style]} />;
}

type SkeletonContainerProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

function SkeletonContainer({
  accessibilityLabel,
  children,
  style,
}: SkeletonContainerProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={style}
    >
      {children}
    </View>
  );
}

export function FeedLoadingSkeleton() {
  return (
    <SkeletonContainer
      accessibilityLabel="フィードを読み込み中"
      style={styles.feedList}
    >
      {FEED_SKELETON_ITEMS.map((item) => (
        <View key={item} style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <SkeletonBlock style={styles.feedAvatar} />
            <View style={styles.feedHeaderText}>
              <SkeletonBlock style={styles.feedName} />
              <SkeletonBlock style={styles.feedDate} />
            </View>
          </View>
          <SkeletonBlock style={styles.feedPhoto} />
        </View>
      ))}
    </SkeletonContainer>
  );
}

export function AlarmListLoadingSkeleton() {
  return (
    <SkeletonContainer
      accessibilityLabel="アラームを読み込み中"
      style={styles.alarmList}
    >
      {ALARM_SKELETON_ITEMS.map((item) => (
        <View key={item} style={styles.alarmCard}>
          <View style={styles.alarmText}>
            <SkeletonBlock style={styles.alarmTime} />
            <SkeletonBlock style={styles.alarmWeekdays} />
          </View>
          <SkeletonBlock style={styles.alarmSwitch} />
        </View>
      ))}
    </SkeletonContainer>
  );
}

export function FriendListLoadingSkeleton() {
  return (
    <SkeletonContainer
      accessibilityLabel="友達情報を読み込み中"
      style={styles.friendList}
    >
      {FRIEND_SKELETON_ITEMS.map((item) => (
        <View key={item} style={styles.friendCard}>
          <SkeletonBlock style={styles.friendAvatar} />
          <View style={styles.friendText}>
            <SkeletonBlock style={styles.friendName} />
            <SkeletonBlock style={styles.friendId} />
          </View>
        </View>
      ))}
    </SkeletonContainer>
  );
}

export function ProfileLoadingSkeleton() {
  return (
    <SkeletonContainer
      accessibilityLabel="プロフィールを読み込み中"
      style={styles.profile}
    >
      <SkeletonBlock style={styles.profileAvatar} />
      <View style={styles.profileIcons}>
        {FRIEND_SKELETON_ITEMS.map((item) => (
          <SkeletonBlock key={item} style={styles.profileIcon} />
        ))}
      </View>
      <SkeletonBlock style={styles.profileLabel} />
      <SkeletonBlock style={styles.profileField} />
      <SkeletonBlock style={styles.profileLabel} />
      <SkeletonBlock style={styles.profileField} />
      <SkeletonBlock style={styles.profileButton} />
    </SkeletonContainer>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#f1f1f1',
  },
  feedList: {
    gap: 16,
    paddingBottom: 116,
  },
  feedCard: {
    gap: 12,
  },
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  feedAvatar: {
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  feedHeaderText: {
    flex: 1,
    gap: 6,
  },
  feedName: {
    borderRadius: 6,
    height: 14,
    width: '42%',
  },
  feedDate: {
    borderRadius: 5,
    height: 10,
    width: '20%',
  },
  feedPhoto: {
    aspectRatio: 1,
    borderRadius: 16,
    width: '100%',
  },
  alarmList: {
    gap: 14,
    paddingBottom: 116,
  },
  alarmCard: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 110,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  alarmText: {
    flex: 1,
    gap: 10,
  },
  alarmTime: {
    borderRadius: 8,
    height: 34,
    width: 116,
  },
  alarmWeekdays: {
    borderRadius: 6,
    height: 14,
    width: 92,
  },
  alarmSwitch: {
    borderRadius: 999,
    height: 28,
    width: 52,
  },
  friendList: {
    gap: 10,
    paddingBottom: 116,
  },
  friendCard: {
    alignItems: 'center',
    borderColor: '#f5f5f5',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    padding: 12,
  },
  friendAvatar: {
    borderRadius: 24,
    height: 48,
    marginRight: 12,
    width: 48,
  },
  friendText: {
    flex: 1,
    gap: 7,
  },
  friendName: {
    borderRadius: 6,
    height: 14,
    width: '44%',
  },
  friendId: {
    borderRadius: 5,
    height: 10,
    width: '34%',
  },
  profile: {
    alignItems: 'stretch',
    paddingBottom: 116,
    paddingTop: 8,
  },
  profileAvatar: {
    alignSelf: 'center',
    borderRadius: 56,
    height: 112,
    marginBottom: 20,
    width: 112,
  },
  profileIcons: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  profileIcon: {
    borderRadius: 26,
    height: 52,
    width: 52,
  },
  profileLabel: {
    borderRadius: 5,
    height: 12,
    marginBottom: 8,
    width: 72,
  },
  profileField: {
    borderRadius: 12,
    height: 56,
    marginBottom: 18,
    width: '100%',
  },
  profileButton: {
    borderRadius: 12,
    height: 56,
    marginTop: 6,
    width: '100%',
  },
});
