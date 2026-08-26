import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isReactionEmoji,
  listPhotoReactions,
  PhotoReactionServiceError,
  removePhotoReaction,
  setPhotoReaction,
} from '../photo-reactions';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  select: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
  },
}));

function mockAuthenticatedUser(id = 'profile-a') {
  mocks.getUser.mockResolvedValue({
    data: { user: { id } },
    error: null,
  });
}

function expectServiceError(
  error: unknown,
  code: PhotoReactionServiceError['code'],
) {
  expect(error).toBeInstanceOf(PhotoReactionServiceError);
  expect((error as PhotoReactionServiceError).code).toBe(code);
}

describe('photo reactions service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isReactionEmoji', () => {
    it('accepts a known reaction emoji', () => {
      expect(isReactionEmoji('😂')).toBe(true);
    });

    it('rejects an unknown emoji', () => {
      expect(isReactionEmoji('🍕')).toBe(false);
    });
  });

  describe('setPhotoReaction', () => {
    it('upserts the reaction with the chosen emoji, overwriting any existing one', async () => {
      mockAuthenticatedUser();

      const upsert = vi.fn().mockResolvedValue({ error: null });
      mocks.from.mockReturnValue({ upsert });

      await setPhotoReaction('photo-1', '🤣');

      expect(upsert).toHaveBeenCalledWith(
        { emoji: '🤣', photo_id: 'photo-1', profile_id: 'profile-a' },
        { onConflict: 'photo_id,profile_id' },
      );
    });

    it('wraps a Supabase error', async () => {
      mockAuthenticatedUser();

      const upsert = vi.fn().mockResolvedValue({ error: new Error('boom') });
      mocks.from.mockReturnValue({ upsert });

      await expect(setPhotoReaction('photo-1', '😂')).rejects.toSatisfy(
        (error) => {
          expectServiceError(error, 'unexpected_error');
          return true;
        },
      );
    });
  });

  describe('removePhotoReaction', () => {
    it('deletes the viewer own reaction row', async () => {
      mockAuthenticatedUser();

      const secondEq = vi.fn().mockResolvedValue({ error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      mocks.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({ eq: firstEq }),
      });

      await removePhotoReaction('photo-1');

      expect(firstEq).toHaveBeenCalledWith('photo_id', 'photo-1');
      expect(secondEq).toHaveBeenCalledWith('profile_id', 'profile-a');
    });

    it('wraps a Supabase error', async () => {
      mockAuthenticatedUser();

      const secondEq = vi.fn().mockResolvedValue({ error: new Error('boom') });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      mocks.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({ eq: firstEq }),
      });

      await expect(removePhotoReaction('photo-1')).rejects.toSatisfy(
        (error) => {
          expectServiceError(error, 'unexpected_error');
          return true;
        },
      );
    });
  });

  describe('listPhotoReactions', () => {
    it('joins each reaction with the reactor own profile', async () => {
      mockAuthenticatedUser();

      const reactionsEq = vi.fn().mockResolvedValue({
        data: [
          { emoji: '😂', profile_id: 'profile-a' },
          { emoji: '😍', profile_id: 'profile-b' },
        ],
        error: null,
      });
      const profilesIn = vi.fn().mockResolvedValue({
        data: [
          {
            display_name: 'Alex',
            icon_url: null,
            id: 'profile-a',
          },
          {
            display_name: 'Sam',
            icon_url: 'woman',
            id: 'profile-b',
          },
        ],
        error: null,
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === 'photo_reactions') {
          return { select: vi.fn().mockReturnValue({ eq: reactionsEq }) };
        }

        if (table === 'profiles') {
          return { select: vi.fn().mockReturnValue({ in: profilesIn }) };
        }

        throw new Error(`unexpected table: ${table}`);
      });

      await expect(listPhotoReactions('photo-1')).resolves.toEqual([
        {
          displayName: 'Alex',
          emoji: '😂',
          iconId: 'human',
          isOwn: true,
          profileId: 'profile-a',
        },
        {
          displayName: 'Sam',
          emoji: '😍',
          iconId: 'woman',
          isOwn: false,
          profileId: 'profile-b',
        },
      ]);
    });

    it('returns an empty list without querying profiles when there are no reactions', async () => {
      mockAuthenticatedUser();

      const reactionsEq = vi.fn().mockResolvedValue({ data: [], error: null });
      mocks.from.mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: reactionsEq }),
      });

      await expect(listPhotoReactions('photo-1')).resolves.toEqual([]);
    });

    it('wraps a Supabase error while fetching reactions', async () => {
      mockAuthenticatedUser();

      const reactionsEq = vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error('boom') });
      mocks.from.mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: reactionsEq }),
      });

      await expect(listPhotoReactions('photo-1')).rejects.toSatisfy((error) => {
        expectServiceError(error, 'unexpected_error');
        return true;
      });
    });

    it('requires authentication', async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('not authenticated'),
      });

      await expect(listPhotoReactions('photo-1')).rejects.toSatisfy((error) => {
        expectServiceError(error, 'not_authenticated');
        return true;
      });
    });
  });
});
