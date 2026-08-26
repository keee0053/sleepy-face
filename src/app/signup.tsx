import { useTranslation } from 'react-i18next';

import { ScreenPlaceholder } from '@/components/screen-placeholder';

export default function SignupScreen() {
  const { t } = useTranslation();

  return <ScreenPlaceholder title={t('signup.title')} />;
}
