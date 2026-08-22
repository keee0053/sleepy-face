import { Image } from 'expo-image';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PhotoRealMoji } from '@/services/photo-realmojis';

type PhotoRealMojiBarProps = {
  onCompose: () => void;
  realMojis: PhotoRealMoji[];
};

function formatReactionTime(isoDate: string): string {
  const date = new Date(isoDate);

  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

export function PhotoRealMojiBar({
  onCompose,
  realMojis,
}: PhotoRealMojiBarProps) {
  const [isListVisible, setIsListVisible] = useState(false);
  const viewerRealMoji = realMojis.find((realMoji) => realMoji.isOwn);
  const previewRealMojis = realMojis.slice(0, 3);

  const renderRealMoji: ListRenderItem<PhotoRealMoji> = ({ item }) => (
    <View style={styles.listRow}>
      <View style={styles.listPhotoWrapper}>
        <Image
          contentFit="cover"
          source={{ uri: item.imageUrl }}
          style={styles.listPhoto}
        />
        <Text style={styles.listEmoji}>{item.emoji}</Text>
      </View>

      <View style={styles.listRowCopy}>
        <Text style={styles.listDisplayName}>
          {item.isOwn ? '自分' : item.displayName}
        </Text>
        <Text style={styles.listTime}>
          {formatReactionTime(item.updatedAt)}
        </Text>
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.bar}>
        {realMojis.length > 0 && (
          <Pressable
            accessibilityLabel={`${realMojis.length}件のRealMojiを見る`}
            accessibilityRole="button"
            onPress={() => setIsListVisible(true)}
            style={({ pressed }) => [
              styles.previewButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.previewStack}>
              {previewRealMojis.map((realMoji, index) => (
                <View
                  key={realMoji.id}
                  style={[
                    styles.previewPhotoWrapper,
                    index > 0 && styles.previewPhotoOverlap,
                  ]}
                >
                  <Image
                    contentFit="cover"
                    source={{ uri: realMoji.imageUrl }}
                    style={styles.previewPhoto}
                  />
                  <Text style={styles.previewEmoji}>{realMoji.emoji}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.countText}>{realMojis.length}</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityLabel={
            viewerRealMoji ? 'RealMojiを撮り直す' : '顔写真でRealMojiを送る'
          }
          accessibilityRole="button"
          onPress={onCompose}
          style={({ pressed }) => [
            styles.composeButton,
            viewerRealMoji && styles.composeButtonActive,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.composeButtonEmoji}>
            {viewerRealMoji?.emoji ?? '📸'}
          </Text>
          <Text
            style={[
              styles.composeButtonText,
              viewerRealMoji && styles.composeButtonTextActive,
            ]}
          >
            {viewerRealMoji ? '撮り直す' : '顔で返す'}
          </Text>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsListVisible(false)}
        presentationStyle="pageSheet"
        visible={isListVisible}
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Pressable
              accessibilityLabel="RealMoji一覧を閉じる"
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setIsListVisible(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
            <Text style={styles.modalTitle}>RealMoji {realMojis.length}件</Text>
          </View>

          <FlatList
            contentContainerStyle={styles.listContent}
            data={realMojis}
            keyExtractor={(item) => item.id}
            renderItem={renderRealMoji}
            showsVerticalScrollIndicator={false}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 50,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  composeButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  composeButtonActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#fb923c',
  },
  composeButtonEmoji: {
    fontSize: 18,
  },
  composeButtonText: {
    color: '#525252',
    fontSize: 13,
    fontWeight: '800',
  },
  composeButtonTextActive: {
    color: '#c2410c',
  },
  countText: {
    color: '#525252',
    fontSize: 13,
    fontWeight: '800',
  },
  listContent: {
    gap: 4,
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  listDisplayName: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
  },
  listEmoji: {
    bottom: -2,
    fontSize: 24,
    position: 'absolute',
    right: -6,
  },
  listPhoto: {
    borderRadius: 31,
    height: '100%',
    width: '100%',
  },
  listPhotoWrapper: {
    height: 62,
    width: 62,
  },
  listRow: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 4,
    paddingVertical: 14,
  },
  listRowCopy: {
    flex: 1,
  },
  listTime: {
    color: '#a3a3a3',
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    left: 12,
    position: 'absolute',
    width: 44,
  },
  modalCloseText: {
    color: '#171717',
    fontSize: 30,
    lineHeight: 32,
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 61,
    paddingHorizontal: 60,
  },
  modalScreen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  modalTitle: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '800',
  },
  previewButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  previewEmoji: {
    bottom: -3,
    fontSize: 14,
    position: 'absolute',
    right: -4,
  },
  previewPhoto: {
    borderRadius: 20,
    height: '100%',
    width: '100%',
  },
  previewPhotoOverlap: {
    marginLeft: -10,
  },
  previewPhotoWrapper: {
    backgroundColor: '#e5e5e5',
    borderColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    width: 44,
  },
  previewStack: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
