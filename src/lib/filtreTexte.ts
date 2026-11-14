/**
 * Le filtrage d'une liste DÉJÀ chargée par la zone de recherche d'un écran
 * (`ChampRecherche`). Décisions de Bertrand, 14/11/2026 : Historique,
 * Collections, Répertoires, Playlists intelligentes, Titres bannis.
 *
 * - casse et accents ignorés (`fold`) ;
 * - plusieurs mots : TOUS doivent se trouver, chacun dans n'importe lequel
 *   des champs donnés (« evans portrait ») ;
 * - une recherche vide laisse tout passer, et rend la MÊME liste (pas de
 *   copie : les `{#each}` ne se recalculent pas pour rien).
 */
import { fold } from './utils';

export type Champs = readonly (string | number | null | undefined)[];

/** Les mots de la recherche, repliés. Vide : aucun filtre. */
export function motsDe(recherche: string | null | undefined): string[] {
  return fold(recherche ?? '').split(/\s+/).filter(Boolean);
}

/** Ces champs répondent-ils à la recherche ? */
export function champsRepondent(champs: Champs, recherche: string | null | undefined): boolean {
  const mots = motsDe(recherche);
  if (!mots.length) return true;
  const texte = fold(champs.filter((c) => c != null && c !== '').join('\n'));
  return mots.every((m) => texte.includes(m));
}

/** La liste filtrée, dans l'ordre reçu. */
export function filtrerParTexte<T>(liste: readonly T[], recherche: string | null | undefined, champs: (x: T) => Champs): T[] {
  if (!motsDe(recherche).length) return liste as T[];
  return liste.filter((x) => champsRepondent(champs(x), recherche));
}
