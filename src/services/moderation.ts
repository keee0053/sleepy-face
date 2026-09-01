import { supabase } from '@/lib/supabase';
import { toProfileIconValue } from '@/services/user';

export type ReportTargetType = 'photo' | 'comment' | 'profile';
export type ReportReason = 'inappropriate' | 'harassment' | 'spam' | 'other';

export type BlockedProfile = {
  id: string;
  userId: string;
  displayName: string;
  // Either one of PROFILE_ICON_IDS or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
  blockedAt: string;
};

export type ModerationServiceErrorCode =
  'not_authenticated' | 'unexpected_error';

type BlockRow = {
  blocked_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string;
  icon_url: string | null;
};

export class ModerationServiceError extends Error {
  constructor(
    public readonly code: ModerationServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ModerationServiceError';
  }
}

async function getRequiredProfileId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ModerationServiceError(
      'not_authenticated',
      'Moderation actions require an authenticated user.',
      error,
    );
  }

  return data.user.id;
}

// Reports a photo, comment, or profile for review. There's no in-app admin panel yet --
// reports are reviewed directly via the Supabase SQL Editor (see reports table).
export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details?: string,
): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase.from('reports').insert({
    details: details ?? null,
    reason,
    reporter_id: profileId,
    target_id: targetId,
    target_type: targetType,
  });

  if (error) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not submit the report.',
      error,
    );
  }
}

// Blocking removes any friend relation between the two profiles (in either direction)
// so the block takes effect immediately -- feed/photo/comment visibility is already
// gated on an accepted friend relation, so nothing else needs to change to hide the
// blocked user's content. Also prevents them from re-sending a friend request (see
// public.is_blocked / the friends_relations insert policy in
// 2026-08-26_reports_and_blocks.sql).
export async function blockUser(blockedProfileId: string): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error: blockError } = await supabase.from('blocks').insert({
    blocked_id: blockedProfileId,
    blocker_id: profileId,
  });

  if (blockError) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not block the user.',
      blockError,
    );
  }

  const { error: unfriendError } = await supabase
    .from('friends_relations')
    .delete()
    .or(
      `and(profile_id.eq.${profileId},friend_profile_id.eq.${blockedProfileId}),and(profile_id.eq.${blockedProfileId},friend_profile_id.eq.${profileId})`,
    );

  if (unfriendError) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not remove the friend relation.',
      unfriendError,
    );
  }
}

export async function unblockUser(blockedProfileId: string): Promise<void> {
  const profileId = await getRequiredProfileId();

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', profileId)
    .eq('blocked_id', blockedProfileId);

  if (error) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not unblock the user.',
      error,
    );
  }
}

// Profile ids the viewer has blocked -- used to keep them out of friend search results.
export async function listBlockedProfileIds(): Promise<string[]> {
  const profileId = await getRequiredProfileId();

  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', profileId);

  if (error) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not load blocked users.',
      error,
    );
  }

  return ((data ?? []) as { blocked_id: string }[]).map(
    (row) => row.blocked_id,
  );
}

export async function listBlockedProfiles(): Promise<BlockedProfile[]> {
  const profileId = await getRequiredProfileId();

  const { data: blockRows, error: blockError } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', profileId)
    .order('created_at', { ascending: false });

  if (blockError) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not load blocked users.',
      blockError,
    );
  }

  const blocks = (blockRows ?? []) as BlockRow[];

  if (blocks.length === 0) {
    return [];
  }

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, user_id, display_name, icon_url')
    .in(
      'id',
      blocks.map((block) => block.blocked_id),
    );

  if (profileError) {
    throw new ModerationServiceError(
      'unexpected_error',
      'Could not load blocked users.',
      profileError,
    );
  }

  const profileById = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  return blocks.map((block) => {
    const profile = profileById.get(block.blocked_id);

    return {
      blockedAt: block.created_at,
      displayName: profile?.display_name ?? '不明なユーザー',
      iconId: toProfileIconValue(profile?.icon_url),
      id: block.blocked_id,
      userId: profile?.user_id ?? '',
    };
  });
}
