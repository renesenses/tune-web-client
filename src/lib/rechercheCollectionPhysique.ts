/**
 * « Ma collection physique » — la zone de recherche (Bertrand, recette rc12,
 * 13/11/2026 : l'écran n'en avait pas).
 *
 * Cherche dans le titre de l'album, l'artiste, les labels, les numéros de
 * catalogue et les codes-barres. Filtrage CÔTÉ CLIENT : `GET /collection`
 * rend toute la liste d'un coup (au plus 20 000 exemplaires, `tronquee` le
 * dit), sans pagination ni paramètre de texte — aucune route n'est ajoutée.
 *
 * - casse et accents ignorés (`fold`) ;
 * - plusieurs mots : TOUS doivent se trouver, chacun dans n'importe quel
 *   champ (« miles kind of blue ») ;
 * - code-barres et numéro de catalogue : comparés aussi sans espaces, tirets
 *   ni points (« 5099 7 » trouve « 5099749… », « cbs-62066 » trouve
 *   « CBS 62066 »).
 *
 * `codes_barres` vient du greffon (`plugins/tune-collection-physique`,
 * `lib.rs`) ; un serveur antérieur ne le rend pas, le champ est alors absent.
 */
import { fold } from './utils';

export interface DisqueCherchable {
  titre: string;
  artiste: string;
  labels?: string[] | null;
  numeros_catalogue?: string[] | null;
  codes_barres?: string[] | null;
}

const compact = (s: string) => s.replace(/[\s\-–.\/]/g, '');

function texteDuDisque(d: DisqueCherchable): { libre: string; serre: string } {
  const codes = [...(d.numeros_catalogue ?? []), ...(d.codes_barres ?? [])];
  const libre = fold([d.titre, d.artiste, ...(d.labels ?? []), ...codes].filter(Boolean).join('\n'));
  return { libre, serre: compact(fold(codes.join('\n'))) };
}

/** Le disque répond-il à la recherche ? Une recherche vide laisse tout passer. */
export function disqueRepondA(d: DisqueCherchable, recherche: string): boolean {
  const mots = fold(recherche).split(/\s+/).filter(Boolean);
  if (!mots.length) return true;
  const { libre, serre } = texteDuDisque(d);
  if (mots.every((m) => libre.includes(m))) return true;
  // Un code tapé avec ses espaces (« 5 099749 ») : comparé d'un bloc.
  const bloc = compact(fold(recherche));
  return bloc.length >= 3 && serre.includes(bloc);
}

/** La liste filtrée, dans l'ordre reçu. */
export function filtrerDisques<T extends DisqueCherchable>(disques: readonly T[], recherche: string): T[] {
  if (!recherche.trim()) return disques as T[];
  return disques.filter((d) => disqueRepondA(d, recherche));
}
