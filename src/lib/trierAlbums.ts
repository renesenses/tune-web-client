import type { Album } from './types';
import { ordreNaturel } from './ordreNaturel';

/**
 * Trie les albums d'un artiste par année, dans le sens demandé.
 *
 * Extrait du composant pour une seule raison : la règle de l'année inconnue ne
 * se déduit pas à la lecture du gabarit, et c'est elle qui se casserait à la
 * première réécriture.
 *
 * ## Un album sans année part TOUJOURS en fin de liste
 *
 * Dans les deux sens. Le réflexe serait de traiter l'année absente comme un
 * zéro et de laisser le tri faire : en croissant elle finit en tête, en
 * décroissant en queue. Le résultat se lit alors comme un tri cassé — l'auteur
 * cherche son album le plus récent et tombe sur trois pochettes sans date.
 *
 * Ce n'est pas le tri qui est en cause, c'est la donnée qui manque ; l'ordre
 * doit le dire de la même façon quel que soit le sens.
 *
 * ## Le titre départage
 *
 * Deux albums de la même année, ou deux albums sans année, sont classés par
 * titre. Sans ce départage l'ordre dépendrait de celui rendu par le serveur, et
 * changerait d'un affichage à l'autre sans raison visible.
 */
export function trierAlbumsParAnnee(albums: Album[], sens: 'asc' | 'desc'): Album[] {
  const signe = sens === 'asc' ? 1 : -1;
  // #1434 — « Disc 2 » avant « Disc 10 » : l'ordre des NOMBRES, pas du texte.
  const parTitre = (a: Album, b: Album) => ordreNaturel(a.title, b.title);

  return [...albums].sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    if (ya === 0 && yb === 0) return parTitre(a, b);
    if (ya === 0) return 1;
    if (yb === 0) return -1;
    if (ya !== yb) return (ya - yb) * signe;
    return parTitre(a, b);
  });
}

/**
 * Les clés de tri d'une liste d'albums à l'écran — recherche et fiche artiste
 * (Bertrand, 16/09/2026 : « tri par Album / dates asc desc pour un artiste et
 * Artiste / dates asc desc pour un album », puis « idem dans la vue Library /
 * Artists »).
 *
 * `pertinence` = l'ordre que le serveur a rendu, intact : c'est le défaut de la
 * recherche, dont l'ordre EST une information (le meilleur d'abord).
 */
export const CLES_TRI_ALBUMS = ['pertinence', 'title', 'artist', 'year', 'release_date', 'added_at'] as const;
export type CleTriAlbums = (typeof CLES_TRI_ALBUMS)[number];
export type SensTri = 'asc' | 'desc';

/** Le libellé i18n de chaque clé — tous existent déjà dans les onze langues. */
export const LIBELLES_TRI_ALBUMS: Record<CleTriAlbums, string> = {
  pertinence: 'home.sortRelevance',
  title: 'v2.lib.sortTitle',
  artist: 'v2.lib.sortArtist',
  year: 'v2.lib.sortYear',
  release_date: 'library.sortReleaseDate',
  added_at: 'library.sortAddedDate',
};

const plier = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const parTexte = (x: string, y: string) =>
  plier(x).localeCompare(plier(y), undefined, { numeric: true, sensitivity: 'base' });

/**
 * La date de sortie telle que le serveur la trie :
 * `release_date`, sinon `original_date`, sinon l'année. Les trois formes
 * (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) se comparent en texte — l'ordre
 * lexicographique est l'ordre chronologique sur ces formes.
 */
function dateDeSortie(a: Album): string | null {
  const r = (a as any).release_date ?? (a as any).original_date ?? (a.year != null ? String(a.year) : null);
  return typeof r === 'string' && r.trim() ? r.trim() : null;
}

/**
 * Trie des albums par une clé, dans un sens.
 *
 * Même règle que le serveur pour les dossiers (`album_order.rs`) : le sens ne
 * s'applique qu'à la clé principale, une valeur MANQUANTE part toujours en fin
 * de liste dans les deux sens, et les départages (titre, puis artiste) restent
 * croissants pour qu'une égalité se lise pareil quel que soit le sens.
 *
 * Ne modifie pas la liste reçue. `pertinence` la rend telle quelle — renversée
 * si `desc`, ce qui est le seul sens que « l'ordre inverse de pertinence »
 * puisse avoir.
 */
export function trierAlbums(albums: Album[], cle: CleTriAlbums, sens: SensTri): Album[] {
  if (cle === 'pertinence') return sens === 'asc' ? [...albums] : [...albums].reverse();
  const signe = sens === 'asc' ? 1 : -1;
  const departage = (a: Album, b: Album) =>
    parTexte(a.title ?? '', b.title ?? '') || parTexte(a.artist_name ?? '', b.artist_name ?? '');

  // La clé principale, en deux formes : texte ou nombre. `null` = manquante.
  const valeur = (a: Album): string | number | null => {
    switch (cle) {
      case 'title': return a.title?.trim() || null;
      case 'artist': return a.artist_name?.trim() || null;
      case 'year': return typeof a.year === 'number' && a.year > 0 ? a.year : null;
      case 'release_date': return dateDeSortie(a);
      case 'added_at': {
        const t = (a as any).added_at;
        return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
      }
    }
  };

  return [...albums].sort((a, b) => {
    const va = valeur(a), vb = valeur(b);
    if (va == null && vb == null) return departage(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : parTexte(String(va), String(vb));
    return c !== 0 ? c * signe : departage(a, b);
  });
}
