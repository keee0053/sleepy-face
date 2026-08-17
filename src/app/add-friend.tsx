import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';

import {
  FriendServiceError,
  addFriend,
  listFriends,
  listFriendRelations,
  normalizeFriendSearchQuery,
  searchProfiles,
  type FriendProfile,
  type FriendRelation,
  type FriendSearchProfile,
} from '@/services/friend';

function getFriendErrorMessage(error: unknown): string {
  if (error instanceof FriendServiceError) {
    switch (error.code) {
      case 'not_authenticated':
        return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
      case 'self_relation':
        return '自分自身は友達に追加できません。';
      case 'already_friend':
        return 'すでに友達に追加されています。';
      case 'unexpected_error':
        return '友達情報を更新できませんでした。もう一度お試しください。';
    }
  }

  return '友達情報を更新できませんでした。もう一度お試しください。';
}

export default function AddFriendScreen() {
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [relations, setRelations] = useState<FriendRelation[]>([]);
  const [results, setResults] = useState<FriendSearchProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addingProfileId, setAddingProfileId] = useState<string | null>(null);
  const [isLoadingRelations, setIsLoadingRelations] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const friendProfileIds = useMemo(() => {
    const ids = new Set<string>();

    for (const relation of relations) {
      ids.add(relation.profileId);
      ids.add(relation.friendProfileId);
    }

    return ids;
  }, [relations]);

  useEffect(() => {
    let isActive = true;

    Promise.all([listFriendRelations(), listFriends()])
      .then(([nextRelations, nextFriends]) => {
        if (isActive) {
          setRelations(nextRelations);
          setFriends(nextFriends);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getFriendErrorMessage(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingRelations(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSearch = useCallback(async () => {
    const normalizedQuery = normalizeFriendSearchQuery(query);

    setErrorMessage(null);
    setSuccessMessage(null);

    if (normalizedQuery.length < 2) {
      setResults([]);
      setErrorMessage('ユーザーIDか表示名を2文字以上入力してください。');
      return;
    }

    setQuery(normalizedQuery);
    setIsSearching(true);

    try {
      const profiles = await searchProfiles(normalizedQuery);
      setResults(profiles);

      if (profiles.length === 0) {
        setErrorMessage('該当するユーザーが見つかりませんでした。');
      }
    } catch (error) {
      setErrorMessage(getFriendErrorMessage(error));
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleAddFriend = useCallback(async (profile: FriendSearchProfile) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setAddingProfileId(profile.id);

    try {
      const relation = await addFriend(profile.id);
      setRelations((currentRelations) => [relation, ...currentRelations]);
      setFriends((currentFriends) => [
        {
          ...profile,
          relationId: relation.id,
        },
        ...currentFriends,
      ]);
      setSuccessMessage(`${profile.displayName}を友達に追加しました。`);
    } catch (error) {
      setErrorMessage(getFriendErrorMessage(error));
    } finally {
      setAddingProfileId(null);
    }
  }, []);

  const renderItem: ListRenderItem<FriendSearchProfile> = ({ item }) => {
    const isFriend = friendProfileIds.has(item.id);
    const isAdding = addingProfileId === item.id;

    return (
      <View style={styles.resultCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.displayName.at(0) ?? '?'}</Text>
        </View>

        <View style={styles.profileText}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.userId}>@{item.userId}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isFriend || isAdding}
          onPress={() => handleAddFriend(item)}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.buttonPressed,
            (isFriend || isAdding) && styles.addButtonDisabled,
          ]}
        >
          <Text style={styles.addButtonText}>
            {isFriend ? '追加済み' : isAdding ? '追加中...' : '追加'}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderFriendItem: ListRenderItem<FriendProfile> = ({ item }) => (
    <View style={styles.friendCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.displayName.at(0) ?? '?'}</Text>
      </View>

      <View style={styles.profileText}>
        <Text style={styles.displayName}>{item.displayName}</Text>
        <Text style={styles.userId}>@{item.userId}</Text>
      </View>

      <Text style={styles.friendBadge}>友達</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.backButtonText}>戻る</Text>
          </Pressable>

          <Text style={styles.title}>友達追加</Text>
          <Text style={styles.description}>
            ユーザーIDまたは表示名で検索できます。
          </Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSearching}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            placeholder="ユーザーID / 表示名"
            returnKeyType="search"
            style={styles.input}
            value={query}
          />

          <Pressable
            accessibilityRole="button"
            disabled={isSearching}
            onPress={handleSearch}
            style={({ pressed }) => [
              styles.searchButton,
              pressed && styles.buttonPressed,
              isSearching && styles.searchButtonDisabled,
            ]}
          >
            <Text style={styles.searchButtonText}>
              {isSearching ? '検索中' : '検索'}
            </Text>
          </Pressable>
        </View>

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        {successMessage && (
          <Text style={styles.successText}>{successMessage}</Text>
        )}

        {isLoadingRelations ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>友達情報を確認中...</Text>
          </View>
        ) : (
          <View style={styles.content}>
            <View>
              <Text style={styles.sectionTitle}>追加済みの友達</Text>
              <FlatList
                contentContainerStyle={styles.friendList}
                data={friends}
                horizontal
                keyExtractor={(item) => item.relationId}
                ListEmptyComponent={
                  <View style={styles.emptyFriendBox}>
                    <Text style={styles.emptyText}>
                      まだ友達が追加されていません。
                    </Text>
                  </View>
                }
                renderItem={renderFriendItem}
                showsHorizontalScrollIndicator={false}
              />
            </View>

            <View style={styles.searchResults}>
              <Text style={styles.sectionTitle}>検索結果</Text>
              <FlatList
                contentContainerStyle={styles.resultList}
                data={results}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                      友達に追加したいユーザーを検索してください。
                    </Text>
                  </View>
                }
                renderItem={renderItem}
              />
            </View>
          </View>
        )}
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
    padding: 24,
  },
  header: {
    marginBottom: 22,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 6,
  },
  backButtonText: {
    color: '#536dfe',
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    color: '#172033',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  description: {
    color: '#657086',
    fontSize: 15,
    lineHeight: 22,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d8deea',
    borderRadius: 14,
    borderWidth: 1,
    color: '#172033',
    flex: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#172033',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 82,
    paddingHorizontal: 16,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  successText: {
    color: '#067647',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  loadingBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingText: {
    color: '#657086',
    fontSize: 14,
  },
  resultList: {
    gap: 10,
    paddingBottom: 32,
  },
  content: {
    flex: 1,
    gap: 20,
  },
  sectionTitle: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  friendList: {
    gap: 10,
    paddingRight: 24,
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 78,
    padding: 12,
    width: 250,
  },
  friendBadge: {
    backgroundColor: '#ecfdf3',
    borderRadius: 999,
    color: '#067647',
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchResults: {
    flex: 1,
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
    padding: 12,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e8edff',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    width: 48,
  },
  avatarText: {
    color: '#3f57d4',
    fontSize: 18,
    fontWeight: '800',
  },
  profileText: {
    flex: 1,
    marginRight: 12,
  },
  displayName: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  userId: {
    color: '#657086',
    fontSize: 14,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#536dfe',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 12,
  },
  addButtonDisabled: {
    backgroundColor: '#98a2b3',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  emptyBox: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  emptyFriendBox: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e7f0',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    width: 250,
  },
  emptyText: {
    color: '#657086',
    fontSize: 14,
    lineHeight: 21,
  },
});
