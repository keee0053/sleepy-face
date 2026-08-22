import { supabase } from '@/lib/supabase';

export const PROFILE_ICON_IDS = [
  'human',
  'man',
  'man2',
  'woman',
  'boy',
  'child',
  'old-man',
  'grandmother',
] as const;

export type ProfileIconId = (typeof PROFILE_ICON_IDS)[number];

export const DEFAULT_PROFILE_ICON_ID: ProfileIconId = 'human';

export function isProfileIconId(value: string): value is ProfileIconId {
  return (PROFILE_ICON_IDS as readonly string[]).includes(value);
}

export function toProfileIconId(
  value: string | null | undefined,
): ProfileIconId {
  return value != null && isProfileIconId(value)
    ? value
    : DEFAULT_PROFILE_ICON_ID;
}

// A custom profile photo is stored in `icon_url` as its Storage public URL, alongside the
// 8 preset icon identifiers (see PROFILE_ICON_IDS) that also live in that same column.
export function isCustomProfilePhotoUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

// Reads `icon_url` as-is (preset identifier or custom photo URL), unlike toProfileIconId
// which collapses anything unrecognized down to the default preset.
export function toProfileIconValue(value: string | null | undefined): string {
  return value != null && value.length > 0 ? value : DEFAULT_PROFILE_ICON_ID;
}

export type Profile = {
  id: string;
  userId: string;
  displayName: string;
  // Either one of PROFILE_ICON_IDS or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
  createdAt: string;
};

export type CreateProfileInput = {
  publicUserId: string;
  displayName: string;
};

export type ProfileCreationInput = CreateProfileInput & {
  iconId: ProfileIconId;
};

export type InitialSetupValidationErrorCode =
  'public_user_id_invalid' | 'display_name_required' | 'display_name_too_long';

export type InitialSetupValidationResult =
  | {
      isValid: true;
      value: CreateProfileInput;
    }
  | {
      isValid: false;
      code: InitialSetupValidationErrorCode;
    };

export type UpdateProfileInput = {
  displayName: string;
  // Either one of PROFILE_ICON_IDS or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
};

export type ProfileUpdateValidationErrorCode =
  'display_name_required' | 'display_name_too_long';

export type ProfileUpdateValidationResult =
  | {
      isValid: true;
      value: UpdateProfileInput;
    }
  | {
      isValid: false;
      code: ProfileUpdateValidationErrorCode;
    };

export type UserServiceErrorCode =
  | 'user_id_already_taken'
  | 'profile_already_created'
  | 'invalid_profile_input'
  | 'not_authenticated'
  | 'unexpected_error';

type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string;
  icon_url: string | null;
  created_at: string;
};

type CreateProfileRpcData = {
  profile_id: string;
  user_id: string;
  display_name: string;
  icon_url: string | null;
  created_at: string;
};

type AppRpcResponse =
  | {
      status: 'ok';
      data?: CreateProfileRpcData;
    }
  | {
      status: 'error';
      error: string;
      code?: string;
    };

const PUBLIC_USER_ID_PATTERN = /^[a-z0-9_-]{3,20}$/;
const DISPLAY_NAME_MAX_LENGTH = 30;

export class UserServiceError extends Error {
  constructor(
    public readonly code: UserServiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

export function normalizePublicUserId(publicUserId: string): string {
  return publicUserId.trim().toLowerCase();
}

type DisplayNameValidationErrorCode =
  'display_name_required' | 'display_name_too_long';

type DisplayNameValidationResult =
  | {
      isValid: true;
      value: string;
    }
  | {
      isValid: false;
      code: DisplayNameValidationErrorCode;
    };

// Shared by Initial Setup and the Profile screen's edit flow, which both apply the same
// Display Name rules.
function validateDisplayName(displayName: string): DisplayNameValidationResult {
  const trimmedDisplayName = displayName.trim();

  if (trimmedDisplayName.length === 0) {
    return {
      code: 'display_name_required',
      isValid: false,
    };
  }

  if (Array.from(trimmedDisplayName).length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      code: 'display_name_too_long',
      isValid: false,
    };
  }

  return {
    isValid: true,
    value: trimmedDisplayName,
  };
}

export function validateInitialSetupInput({
  displayName,
  publicUserId,
}: CreateProfileInput): InitialSetupValidationResult {
  const normalizedPublicUserId = normalizePublicUserId(publicUserId);

  if (!PUBLIC_USER_ID_PATTERN.test(normalizedPublicUserId)) {
    return {
      code: 'public_user_id_invalid',
      isValid: false,
    };
  }

  const displayNameResult = validateDisplayName(displayName);

  if (!displayNameResult.isValid) {
    return displayNameResult;
  }

  return {
    isValid: true,
    value: {
      displayName: displayNameResult.value,
      publicUserId: normalizedPublicUserId,
    },
  };
}

export function validateProfileUpdateInput({
  displayName,
  iconId,
}: UpdateProfileInput): ProfileUpdateValidationResult {
  const displayNameResult = validateDisplayName(displayName);

  if (!displayNameResult.isValid) {
    return displayNameResult;
  }

  return {
    isValid: true,
    value: {
      displayName: displayNameResult.value,
      iconId,
    },
  };
}

function mapProfile(row: ProfileRow): Profile {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    iconId: toProfileIconValue(row.icon_url),
    id: row.id,
    userId: row.user_id,
  };
}

function mapCreatedProfile(row: CreateProfileRpcData): Profile {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    iconId: toProfileIconValue(row.icon_url),
    id: row.profile_id,
    userId: row.user_id,
  };
}

function mapUserServiceErrorCode(
  code: string | undefined,
): UserServiceErrorCode {
  switch (code) {
    case 'user_id_already_taken':
    case 'profile_already_created':
    case 'not_authenticated':
      return code;
    case 'invalid_profile_input':
      return 'invalid_profile_input';
    default:
      return 'unexpected_error';
  }
}

function isAppRpcResponse(data: unknown): data is AppRpcResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    ((data as { status: unknown }).status === 'ok' ||
      (data as { status: unknown }).status === 'error')
  );
}

function profileFromRpcData(data: unknown): Profile {
  if (!isAppRpcResponse(data)) {
    throw new UserServiceError(
      'unexpected_error',
      'Profile creation returned an invalid response.',
      data,
    );
  }

  if (data.status === 'error') {
    const code = mapUserServiceErrorCode(data.code);

    throw new UserServiceError(code, data.error, data);
  }

  if (!data.data) {
    throw new UserServiceError(
      'unexpected_error',
      'Profile creation returned an empty response.',
      data,
    );
  }

  return mapCreatedProfile(data.data);
}

export async function getMyProfile(): Promise<Profile | null> {
  const userResult = await supabase.auth.getUser();

  if (userResult.error || !userResult.data.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, display_name, icon_url, created_at')
    .eq('id', userResult.data.user.id)
    .maybeSingle();

  if (error) {
    throw new UserServiceError(
      'unexpected_error',
      'Could not fetch the current Profile.',
      error,
    );
  }

  if (!data) {
    return null;
  }

  return mapProfile(data);
}

export async function createProfile({
  displayName,
  iconId,
  publicUserId,
}: ProfileCreationInput): Promise<Profile> {
  const { data, error } = await supabase.rpc('create_profile', {
    display_name: displayName,
    icon_id: iconId,
    user_id: publicUserId,
  });

  if (error) {
    throw new UserServiceError(
      'unexpected_error',
      'Could not create Profile.',
      error,
    );
  }

  try {
    return profileFromRpcData(data);
  } catch (error) {
    if (error instanceof UserServiceError) {
      throw error;
    }

    throw new UserServiceError(
      'unexpected_error',
      'Profile creation returned an invalid response.',
      error,
    );
  }
}

export type CompleteInitialProfileSetupInput = {
  displayName: string;
  publicUserId: string;
  // Either one of PROFILE_ICON_IDS or a custom photo URL — see isCustomProfilePhotoUrl.
  iconId: string;
};

// create_profile only accepts a known preset icon identifier; a custom photo goes through
// the profiles.icon_url update path right after the Profile row exists. If createProfile
// reports the row already exists (e.g. a retry after a previous attempt's photo attach
// failed), the pending custom photo is still attached here rather than silently dropped.
export async function completeInitialProfileSetup({
  displayName,
  iconId,
  publicUserId,
}: CompleteInitialProfileSetupInput): Promise<void> {
  const isCustomPhoto = isCustomProfilePhotoUrl(iconId);

  try {
    await createProfile({
      displayName,
      iconId: toProfileIconId(iconId),
      publicUserId,
    });
  } catch (error) {
    if (
      error instanceof UserServiceError &&
      error.code === 'profile_already_created'
    ) {
      if (isCustomPhoto) {
        await updateProfile({ displayName, iconId });
      }

      return;
    }

    throw error;
  }

  if (isCustomPhoto) {
    await updateProfile({ displayName, iconId });
  }
}

// Display Name and Profile Icon are editable from the Profile screen; User ID stays fixed
// after Initial Setup, so this updates the profiles row directly without any uniqueness check.
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<Profile> {
  const validationResult = validateProfileUpdateInput(input);

  if (!validationResult.isValid) {
    throw new UserServiceError(
      'invalid_profile_input',
      'Invalid Profile update input.',
    );
  }

  const userResult = await supabase.auth.getUser();

  if (userResult.error || !userResult.data.user) {
    throw new UserServiceError(
      'not_authenticated',
      'Profile update requires an authenticated user.',
      userResult.error,
    );
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: validationResult.value.displayName,
      icon_url: validationResult.value.iconId,
    })
    .eq('id', userResult.data.user.id)
    .select('id, user_id, display_name, icon_url, created_at')
    .single();

  if (error || !data) {
    throw new UserServiceError(
      'unexpected_error',
      'Could not update Profile.',
      error,
    );
  }

  return mapProfile(data);
}
