import { writable, derived } from 'svelte/store';
import { fr, en, de, es, it, zh, ja, ko } from './locales';

export type Locale = 'fr' | 'en' | 'de' | 'es' | 'it' | 'zh' | 'ja' | 'ko';

export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
};

const messages: Record<Locale, Record<string, string>> = { fr, en, de, es, it, zh, ja, ko };

export const locale = writable<Locale>('fr');

export const t = derived(locale, ($l) => {
  const dict = messages[$l] ?? messages.fr;
  return (key: string) => dict[key] ?? messages.fr[key] ?? key;
});
