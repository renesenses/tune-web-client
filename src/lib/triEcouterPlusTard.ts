/**
 * Les tris de l'écran « Écouter plus tard » — web#1802, suite de web#1653.
 *
 * Bertrand, 29/09/2026 : une vue en grille et des tris — date d'ajout (les
 * plus récents d'abord), titre, artiste, type d'élément (album, titre,
 * playlist).
 *
 * ## Une seule suite, trois familles mêlées
 *
 * Le sas se lit par trois routes (`/tags/{id}/albums|tracks|playlists`). Trier
 * « par titre » ou « par date d'ajout » n'a de sens que sur la suite ENTIÈRE :
 * trois sections triées chacune dans son coin rendraient un ordre que personne
 * n'a demandé. Les trois familles sont donc ramenées ici à UNE forme
 * (`ElementSas`), et le tri « type » est celui qui les regroupe.
 *
 * ## 🔴 La date d'ajout n'existe que si le serveur la rend
 *
 * `tagged_at` arrive avec tune-server-rust#5478. Un serveur plus ancien ne la
 * rend pas : proposer « Ajout récent » y trierait sur du vide, dans un ordre
 * qui aurait l'air d'une réponse. Le tri n'est donc OFFERT que si au moins une
 * ligne porte la clé (`dateDisponible`). Une ligne rendue avec
 * `tagged_at: null` (posée avant la migration) va en fin de liste, dans
 * l'ordre du serveur : rien n'est inventé pour elle.
 */
import { comparerAlphabetique } from './ordreAlphabetique';

export type GenreSas = 'album' | 'track' | 'playlist';

/** L'ordre des familles pour le tri « type » — celui que FabienM énonce. */
export const ORDRE_DES_GENRES: readonly GenreSas[] = ['album', 'track', 'playlist'];

export const TRIS_SAS = ['ajout', 'titre', 'artiste', 'type'] as const;
export type TriSas = (typeof TRIS_SAS)[number];

/** La clé i18n de chaque tri. */
export const LIBELLE_TRI_SAS: Record<TriSas, string> = {
  ajout: 'v2.later.sortAdded',
  titre: 'v2.later.sortTitle',
  artiste: 'v2.later.sortArtist',
  type: 'v2.later.sortType',
};

/** La clé i18n du nom SINGULIER de chaque famille. */
export const LIBELLE_GENRE_SAS: Record<GenreSas, string> = {
  album: 'v2.later.kindAlbum',
  track: 'v2.later.kindTrack',
  playlist: 'v2.later.kindPlaylist',
};

export interface ElementSas {
  genre: GenreSas;
  /** La ligne telle que le serveur l'a rendue. */
  ligne: any;
  titre: string;
  artiste: string;
  /** La date du dépôt, ou `null` (inconnue, ou serveur qui ne la rend pas). */
  depose: string | null;
  /** Le rang dans la réponse du serveur : le départage de tous les tris. */
  rang: number;
}

/** Les trois familles lues, ramenées à une seule suite. */
export function elementsDuSas(
  albums: readonly any[],
  pistes: readonly any[],
  listes: readonly any[],
): ElementSas[] {
  const sortie: ElementSas[] = [];
  const ajouter = (genre: GenreSas, ligne: any, titre: unknown, artiste: unknown) => {
    const d = ligne?.tagged_at;
    sortie.push({
      genre,
      ligne,
      titre: String(titre ?? ''),
      artiste: String(artiste ?? ''),
      depose: typeof d === 'string' && d !== '' ? d : null,
      rang: sortie.length,
    });
  };
  for (const a of albums) ajouter('album', a, a?.title, a?.artist_name);
  for (const p of pistes) ajouter('track', p, p?.title, p?.artist_name);
  for (const l of listes) ajouter('playlist', l, l?.name, null);
  return sortie;
}

/**
 * Le serveur rend-il la date du dépôt ? Oui dès qu'une ligne porte la CLÉ,
 * même nulle : c'est la réponse d'un serveur qui la connaît.
 */
export function dateDisponible(elements: readonly ElementSas[]): boolean {
  return elements.some((e) => e.ligne != null && typeof e.ligne === 'object' && 'tagged_at' in e.ligne);
}

/** Les tris offerts : « Ajout récent » seulement si la date existe. */
export function trisDisponibles(elements: readonly ElementSas[]): TriSas[] {
  return dateDisponible(elements) ? [...TRIS_SAS] : TRIS_SAS.filter((t) => t !== 'ajout');
}

/**
 * Le tri par DÉFAUT : la date d'ajout quand elle existe ; sinon le type, qui
 * rend l'écran tel qu'il était avant (albums, puis titres, puis playlists).
 */
export function triParDefaut(elements: readonly ElementSas[]): TriSas {
  return dateDisponible(elements) ? 'ajout' : 'type';
}

/**
 * Le tri APPLIQUÉ : le choix retenu s'il est offert, le défaut sinon.
 *
 * 🔴 Un « ajout » retenu contre un serveur qui ne rend plus la date retombe
 * sur le défaut SANS effacer le choix : il revient de lui-même avec le
 * serveur à jour.
 */
export function triApplique(choix: TriSas | null, elements: readonly ElementSas[]): TriSas {
  return choix != null && trisDisponibles(elements).includes(choix) ? choix : triParDefaut(elements);
}

function parRang(a: ElementSas, b: ElementSas): number {
  return a.rang - b.rang;
}

/** Trie sans toucher à l'entrée. Chaque tri se départage par le rang serveur. */
export function trierSas(elements: readonly ElementSas[], tri: TriSas): ElementSas[] {
  const copie = [...elements];
  switch (tri) {
    case 'ajout':
      return copie.sort((a, b) => {
        // Les plus récents d'abord ; une date inconnue en fin de liste.
        if (a.depose && b.depose && a.depose !== b.depose) return a.depose < b.depose ? 1 : -1;
        if (a.depose && !b.depose) return -1;
        if (!a.depose && b.depose) return 1;
        return parRang(a, b);
      });
    case 'titre':
      return copie.sort((a, b) => comparerAlphabetique(a.titre, b.titre) || parRang(a, b));
    case 'artiste':
      return copie.sort((a, b) => {
        // Sans artiste (une playlist) : après ceux qui en ont un.
        if (!a.artiste !== !b.artiste) return a.artiste ? -1 : 1;
        return (
          comparerAlphabetique(a.artiste, b.artiste) ||
          comparerAlphabetique(a.titre, b.titre) ||
          parRang(a, b)
        );
      });
    case 'type':
      return copie.sort(
        (a, b) => ORDRE_DES_GENRES.indexOf(a.genre) - ORDRE_DES_GENRES.indexOf(b.genre) || parRang(a, b),
      );
  }
}
