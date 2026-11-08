/**
 * #7872 (tune-server-rust) — la requête avancée de la Bibliothèque.
 *
 * Le serveur lit un texte comme
 * `composer:beethoven conductor:karajan year:1960..1969 -genre:live`
 * (grammaire de #7848) et rend les pistes qui y répondent, page par page,
 * sous la forme de `GET /library/tracks` : `items`, `total`, `limit`,
 * `offset`, `has_more`.
 *
 * Une requête mal formée rend 400 avec `{position, attendu, message}` : la
 * position est un indice de CARACTÈRE (pas d'octet), compté depuis 0. Le
 * repère dans la saisie est celui de #6287 (`requeteTextuelle.decouperALaPosition`).
 *
 * Les mêmes textes servent l'`expression` d'une collection intelligente,
 * que le serveur refuse avec le même corps 400.
 */
import { BASE, fetchJSON } from './api';
import type { Track } from './types';

/** Une requête refusée : où, et ce qui était attendu. */
export interface ErreurDeRequete {
  position: number;
  attendu: string;
  message: string;
}

export interface PageDeRequete {
  items: Track[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type ReponseDeRequete =
  | { ok: true; page: PageDeRequete }
  | { ok: false; erreur: ErreurDeRequete };

/** La taille d'une page de résultats. */
export const PAGE_DE_REQUETE = 50;

/**
 * Les exemples de l'aide « ? ». Le texte est la requête elle-même, jamais
 * traduit ; seule son explication l'est (`cle`).
 */
export const EXEMPLES_DE_REQUETE: ReadonlyArray<{ requete: string; cle: string }> = [
  { requete: 'composer:beethoven conductor:karajan year:1960..1969 -genre:live', cle: 'requeteAvancee.exemple.karajan' },
  { requete: 'artist:"miles davis" (album:"kind of blue" OR album:"blue train")', cle: 'requeteAvancee.exemple.ou' },
  { requete: 'sample_rate:>=96k bit_depth:24 format:flac', cle: 'requeteAvancee.exemple.hires' },
  { requete: 'rating:>=4 -loved', cle: 'requeteAvancee.exemple.notes' },
  { requete: 'performer:coltrane year:..1965', cle: 'requeteAvancee.exemple.plage' },
  { requete: 'title:="so what"', cle: 'requeteAvancee.exemple.egal' },
];

/** Les champs reconnus par le serveur, pour l'aide. */
export const CHAMPS_DE_REQUETE = {
  texte: ['artist', 'albumartist', 'album', 'title', 'genre', 'format', 'label'],
  nombres: ['year', 'sample_rate', 'bit_depth', 'channels', 'duration', 'track', 'disc', 'rating'],
  roles: ['composer', 'conductor', 'performer', 'producer', 'arranger', 'engineer', 'mixer', 'remixer', 'lyricist'],
} as const;

/** Le corps 400 du serveur, s'il en est un ; sinon `null`. */
export function lireErreurDeRequete(corps: unknown): ErreurDeRequete | null {
  if (corps == null || typeof corps !== 'object') return null;
  const c = corps as Record<string, unknown>;
  if (typeof c.position !== 'number' || !Number.isFinite(c.position)) return null;
  return {
    position: Math.max(0, Math.floor(c.position)),
    attendu: typeof c.attendu === 'string' ? c.attendu : '',
    message: typeof c.message === 'string' ? c.message : (typeof c.error === 'string' ? c.error : ''),
  };
}

/**
 * L'indice en UNITÉS UTF-16 d'une position en caractères : celui qu'attend
 * `input.setSelectionRange` pour poser le curseur sur la faute.
 */
export function indiceUtf16(saisie: string, position: number): number {
  return Array.from(saisie).slice(0, Math.max(0, position)).join('').length;
}

/** `GET /library/query` : une page de pistes, ou le refus de la requête. */
export async function chercherParRequete(
  q: string,
  offset = 0,
  limit = PAGE_DE_REQUETE,
  signal?: AbortSignal,
): Promise<ReponseDeRequete> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (offset > 0) params.set('offset', String(offset));
  const corps = await fetchJSON<any>(
    `${BASE}/library/query?${params}`,
    signal ? { signal } : undefined,
    (statut) => statut === 400,
  );
  const erreur = lireErreurDeRequete(corps);
  if (erreur) return { ok: false, erreur };
  return {
    ok: true,
    page: {
      items: Array.isArray(corps?.items) ? corps.items : [],
      total: typeof corps?.total === 'number' ? corps.total : 0,
      limit: typeof corps?.limit === 'number' ? corps.limit : limit,
      offset: typeof corps?.offset === 'number' ? corps.offset : offset,
      hasMore: corps?.has_more === true,
    },
  };
}

