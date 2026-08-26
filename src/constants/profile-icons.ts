import type { ImageSourcePropType } from 'react-native';

import {
  isCustomProfilePhotoUrl,
  toProfileIconId,
  type ProfileIconId,
} from '@/services/user';

export const PROFILE_ICON_SOURCES: Record<ProfileIconId, number> = {
  boy: require('@/assets/images/profile-icons/boy.png'),
  child: require('@/assets/images/profile-icons/child.png'),
  grandmother: require('@/assets/images/profile-icons/grandmother.png'),
  human: require('@/assets/images/profile-icons/human.png'),
  man: require('@/assets/images/profile-icons/man.png'),
  man2: require('@/assets/images/profile-icons/man2.png'),
  'old-man': require('@/assets/images/profile-icons/old-man.png'),
  woman: require('@/assets/images/profile-icons/woman.png'),
};

// `iconValue` is a Profile's raw icon_url: either a preset identifier or a custom photo URL.
export function getProfileIconSource(iconValue: string): ImageSourcePropType {
  if (isCustomProfilePhotoUrl(iconValue)) {
    return { uri: iconValue };
  }

  return PROFILE_ICON_SOURCES[toProfileIconId(iconValue)];
}

// A plain Record can't reactively follow a runtime language switch (it would bake in
// whatever language was active at module load), so this is a function taking `t` from
// the calling component's own useTranslation(), same pattern as the error-message
// helpers throughout the app (e.g. src/app/signin.tsx's getLoginErrorMessage).
export function getProfileIconLabel(
  iconId: ProfileIconId,
  t: (key: string) => string,
): string {
  return t(`profileIcons.${iconId === 'old-man' ? 'oldMan' : iconId}`);
}
