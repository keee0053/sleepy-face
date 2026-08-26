/* eslint-disable import/no-named-as-default-member -- i18next's default export is the
   singleton instance itself; `i18n.use`/`i18n.changeLanguage` are its real instance
   methods, not the package's named exports. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';

export const SUPPORTED_LANGUAGES = ['ja', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ja';

const LANGUAGE_STORAGE_KEY = 'app-language';

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function detectDeviceLanguage(): SupportedLanguage {
  const deviceLanguageCode = Localization.getLocales()[0]?.languageCode ?? '';

  return isSupportedLanguage(deviceLanguageCode)
    ? deviceLanguageCode
    : DEFAULT_LANGUAGE;
}

export async function getStoredLanguage(): Promise<SupportedLanguage | null> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);

  return stored && isSupportedLanguage(stored) ? stored : null;
}

export async function setAppLanguage(
  language: SupportedLanguage,
): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18n.changeLanguage(language);
}

// Initialized synchronously (no AsyncStorage read on the critical path) so the root
// layout never has to gate rendering on this -- a navigation effect calling
// router.replace() before the Stack has mounted for the first time would misbehave.
// The device locale is available synchronously, so it's a reasonable first guess;
// restoreStoredLanguage() upgrades to the user's saved explicit choice right after.
void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  interpolation: { escapeValue: false },
  lng: detectDeviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  resources: {
    en: { translation: en },
    ja: { translation: ja },
  },
});

// Fire-and-forget from the root layout: switches to the user's previously saved
// language choice, if any, once the AsyncStorage read resolves.
export async function restoreStoredLanguage(): Promise<void> {
  const storedLanguage = await getStoredLanguage();

  if (storedLanguage && storedLanguage !== i18n.language) {
    await i18n.changeLanguage(storedLanguage);
  }
}

export default i18n;
