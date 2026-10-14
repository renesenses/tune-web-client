/**
 * Favoris radio → playlist Qobuz (go de Bertrand du 14/10/2026 : « Dans
 * favoris radio, je veux pouvoir créer une playlist dans Qobuz »).
 *
 * Les favoris radio sont des MORCEAUX captés à l'antenne, pas des stations.
 * Le serveur cherche chacun dans Qobuz (`POST /radio-favorites/match-preview`)
 * et rend la correspondance ; l'écran la montre, l'utilisateur valide ou
 * écarte chaque ligne, puis la playlist est créée avec les titres RETENUS
 * (`POST /radio-favorites/create-playlist` avec `track_ids`).
 *
 * Ce module tient les règles de choix, sans Svelte, pour qu'elles se testent
 * sans monter l'écran.
 */

export type StatutAppariement =
  | 'matched'
  | 'approximate'
  | 'ambiguous'
  | 'not_found'
  | 'search_failed';

export interface PisteService {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  cover_url?: string | null;
  duration_ms?: number;
  score: number;
}

export interface LigneApercu {
  favorite_id: number;
  title: string;
  artist: string;
  station_name?: string;
  cover_url?: string | null;
  status: StatutAppariement;
  match: PisteService | null;
  alternatives: PisteService[];
  /** Le favori PRÉCÉDENT qui désigne déjà la même piste Qobuz. */
  duplicate_of: number | null;
}

export interface ApercuFavorisRadio {
  service: string;
  favorites_count: number;
  matched: number;
  approximate: number;
  ambiguous: number;
  not_found: number;
  search_failed: number;
  items: LigneApercu[];
}

/** Pour chaque favori : l'identifiant Qobuz retenu, ou `null` (écarté). */
export type Choix = Record<number, string | null>;

/**
 * Le nom proposé : « Favoris radio — <date du jour> », dans la langue de
 * l'interface. `modele` est le texte traduit, avec `{date}`.
 */
export function nomParDefaut(modele: string, date: Date, langue: string): string {
  let jour: string;
  try {
    jour = date.toLocaleDateString(langue);
  } catch {
    jour = date.toISOString().slice(0, 10);
  }
  return modele.replace('{date}', jour);
}

/**
 * Ce qui est coché à l'ouverture. Seules les correspondances SÛRES le sont :
 * une approximation ou une ambiguïté se valide à la main, sinon l'écran
 * reviendrait à la création « en un geste » qu'il est censé remplacer. Un
 * doublon d'un favori précédent part décoché : la piste est déjà retenue.
 */
export function choixInitial(lignes: LigneApercu[]): Choix {
  const choix: Choix = {};
  for (const l of lignes) {
    choix[l.favorite_id] =
      l.status === 'matched' && l.match && l.duplicate_of == null ? l.match.id : null;
  }
  return choix;
}

/** Les pistes entre lesquelles choisir : la correspondance, puis les suivantes. */
export function candidatsDe(ligne: LigneApercu): PisteService[] {
  const vus = new Set<string>();
  const out: PisteService[] = [];
  for (const p of [ligne.match, ...(ligne.alternatives ?? [])]) {
    if (p && p.id && !vus.has(p.id)) {
      vus.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** Une ligne se coche-t-elle ? Il faut au moins une piste à proposer. */
export function selectionnable(ligne: LigneApercu): boolean {
  return candidatsDe(ligne).length > 0;
}

/**
 * Les identifiants à envoyer, dans l'ordre des favoris, sans doublon. Un
 * choix qui ne figure pas parmi les candidats de sa ligne est ignoré : on
 * n'envoie que ce que l'écran a MONTRÉ.
 */
export function titresRetenus(lignes: LigneApercu[], choix: Choix): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const l of lignes) {
    const id = choix[l.favorite_id];
    if (!id || vus.has(id)) continue;
    if (!candidatsDe(l).some((p) => p.id === id)) continue;
    vus.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Les playlists Qobuz où l'on peut VERSER des titres : seulement celles que
 * le serveur déclare modifiables (`editable: true`, web#2097). Une playlist
 * suivie refuserait l'ajout en 401.
 */
export function playlistsModifiables<T extends { editable?: boolean | null }>(liste: T[] | null | undefined): T[] {
  return (liste ?? []).filter((p) => p?.editable === true);
}

/** La clé de traduction du badge d'une ligne, ou `null` pour une ligne sûre. */
export function cleBadge(ligne: LigneApercu): string | null {
  if (ligne.duplicate_of != null && ligne.match) return 'v2.fav.qobuzDuplicate';
  switch (ligne.status) {
    case 'approximate':
      return 'v2.fav.qobuzApprox';
    case 'ambiguous':
      return 'v2.fav.qobuzAmbiguous';
    case 'not_found':
      return 'v2.fav.qobuzNotFound';
    case 'search_failed':
      return 'v2.fav.qobuzSearchFailed';
    default:
      return null;
  }
}
