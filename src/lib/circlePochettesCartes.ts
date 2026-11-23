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
import { lectureSeuleADistance } from './circleDroits';
import { mosaique, type PochetteMorceau } from './circlePlaylistVue';

const cache = new Map<string, Promise<PochetteMorceau[]>>();
let file: Promise<unknown> = Promise.resolve();

/** Au-delà, une carte abandonne (lecture ou résolution qui ne répond pas) et la file passe à la suivante. */
export const DELAI_CARTE_MS = 8000;
let delaiCarteMs = DELAI_CARTE_MS;
/** Pour les bancs : raccourcir le délai d'abandon. */
export function reglerDelaiCarte(ms: number): void { delaiCarteMs = ms; }

function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const abandon = new Promise<never>((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error('délai dépassé')), ms); });
  return Promise.race([p, abandon]).finally(() => clearTimeout(minuteur));
}

export function pochettesDeCarte(id: IdOpaque, version: number): Promise<PochetteMorceau[]> {
  // À distance, la résolution (POST) est refusée : pas de mosaïque, la tuile générique.
  if (lectureSeuleADistance()) return Promise.resolve([]);
  const cle = `${String(id)}@${version}`;
  const deja = cache.get(cle);
  if (deja) return deja;
  const p = file.then(() => avecDelai((async () => {
    const pl = await lirePlaylistCercle(id);
    if (!pl.items.length) return [] as PochetteMorceau[];
    const r = await resoudrePlaylistCercle(id);
    return mosaique(pl.items, r);
  })(), delaiCarteMs)).catch(() => {
    // Un échec passager (panne, délai) n'est pas gardé : un prochain affichage réessaiera.
    cache.delete(cle);
    return [] as PochetteMorceau[];
  });
  file = p;
  cache.set(cle, p);
  return p;
}

/** Quatre pochettes en mosaïque ; de une à trois : la première, seule (comme l'en-tête de la vue). */
export const tuilesDeCarte = (p: readonly PochetteMorceau[]) => (p.length >= 4 ? p.slice(0, 4) : p.slice(0, 1));

/** Pour les bancs : oublier ce qui a été lu. */
export function viderPochettesDeCarte(): void { cache.clear(); file = Promise.resolve(); delaiCarteMs = DELAI_CARTE_MS; }
