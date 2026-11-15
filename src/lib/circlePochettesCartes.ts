/**
 * Tune Circle — les pochettes des CARTES de playlists de cercle (Découvrir,
 * Playlists partagées, « Vos playlists »), recette de Bertrand du 15/11 :
 * « Manque les covers de playlists !! ».
 *
 * Même source que l'en-tête de la vue d'une playlist (`PlaylistCercleV2`) :
 * la playlist (`GET`), sa résolution CHEZ MOI (`POST …/resolve`), puis
 * `mosaique` — pochettes de MA bibliothèque ou de MON service, jamais du
 * serveur du membre qui a ajouté. Aucune donnée inventée : rien de résolu,
 * pas de pochette, la vignette du thème reste.
 *
 * Sans rafale : une seule playlist à la fois (file), et une seule fois par
 * version de playlist (cache) ; ce sont les cartes visibles qui demandent
 * (`IntersectionObserver` dans `VignettePochettesCercle`).
 */
import { lirePlaylistCercle, resoudrePlaylistCercle, type IdOpaque } from './circlePlaylists';
import { mosaique, type PochetteMorceau } from './circlePlaylistVue';

const cache = new Map<string, Promise<PochetteMorceau[]>>();
let file: Promise<unknown> = Promise.resolve();

export function pochettesDeCarte(id: IdOpaque, version: number): Promise<PochetteMorceau[]> {
  const cle = `${String(id)}@${version}`;
  const deja = cache.get(cle);
  if (deja) return deja;
  const p = file.then(async () => {
    const pl = await lirePlaylistCercle(id);
    if (!pl.items.length) return [];
    const r = await resoudrePlaylistCercle(id);
    return mosaique(pl.items, r);
  }).catch(() => [] as PochetteMorceau[]);
  file = p;
  cache.set(cle, p);
  return p;
}

/** Quatre pochettes en mosaïque ; de une à trois : la première, seule (comme l'en-tête de la vue). */
export const tuilesDeCarte = (p: readonly PochetteMorceau[]) => (p.length >= 4 ? p.slice(0, 4) : p.slice(0, 1));

/** Pour les bancs : oublier ce qui a été lu. */
export function viderPochettesDeCarte(): void { cache.clear(); file = Promise.resolve(); }
