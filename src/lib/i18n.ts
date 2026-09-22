import { writable, derived } from 'svelte/store';
import { fr, en, de, es, it, zh, ja, ko, ro, sv, hu } from './locales';

export type Locale = 'fr' | 'en' | 'de' | 'es' | 'it' | 'zh' | 'ja' | 'ko' | 'ro' | 'sv' | 'hu';

export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ro: 'Română',
  sv: 'Svenska',
  hu: 'Magyar',
};

const messages: Record<Locale, Record<string, string>> = { fr, en, de, es, it, zh, ja, ko, ro, sv, hu };

export const locale = writable<Locale>('fr');

/**
 * 🔴 LE REPLI SE FAIT EN ANGLAIS, PAS EN FRANÇAIS.
 *
 * Silviu, testeur roumain, v0.9.161 : des mots FRANÇAIS au milieu d'une
 * interface roumaine. `fr.ts` est la SOURCE du catalogue — c'est elle que
 * `scripts/check-i18n.mjs` compare aux dix autres — mais être la source ne
 * fait pas d'elle la langue de secours. Une clé absente d'un dictionnaire
 * rendait du français à un lecteur qui n'en lit pas un mot, alors que
 * l'anglais est ce que tout le monde peut au moins déchiffrer.
 *
 * La parité est tenue à 100 % par `check-i18n` : ce repli ne devrait jamais
 * servir. Il sert quand même — le temps d'une branche où une clé vient d'être
 * ajoutée à `fr.ts` seul, ou pour une clé construite à l'exécution (les
 * libellés de sections Qobuz passent par `$t` alors qu'ils n'en sont pas).
 * C'est précisément dans ces trous que le français fuyait.
 *
 * `en` reste dernier avant la clé nue : si elle manque là aussi, rendre la
 * clé est plus honnête que rendre une autre langue.
 */
export const t = derived(locale, ($l) => {
  const dict = messages[$l] ?? messages.en;
  return (key: string) => dict[key] ?? messages.en[key] ?? key;
});
