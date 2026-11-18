/**
 * web#3157 — le filtre INSTRUMENT de la Bibliothèque (demande ASR, go de
 * Bertrand le 17/11) : retrouver un musicien selon son rôle — au piano, au
 * violon… — et le combiner avec les autres filtres (« Martha Argerich au
 * piano » = la recherche « Argerich » + Instrument · piano).
 *
 * Le serveur sert tout depuis la rc12 (CRD-6, `track_credits.instrument`) :
 *  - `GET /library/facets?fields=instrument` → `{ instrument: [{ value, count }] }`,
 *    `count` = nombre de PISTES créditées de cet instrument ;
 *  - `instrument=…` (clé répétée, casse ignorée) filtre `/library/tracks`,
 *    `/library/facets` et `/library/albums-detailed`.
 *
 * Les noms d'instruments viennent des crédits, tels qu'écrits : ils ne sont
 * pas traduits (il n'existe aucune table de traduction des instruments).
 */
import type { FacetValue } from './api';
import { fold } from './utils';

/**
 * La facette lue dans la réponse de `/library/facets`. `null` quand le
 * serveur ne la sert pas (serveur plus ancien : clé absente) ou que la
 * réponse est illisible — le filtre est alors MASQUÉ, sans message.
 * Les valeurs vides ou mal formées sont ignorées.
 */
export function lireFacetteInstrument(brut: unknown): FacetValue[] | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const liste = (brut as Record<string, unknown>).instrument;
  if (!Array.isArray(liste)) return null;
  const out: FacetValue[] = [];
  for (const x of liste) {
    const v = (x as { value?: unknown } | null)?.value;
    const n = (x as { count?: unknown } | null)?.count;
    if (typeof v !== 'string' || v.trim() === '') continue;
    out.push({ value: v, count: typeof n === 'number' && Number.isFinite(n) ? n : 0 });
  }
  return out;
}

/** Les instruments dont le nom contient le texte cherché (casse et accents
 *  ignorés : « VIOLONCELLE » trouve « violoncelle », « cel » aussi). Les
 *  instruments déjà choisis restent toujours visibles, pour qu'on puisse les
 *  décocher sans effacer la recherche. */
export function filtrerInstruments(
  liste: readonly FacetValue[],
  texte: string,
  choisis: readonly string[] = [],
): FacetValue[] {
  const aiguille = fold(texte.trim());
  if (!aiguille) return [...liste];
  return liste.filter((x) => choisis.includes(x.value) || fold(x.value).includes(aiguille));
}

/** Coche ou décoche un instrument ; plusieurs instruments se combinent en
 *  « Ou » (l'album porte au moins l'un d'eux), comme les autres puces. */
export function basculerInstrument(choisis: readonly string[], v: string): string[] {
  return choisis.includes(v) ? choisis.filter((x) => x !== v) : [...choisis, v];
}
