import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MockAvatar,
  MockBottomNav,
  MockButton,
  MockCard,
  MockPhotoBlock,
  MockScreen,
} from '@/components/mock-ui';
import { mockFailurePhotos, mockFriends, mockUser } from '@/mocks/ui';

export default function HomeScreen() {
  return (
    <MockScreen
      footer={<MockBottomNav active="home" />}
      subtitle="友達の起床失敗写真と次のアラームを確認できます。"
      title="ホーム"
    >
      <MockCard>
        <View style={styles.profileRow}>
          <MockAvatar label={mockUser.displayName} />
          <View style={styles.profileText}>
            <Text style={styles.greeting}>
              おはよう、{mockUser.displayName}
            </Text>
            <Text style={styles.userId}>@{mockUser.userId}</Text>
          </View>
        </View>

        <View style={styles.alarmPanel}>
          <Text style={styles.panelLabel}>NEXT ALARM</Text>
          <Text style={styles.nextAlarm}>{mockUser.alarmSummary}</Text>
        </View>

        <View style={styles.actionRow}>
          <MockButton
            label="アラーム"
            onPress={() => router.navigate('/alarms')}
          />
          <MockButton
            label="友達追加"
            onPress={() => router.navigate('/add-friend')}
            variant="secondary"
          />
        </View>
      </MockCard>

      <Text style={styles.sectionTitle}>友達の失敗写真</Text>
      {mockFailurePhotos.map((photo) => (
        <MockCard key={photo.id}>
          <View style={styles.feedHeader}>
            <MockAvatar label={photo.friendName} />
            <View style={styles.profileText}>
              <Text style={styles.friendName}>{photo.friendName}</Text>
              <Text style={styles.userId}>
                @{photo.userId} ・ {photo.failedAt}
              </Text>
            </View>
          </View>

          <MockPhotoBlock color={photo.accentColor} label={photo.friendName} />
          <Text style={styles.caption}>{photo.caption}</Text>
        </MockCard>
      ))}

      <Text style={styles.sectionTitle}>友達</Text>
      {mockFriends.map((friend) => (
        <Pressable
          accessibilityRole="button"
          key={friend.id}
          style={({ pressed }) => [
            styles.friendRow,
            pressed && styles.friendRowPressed,
          ]}
        >
          <MockAvatar label={friend.displayName} />
          <View style={styles.profileText}>
            <Text style={styles.friendName}>{friend.displayName}</Text>
            <Text style={styles.userId}>@{friend.userId}</Text>
          </View>
          <Text style={styles.statusText}>{friend.statusText}</Text>
        </Pressable>
      ))}
    </MockScreen>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  profileText: {
    flex: 1,
  },
  greeting: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '800',
  },
  userId: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  alarmPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  panelLabel: {
    color: '#737373',
    fontSize: 11,
    fontWeight: '900',
  },
  nextAlarm: {
    color: '#171717',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  sectionTitle: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
    marginTop: 10,
  },
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  friendName: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '900',
  },
  caption: {
    color: '#525252',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 14,
  },
  friendRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  friendRowPressed: {
    opacity: 0.78,
  },
  statusText: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 96,
    textAlign: 'right',
  },
});
