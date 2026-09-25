// Les onze dictionnaires, chargés UNE fois, à la collecte du fichier (#1308).
//
// Les bancs « le libellé existe dans les onze langues » importaient chaque
// dictionnaire DANS le corps du test (`await import` par langue). Ces fichiers
// pèsent 260 à 330 Ko chacun : les transformer et les évaluer sous la
// concurrence de toute la porte prenait, au-delà d'un certain nombre de
// fichiers, plus que les 5 s allouées à un test — et le test expirait au
// hasard, sans qu'une ligne de son sujet ait changé.
//
// Un import STATIQUE est résolu pendant la collecte du fichier, que vitest
// ne chronomètre pas. Le corps du test ne fait plus qu'une recherche dans un
// objet en mémoire.
//
// 🔴 Depuis tune-server-rust#4800 (cause 4), `locales/index.ts` n'exporte
// PLUS les dictionnaires : il ne porte que des `import()` — un chunk par
// langue, pour que le bundle ne charge que la langue active. Les onze ne
// sont plus importés en statique qu'ici — via `lesOnzeLangues.ts`, l'espace
// de noms qui ne compte QUE les onze — et c'est ce fichier que les bancs
// importent (`import { fr, dictionnaire } from './onzeDictionnaires'`).
// `setupLocales.ts` les enregistre dans `i18n.ts` avant chaque banc, pour
// que `$t` reste synchrone sous test comme il l'était.
import { fr, en, de, es, it, zh, ja, ko, ro, sv, hu } from './lesOnzeLangues';

export { fr, en, de, es, it, zh, ja, ko, ro, sv, hu };

export const ONZE_LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;

const DICTIONNAIRES: Record<string, Record<string, string>> = {
  fr, en, de, es, it, zh, ja, ko, ro, sv, hu,
} as unknown as Record<string, Record<string, string>>;

/** Le dictionnaire d'une langue, déjà chargé. Une langue inconnue est une erreur de banc. */
export function dictionnaire(code: string): Record<string, string> {
  const d = DICTIONNAIRES[code.replace(/\.ts$/, '')];
  if (!d) throw new Error(`langue inconnue du banc : ${code}`);
  return d;
}
