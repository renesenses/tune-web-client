/**
 * RECHERCHE GLOBALE : LES ALBUMS D'ARTISTES HOMONYMES, RANGÉS PAR ARTISTE —
 * renesenses/tune-server-rust#9071 (décision de Bertrand du 23/11/2026).
 *
 * « Moonchild » : Qobuz rend à la recherche les albums de DEUX groupes du même
 * nom, l'un sous l'identifiant 790734, l'autre sous 33495939. La grille les
 * mêlait sans rien pour les distinguer. La fiche artiste les sépare déjà
 * depuis #8478 (web#2834) : l'identifiant du service décide, pas le nom.
 *
 * Même règle ici, avec les mêmes fonctions — rien n'est recopié :
 *  - `candidatsHomonymes` dit, pour un nom, quels identifiants le portent
 *    exactement chez un service ;
 *  - `estDeLArtiste` range chaque album sous l'identifiant qui est le sien.
 *
 * Ce qui n'est PAS regroupé, et reste dans la grille commune, à sa place :
 *  - un nom porté par un seul identifiant chez ce service (le cas courant) ;
 *  - un album de la bibliothèque (pas d'identifiant de service) ;
 *  - un album sans `artist_id` ou sans `artist_name` : rien ne dit à quel
 *    homonyme il appartient, on ne devine pas.
 *
 * Sans aucun homonyme, `grouperHomonymesRecherche` rend `null` et l'écran ne
 * change pas.
 */
import type { Album } from './types';
import { candidatsHomonymes, nomNormalise } from './albumsArtisteStreaming';
import { estDeLArtiste } from './discographieConnexes';
import { estSourceDeBibliotheque } from './provenanceBibliotheque';

/** L'artiste d'un groupe : ce que les albums portent, rien de plus. */
export interface ArtisteHomonyme {
  nom: string;
  service: string;
  id: string;
}

/** Un morceau de la grille : un homonyme, ou le reste (`artiste: null`). */
export interface SegmentAlbums {
  cle: string;
  artiste: ArtisteHomonyme | null;
  albums: Album[];
}

const texte = (v: unknown) => (v == null ? '' : String(v).trim());

/** Un album de service qui dit son artiste par nom ET par identifiant. */
function identite(a: Album): { service: string; nom: string; id: string } | null {
  const x = a as Album & { artist_id?: unknown; artist_name?: unknown };
  const service = texte(x?.source);
  if (estSourceDeBibliotheque(service) || service === 'radio') return null;
  const nom = texte(x.artist_name);
  const id = texte(x.artist_id);
  if (!nom || !id || !nomNormalise(nom)) return null;
  return { service, nom, id };
}

/**
 * Range les albums sous chaque artiste homonyme, dans l'ordre d'apparition.
 * `null` quand aucun nom n'est porté par deux identifiants chez un même service.
 */
export function grouperHomonymesRecherche(albums: Album[] | null | undefined): SegmentAlbums[] | null {
  const liste = albums ?? [];
  // Par service et par nom replié : les artistes que les albums citent.
  const parNom = new Map<string, { nom: string; candidats: { id: string; name: string }[] }>();
  for (const a of liste) {
    const i = identite(a);
    if (!i) continue;
    const cle = i.service + '\u0000' + nomNormalise(i.nom);
    const b = parNom.get(cle) ?? { nom: i.nom, candidats: [] };
    b.candidats.push({ id: i.id, name: i.nom });
    parNom.set(cle, b);
  }
  const homonymes = new Map<string, { nom: string; ids: string[] }>();
  for (const [cle, b] of parNom) {
    const ids = candidatsHomonymes(b.candidats, b.nom);
    if (ids.length > 1) homonymes.set(cle, { nom: b.nom, ids });
  }
  if (!homonymes.size) return null;

  const segments: SegmentAlbums[] = [];
  const parCle = new Map<string, SegmentAlbums>();
  const ranger = (cle: string, artiste: ArtisteHomonyme | null, a: Album) => {
    let s = parCle.get(cle);
    if (!s) {
      s = { cle, artiste, albums: [] };
      parCle.set(cle, s);
      segments.push(s);
    }
    s.albums.push(a);
  };
  for (const a of liste) {
    const i = identite(a);
    const h = i ? homonymes.get(i.service + '\u0000' + nomNormalise(i.nom)) : undefined;
    const id = i && h ? h.ids.find((cand) => estDeLArtiste(a, cand, h.nom)) : undefined;
    if (i && id) ranger(`${i.service}:${id}`, { nom: i.nom, service: i.service, id }, a);
    else ranger('reste', null, a);
  }
  return segments;
}
