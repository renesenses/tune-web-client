/**
 * LE SERVEUR REND-IL LES SOURCES DES ARTISTES ? — web#1716.
 *
 * L'onglet Bibliothèque › Artistes chargeait toutes les pistes et tous les
 * albums pour savoir de quelles sources vient chaque artiste (filtre et
 * comptes du menu Source). Un serveur récent les rend avec
 * `/library/artists?provenances=1`.
 *
 * `ArtistesV2` le constate à chaque chargement, sur la réponse elle-même, et
 * l'écrit ici ; `LibraryV2` le lit pour ne plus demander la bibliothèque
 * entière à l'ouverture de l'onglet.
 *
 *  - `null` : pas encore su (l'onglet n'a pas fini son premier chargement) ;
 *  - `true` : les sources sont là, rien d'autre à charger ;
 *  - `false` : serveur ancien, on retombe sur le calcul d'avant.
 */
import { writable } from 'svelte/store';
import type { Artist } from '../types';

export const sourcesArtistesServeur = writable<boolean | null>(null);

/** Une page d'artistes porte-t-elle les sources ? Une page vide ne prouve rien. */
export function pagePorteLesSources(artistes: readonly Artist[]): boolean | null {
  if (!artistes.length) return null;
  return artistes.every((a) => a.provenances != null && typeof a.provenances === 'object');
}

/** La table `id → sources` que `sourcesParArtiste` rendait côté client. */
export function sourcesDepuisLeServeur(artistes: readonly Artist[]): Map<number, Set<string>> {
  const m = new Map<number, Set<string>>();
  for (const a of artistes) {
    if (a.id == null || !a.provenances) continue;
    const cles = Object.keys(a.provenances);
    if (cles.length) m.set(a.id, new Set(cles));
  }
  return m;
}
