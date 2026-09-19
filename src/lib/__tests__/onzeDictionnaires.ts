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
// ne chronomètre pas : c'est déjà ainsi que tout banc qui monte un écran
// charge les onze langues (via `i18n.ts`), et aucun d'eux n'a jamais expiré.
// Le corps du test ne fait plus qu'une recherche dans un objet en mémoire.
import { fr, en, de, es, it, zh, ja, ko, ro, sv, hu } from '../locales';

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
