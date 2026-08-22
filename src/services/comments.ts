import { supabase } from '@/lib/supabase';
import { toProfileIconValue } from '@/services/user';

export type Comment = {
  id: string;
  photoId: string;
  profileId: string;
  displayName: string;
  // Either a preset icon identifier or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
};

export type CommentServiceErrorCode =
  'comment_required' | 'not_authenticated' | 'unexpected_error';

type CommentRow = {
  id: string;
  photo_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  icon_url: string | null;
};

export class CommentServiceError extends Error {
  constructor(
    public readonly code: CommentServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CommentServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new CommentServiceError(
      'not_authenticated',
      'Comments require an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

function mapComments(
  rows: CommentRow[],
  profileById: Map<string, ProfileRow>,
  viewerProfileId: string,
): Comment[] {
  return rows.map((row) => {
    const profile = profileById.get(row.user_id);

    return {
      content: row.content,
      createdAt: row.created_at,
      displayName: profile?.display_name ?? '不明なユーザー',
      iconId: toProfileIconValue(profile?.icon_url),
      id: row.id,
      isOwn: row.user_id === viewerProfileId,
      photoId: row.photo_id,
      profileId: row.user_id,
    };
  });
}

// Comments on a photo, oldest first (a natural reading order for a comment thread).
export async function listComments(photoId: string): Promise<Comment[]> {
  const viewerProfileId = await getRequiredProfileId();

  const { data: commentRows, error: commentError } = await supabase
    .from('comments')
    .select('id, photo_id, user_id, content, created_at')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true });

  if (commentError) {
    throw new CommentServiceError(
      'unexpected_error',
      'Could not load comments.',
      commentError,
    );
  }

  const comments = (commentRows ?? []) as CommentRow[];

  if (comments.length === 0) {
    return [];
  }

  const commenterProfileIds = [
    ...new Set(comments.map((comment) => comment.user_id)),
  ];

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, icon_url')
    .in('id', commenterProfileIds);

  if (profileError) {
    throw new CommentServiceError(
      'unexpected_error',
      'Could not load comment authors.',
      profileError,
    );
  }

  const profileById = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  return mapComments(comments, profileById, viewerProfileId);
}

export async function addComment(
  photoId: string,
  content: string,
): Promise<Comment> {
  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    throw new CommentServiceError(
      'comment_required',
      'A comment must not be empty.',
    );
  }

  const viewerProfileId = await getRequiredProfileId();

  const { data: commentRow, error: insertError } = await supabase
    .from('comments')
    .insert({
      content: trimmedContent,
      photo_id: photoId,
      user_id: viewerProfileId,
    })
    .select('id, photo_id, user_id, content, created_at')
    .single();

  if (insertError || !commentRow) {
    throw new CommentServiceError(
      'unexpected_error',
      'Could not add the comment.',
      insertError,
    );
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, icon_url')
    .eq('id', viewerProfileId)
    .maybeSingle();

  if (profileError) {
    throw new CommentServiceError(
      'unexpected_error',
      'Could not load the comment author.',
      profileError,
    );
  }

  const profileById = new Map(
    profileRow ? [[profileRow.id, profileRow as ProfileRow]] : [],
  );

  return mapComments(
    [commentRow as CommentRow],
    profileById,
    viewerProfileId,
  )[0];
}
