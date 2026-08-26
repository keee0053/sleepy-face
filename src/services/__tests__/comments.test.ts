import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addComment,
  CommentServiceError,
  deleteComment,
  listComments,
} from '../comments';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  in: vi.fn(),
  insert: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
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

function expectServiceError(error: unknown, code: CommentServiceError['code']) {
  expect(error).toBeInstanceOf(CommentServiceError);
  expect((error as CommentServiceError).code).toBe(code);
}

describe('comments service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listComments', () => {
    it('lists comments oldest first, including reply parent ids', async () => {
      mockAuthenticatedUser();

      const commentOrder = vi.fn().mockResolvedValue({
        data: [
          {
            content: '起きて!',
            created_at: '2026-08-25T00:00:00.000Z',
            id: 'comment-1',
            parent_comment_id: null,
            photo_id: 'photo-1',
            user_id: 'profile-b',
          },
          {
            content: 'ありがとう',
            created_at: '2026-08-25T00:01:00.000Z',
            id: 'comment-2',
            parent_comment_id: 'comment-1',
            photo_id: 'photo-1',
            user_id: 'profile-a',
          },
        ],
        error: null,
      });
      const commentEq = vi.fn().mockReturnValue({ order: commentOrder });
      const commentSelect = vi.fn().mockReturnValue({ eq: commentEq });

      const profileIn = vi.fn().mockResolvedValue({
        data: [{ display_name: 'Friend', icon_url: 'woman', id: 'profile-b' }],
        error: null,
      });
      const profileSelect = vi.fn().mockReturnValue({ in: profileIn });

      mocks.from.mockImplementation((table: string) => {
        if (table === 'comments') {
          return { select: commentSelect };
        }

        if (table === 'profiles') {
          return { select: profileSelect };
        }

        throw new Error(`unexpected table: ${table}`);
      });

      await expect(listComments('photo-1')).resolves.toEqual([
        {
          content: '起きて!',
          createdAt: '2026-08-25T00:00:00.000Z',
          displayName: 'Friend',
          iconId: 'woman',
          id: 'comment-1',
          isOwn: false,
          parentCommentId: null,
          photoId: 'photo-1',
          profileId: 'profile-b',
        },
        {
          content: 'ありがとう',
          createdAt: '2026-08-25T00:01:00.000Z',
          displayName: '不明なユーザー',
          iconId: 'human',
          id: 'comment-2',
          isOwn: true,
          parentCommentId: 'comment-1',
          photoId: 'photo-1',
          profileId: 'profile-a',
        },
      ]);
    });

    it('returns an empty list without querying profiles when there are no comments', async () => {
      mockAuthenticatedUser();

      const commentOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      const commentEq = vi.fn().mockReturnValue({ order: commentOrder });
      const commentSelect = vi.fn().mockReturnValue({ eq: commentEq });

      mocks.from.mockImplementation((table: string) => {
        if (table === 'comments') {
          return { select: commentSelect };
        }

        throw new Error(`unexpected table: ${table}`);
      });

      await expect(listComments('photo-1')).resolves.toEqual([]);
    });
  });

  describe('addComment', () => {
    it('throws comment_required for blank content', async () => {
      await expect(addComment('photo-1', '   ')).rejects.toSatisfy((error) => {
        expectServiceError(error, 'comment_required');
        return true;
      });
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it('inserts a top-level comment with a null parent by default', async () => {
      mockAuthenticatedUser();

      const insertSingle = vi.fn().mockResolvedValue({
        data: {
          content: 'おはよう',
          created_at: '2026-08-25T00:00:00.000Z',
          id: 'comment-1',
          parent_comment_id: null,
          photo_id: 'photo-1',
          user_id: 'profile-a',
        },
        error: null,
      });
      const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
      const insert = vi.fn().mockReturnValue({ select: insertSelect });

      const profileMaybeSingle = vi.fn().mockResolvedValue({
        data: { display_name: 'Me', icon_url: 'human', id: 'profile-a' },
        error: null,
      });
      const profileEq = vi
        .fn()
        .mockReturnValue({ maybeSingle: profileMaybeSingle });
      const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

      mocks.from.mockImplementation((table: string) => {
        if (table === 'comments') {
          return { insert };
        }

        if (table === 'profiles') {
          return { select: profileSelect };
        }

        throw new Error(`unexpected table: ${table}`);
      });

      await expect(addComment('photo-1', 'おはよう')).resolves.toMatchObject({
        id: 'comment-1',
        parentCommentId: null,
      });

      expect(insert).toHaveBeenCalledWith({
        content: 'おはよう',
        parent_comment_id: null,
        photo_id: 'photo-1',
        user_id: 'profile-a',
      });
    });

    it('inserts a reply with the given parent comment id', async () => {
      mockAuthenticatedUser();

      const insertSingle = vi.fn().mockResolvedValue({
        data: {
          content: 'ありがとう',
          created_at: '2026-08-25T00:01:00.000Z',
          id: 'comment-2',
          parent_comment_id: 'comment-1',
          photo_id: 'photo-1',
          user_id: 'profile-a',
        },
        error: null,
      });
      const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
      const insert = vi.fn().mockReturnValue({ select: insertSelect });

      const profileMaybeSingle = vi.fn().mockResolvedValue({
        data: { display_name: 'Me', icon_url: 'human', id: 'profile-a' },
        error: null,
      });
      const profileEq = vi
        .fn()
        .mockReturnValue({ maybeSingle: profileMaybeSingle });
      const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

      mocks.from.mockImplementation((table: string) => {
        if (table === 'comments') {
          return { insert };
        }

        if (table === 'profiles') {
          return { select: profileSelect };
        }

        throw new Error(`unexpected table: ${table}`);
      });

      await expect(
        addComment('photo-1', 'ありがとう', 'comment-1'),
      ).resolves.toMatchObject({
        id: 'comment-2',
        parentCommentId: 'comment-1',
      });

      expect(insert).toHaveBeenCalledWith({
        content: 'ありがとう',
        parent_comment_id: 'comment-1',
        photo_id: 'photo-1',
        user_id: 'profile-a',
      });
    });
  });

  describe('deleteComment', () => {
    it('deletes the comment row scoped to the viewer', async () => {
      mockAuthenticatedUser();
      const eqChain = { eq: mocks.eq };
      mocks.eq
        .mockReturnValueOnce(eqChain)
        .mockResolvedValueOnce({ error: null });
      mocks.from.mockReturnValue({ delete: vi.fn().mockReturnValue(eqChain) });

      await deleteComment('comment-1');

      expect(mocks.from).toHaveBeenCalledWith('comments');
      expect(mocks.eq).toHaveBeenCalledWith('id', 'comment-1');
      expect(mocks.eq).toHaveBeenCalledWith('user_id', 'profile-a');
    });

    it('throws unexpected_error when the delete fails', async () => {
      mockAuthenticatedUser();
      const eqChain = { eq: mocks.eq };
      mocks.eq
        .mockReturnValueOnce(eqChain)
        .mockResolvedValueOnce({ error: new Error('boom') });
      mocks.from.mockReturnValue({ delete: vi.fn().mockReturnValue(eqChain) });

      await expect(deleteComment('comment-1')).rejects.toSatisfy((error) => {
        expectServiceError(error, 'unexpected_error');
        return true;
      });
    });
  });
});
