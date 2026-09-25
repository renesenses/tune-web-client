/**
 * Les onze langues, chargées À LA DEMANDE — jamais toutes à la fois.
 *
 * 🔴 Ce fichier ré-exportait les onze dictionnaires en statique. Chaque
 * dictionnaire pèse 210 à 265 Ko de source ; les onze ensemble, 2,5 Mo, dans
 * un bundle principal de 4,1 Mo chargé d'un bloc avant le premier rendu
 * (tune-server-rust#4800, cause 4). Un lecteur roumain téléchargeait,
 * analysait et évaluait le japonais, le coréen et le chinois pour ne jamais
 * en lire un caractère.
 *
 * Chaque entrée est désormais un `import()` : Vite en fait UN CHUNK PAR
 * LANGUE, et seul celui de la langue active — plus l'anglais, langue de
 * repli — traverse le réseau. `i18n.ts` est le seul consommateur de cette
 * table ; les bancs, eux, prennent les dictionnaires dans
 * `__tests__/onzeDictionnaires.ts`, en statique et à la collecte (#1308).
 *
 * ⚠️ Pas de `import.meta.glob` ici : la table doit rester lisible par
 * `scripts/check-i18n.mjs`, qui découvre les langues sur disque et vérifie
 * que chacune est enregistrée dans `localeNames` (i18n.ts). Une langue
 * ajoutée sur disque sans sa ligne ici casse la compilation — c'est voulu.
 */
export type Locale = 'fr' | 'en' | 'de' | 'es' | 'it' | 'zh' | 'ja' | 'ko' | 'ro' | 'sv' | 'hu';

export type Dictionnaire = Record<string, string>;

type Chargeur = () => Promise<{ default: Dictionnaire }>;

export const CHARGEURS: Record<Locale, Chargeur> = {
  fr: () => import('./fr'),
  en: () => import('./en'),
  de: () => import('./de'),
  es: () => import('./es'),
  it: () => import('./it'),
  zh: () => import('./zh'),
  ja: () => import('./ja'),
  ko: () => import('./ko'),
  ro: () => import('./ro'),
  sv: () => import('./sv'),
  hu: () => import('./hu'),
};
