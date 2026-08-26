import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingButtonContent } from '@/components/loading';
import { FriendListLoadingSkeleton } from '@/components/loading-skeletons';
import { PROFILE_ICON_SOURCES } from '@/constants/profile-icons';
import { getCurrentUserId } from '@/services/auth';
import {
  FriendServiceError,
  acceptFriendRequest,
  addFriend,
  listFriendRelations,
  normalizeFriendSearchQuery,
  resolveFriendProfileId,
  searchProfiles,
  type FriendRelation,
  type FriendSearchProfile,
} from '@/services/friend';

// Flip to true locally to use the dev-only debug tools below. Always false in committed code.
const SHOW_DEBUG_TOOLS = false;

function getFriendErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof FriendServiceError) {
    switch (error.code) {
      case 'not_authenticated':
        return t('addFriend.errors.notAuthenticated');
      case 'self_relation':
        return t('addFriend.errors.selfRelation');
      case 'already_friend':
        return t('addFriend.errors.alreadyFriend');
      case 'unexpected_error':
        return t('addFriend.errors.unexpectedError');
    }
  }

  return t('addFriend.errors.unexpectedError');
}

export default function AddFriendScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const [relations, setRelations] = useState<FriendRelation[]>([]);
  const [results, setResults] = useState<FriendSearchProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addingProfileId, setAddingProfileId] = useState<string | null>(null);
  const [isLoadingRelations, setIsLoadingRelations] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // The other person's profile id for every accepted relation.
  const acceptedProfileIds = useMemo(() => {
    if (!viewerProfileId) {
      return new Set<string>();
    }

    return new Set(
      relations
        .filter((relation) => relation.status === 'accepted')
        .map((relation) => resolveFriendProfileId(relation, viewerProfileId)),
    );
  }, [relations, viewerProfileId]);

  // The other person's profile id for every pending request the viewer sent.
  const outgoingPendingProfileIds = useMemo(() => {
    if (!viewerProfileId) {
      return new Set<string>();
    }

    return new Set(
      relations
        .filter(
          (relation) =>
            relation.status === 'pending' &&
            relation.profileId === viewerProfileId,
        )
        .map((relation) => relation.friendProfileId),
    );
  }, [relations, viewerProfileId]);

  // Pending requests sent TO the viewer, keyed by the requester's profile id -- pressing
  // the button on one of these accepts it instead of sending a new, reversed request.
  const incomingPendingRelationByProfileId = useMemo(() => {
    if (!viewerProfileId) {
      return new Map<string, FriendRelation>();
    }

    return new Map(
      relations
        .filter(
          (relation) =>
            relation.status === 'pending' &&
            relation.friendProfileId === viewerProfileId,
        )
        .map((relation) => [relation.profileId, relation]),
    );
  }, [relations, viewerProfileId]);

  useEffect(() => {
    let isActive = true;

    Promise.all([getCurrentUserId(), listFriendRelations()])
      .then(([nextViewerProfileId, nextRelations]) => {
        if (isActive) {
          setViewerProfileId(nextViewerProfileId);
          setRelations(nextRelations);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getFriendErrorMessage(error, t));
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
  }, [t]);

  const handleSearch = useCallback(async () => {
    const normalizedQuery = normalizeFriendSearchQuery(query);

    setErrorMessage(null);
    setSuccessMessage(null);

    if (normalizedQuery.length < 2) {
      setResults([]);
      setErrorMessage(t('addFriend.errors.queryTooShort'));
      return;
    }

    setQuery(normalizedQuery);
    setIsSearching(true);

    try {
      const profiles = await searchProfiles(normalizedQuery);
      setResults(profiles);

      if (profiles.length === 0) {
        setErrorMessage(t('addFriend.errors.noResults'));
      }
    } catch (error) {
      setErrorMessage(getFriendErrorMessage(error, t));
    } finally {
      setIsSearching(false);
    }
  }, [query, t]);

  const handleAddFriend = useCallback(
    async (profile: FriendSearchProfile) => {
      setErrorMessage(null);
      setSuccessMessage(null);
      setAddingProfileId(profile.id);

      try {
        // This person already sent the viewer a request -- accept it instead of sending
        // a new, reversed one.
        const incomingRelation = incomingPendingRelationByProfileId.get(
          profile.id,
        );

        if (incomingRelation) {
          const relation = await acceptFriendRequest(incomingRelation.id);

          setRelations((currentRelations) =>
            currentRelations.map((currentRelation) =>
              currentRelation.id === relation.id ? relation : currentRelation,
            ),
          );
          setSuccessMessage(
            t('addFriend.becameFriendsSuccess', {
              displayName: profile.displayName,
            }),
          );
          return;
        }

        const relation = await addFriend(profile.id);
        setRelations((currentRelations) => [relation, ...currentRelations]);
        setSuccessMessage(
          t('addFriend.requestSentSuccess', {
            displayName: profile.displayName,
          }),
        );
      } catch (error) {
        setErrorMessage(getFriendErrorMessage(error, t));
      } finally {
        setAddingProfileId(null);
      }
    },
    [incomingPendingRelationByProfileId, t],
  );

  // DEV-ONLY: injects a mock search result already marked as a friend (no Supabase write), to preview the disabled "追加済み" state. Remove before ship.
  const handleAddMockExistingFriend = useCallback(() => {
    const mockId = `mock-existing-${Date.now()}`;
    const mockProfile: FriendSearchProfile = {
      createdAt: new Date().toISOString(),
      displayName: t('addFriend.debug.mockExistingFriendName'),
      iconId: 'man2',
      id: mockId,
      userId: `mock_existing_${Date.now()}`,
    };

    setResults((currentResults) => [mockProfile, ...currentResults]);
    setRelations((currentRelations) => [
      {
        createdAt: new Date().toISOString(),
        friendProfileId: mockId,
        id: `mock-relation-${Date.now()}`,
        profileId: viewerProfileId ?? 'mock-self',
        status: 'accepted',
      },
      ...currentRelations,
    ]);
  }, [t, viewerProfileId]);

  // DEV-ONLY: injects a mock search result not yet a friend (no Supabase write), to preview the active "追加" state. Remove before ship.
  const handleAddMockSearchResult = useCallback(() => {
    const mockProfile: FriendSearchProfile = {
      createdAt: new Date().toISOString(),
      displayName: t('addFriend.debug.mockSearchResultName'),
      iconId: 'woman',
      id: `mock-result-${Date.now()}`,
      userId: `mock_result_${Date.now()}`,
    };

    setResults((currentResults) => [mockProfile, ...currentResults]);
  }, [t]);

  const renderItem: ListRenderItem<FriendSearchProfile> = ({ item }) => {
    const isFriend = acceptedProfileIds.has(item.id);
    const isRequestSent = outgoingPendingProfileIds.has(item.id);
    const isIncomingRequest = incomingPendingRelationByProfileId.has(item.id);
    const isAdding = addingProfileId === item.id;
    const isDisabled = isFriend || isRequestSent || isAdding;

    return (
      <View style={styles.resultCard}>
        <View style={styles.avatar}>
          <Image
            contentFit="cover"
            source={PROFILE_ICON_SOURCES[item.iconId]}
            style={styles.avatarImage}
          />
        </View>

        <View style={styles.profileText}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.userId}>@{item.userId}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isDisabled}
          onPress={() => handleAddFriend(item)}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.buttonPressed,
            isDisabled && styles.addButtonDisabled,
          ]}
        >
          {isFriend ? (
            <Text style={styles.addButtonText}>
              {t('addFriend.buttonStates.friend')}
            </Text>
          ) : isRequestSent ? (
            <Text style={styles.addButtonText}>
              {t('addFriend.buttonStates.requestSent')}
            </Text>
          ) : (
            <LoadingButtonContent
              label={
                isIncomingRequest
                  ? t('addFriend.buttonStates.accept')
                  : t('addFriend.buttonStates.sendRequest')
              }
              loading={isAdding}
              loadingLabel=""
              textStyle={styles.addButtonText}
              tone="light"
            />
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t('addFriend.backToFriendsAccessibilityLabel')}
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.replace('/friends')}
            style={styles.closeButton}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={24}
              tintColor="#737373"
              type="monochrome"
            />
          </Pressable>
          <Text style={styles.title}>{t('addFriend.title')}</Text>
        </View>

        <View style={styles.content}>
          {isLoadingRelations ? (
            <FriendListLoadingSkeleton />
          ) : (
            <FlatList
              contentContainerStyle={styles.resultList}
              data={results}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    {t('addFriend.emptyText')}
                  </Text>
                </View>
              }
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  {/* DEV-ONLY: no design, just to preview the search-result card states. Flip SHOW_DEBUG_TOOLS to true locally to use it. */}
                  {SHOW_DEBUG_TOOLS && (
                    <View style={styles.debugButtonRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleAddMockExistingFriend}
                      >
                        <Text style={styles.debugToggleText}>
                          {t('addFriend.debug.addExistingFriend')}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={handleAddMockSearchResult}
                      >
                        <Text style={styles.debugToggleText}>
                          {t('addFriend.debug.addSearchResult')}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  <Text style={styles.description}>
                    {t('addFriend.description')}
                  </Text>

                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSearching}
                    onChangeText={setQuery}
                    onSubmitEditing={handleSearch}
                    placeholder={t('addFriend.searchPlaceholder')}
                    placeholderTextColor="#a3a3a3"
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
                    <LoadingButtonContent
                      label={t('addFriend.searchButton')}
                      loading={isSearching}
                      loadingLabel={t('addFriend.searching')}
                      textStyle={styles.searchButtonText}
                      tone="light"
                    />
                  </Pressable>

                  {errorMessage && (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  )}
                  {successMessage && (
                    <Text style={styles.successText}>{successMessage}</Text>
                  )}
                </View>
              }
              renderItem={renderItem}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#f5f5f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 61,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    left: 18,
    position: 'absolute',
    width: 44,
  },
  title: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'NoteSansJP_700Bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  description: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#fafafa',
    borderColor: '#f5f5f5',
    borderRadius: 11,
    borderWidth: 2,
    color: '#171717',
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 56,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  successText: {
    color: '#067647',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  listHeader: {
    paddingBottom: 4,
  },
  debugButtonRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  debugToggleText: {
    color: '#b42318',
    fontSize: 12,
    fontWeight: '700',
  },
  resultList: {
    gap: 10,
    paddingBottom: 32,
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#f5f5f5',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    padding: 12,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  profileText: {
    flex: 1,
    marginRight: 12,
  },
  displayName: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
    fontFamily: 'NotoSansJP_700Bold',
  },
  userId: {
    color: '#737373',
    fontSize: 13,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 76,
    paddingHorizontal: 12,
  },
  addButtonDisabled: {
    backgroundColor: '#a3a3a3',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  emptyBox: {
    backgroundColor: '#fafafa',
    borderColor: '#f1f1f1',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    color: '#737373',
    fontSize: 14,
    lineHeight: 21,
  },
});
