/**
 * tune-server-rust#6001 — l'arbre des genres tiré de données libres
 * (MusicBrainz pour la liste, Wikidata P8052 + P279 pour la hiérarchie, CC0).
 *
 * Route publiée en rc7 (#6628, #6671) : `GET /library/genre-tree/musicbrainz`.
 *
 * - `202 {statut: "en_preparation"}` tant que la liste des genres MusicBrainz
 *   n'a pas été lue : le serveur la lit alors en tâche de fond, une seule fois ;
 * - `200 {statut: "ok" | "partiel", source, licence, noeuds, non_reconnus}`.
 *
 * C'est une PROPOSITION en lecture seule : l'arbre réglé par l'auditeur
 * (`/library/genre-tree`) n'est jamais touché. L'écran le dit.
 *
 * Ce module ne fait que lire et mettre en ordre ; il se méfie de ce qu'il
 * reçoit (un serveur antérieur rend 404, un champ peut manquer).
 */
import { BASE, fetchJSON } from './api';

export interface NoeudGenreMb {
  /** Le genre tel qu'il est écrit dans la bibliothèque. */
  genre: string;
  mbid: string;
  /** Le nom MusicBrainz (minuscules). */
  nom_musicbrainz: string;
  parents: string[];
  sous_genres: string[];
}

export type EtatArbreMb =
  | { etat: 'pret'; partiel: boolean; source: string; licence: string; noeuds: NoeudGenreMb[]; nonReconnus: string[] }
  | { etat: 'en_preparation' }
  /** Le serveur ne connaît pas la route (antérieur à la rc7). */
  | { etat: 'absent' };

const chaines = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

/** Lit une réponse du serveur, sans rien supposer de sa forme. */
export function lireReponseArbreMb(corps: unknown): EtatArbreMb {
  const c = (corps ?? {}) as Record<string, unknown>;
  if (c.statut === 'en_preparation') return { etat: 'en_preparation' };
  const noeuds: NoeudGenreMb[] = (Array.isArray(c.noeuds) ? c.noeuds : [])
    .filter((n): n is Record<string, unknown> => !!n && typeof (n as any).genre === 'string')
    .map((n) => ({
      genre: String(n.genre),
      mbid: typeof n.mbid === 'string' ? n.mbid : '',
      nom_musicbrainz: typeof n.nom_musicbrainz === 'string' ? n.nom_musicbrainz : String(n.genre),
      parents: chaines(n.parents),
      sous_genres: chaines(n.sous_genres),
    }))
    .sort((a, b) => a.genre.localeCompare(b.genre, undefined, { sensitivity: 'base' }));
  return {
    etat: 'pret',
    partiel: c.statut === 'partiel',
    source: typeof c.source === 'string' ? c.source : 'MusicBrainz, Wikidata',
    licence: typeof c.licence === 'string' ? c.licence : 'CC0',
    noeuds,
    nonReconnus: chaines(c.non_reconnus).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
  };
}

/** Le genre se cherche dans son nom de bibliothèque, son nom MusicBrainz,
 *  ses parents et ses sous-genres ; casse et accents ignorés. */
export function filtrerNoeuds(noeuds: NoeudGenreMb[], q: string): NoeudGenreMb[] {
  const plier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cle = plier(q.trim());
  if (!cle) return noeuds;
  return noeuds.filter((n) =>
    [n.genre, n.nom_musicbrainz, ...n.parents, ...n.sous_genres].some((x) => plier(x).includes(cle)),
  );
}

/** `GET /library/genre-tree/musicbrainz`, sans bandeau d'erreur : 404 dit
 *  « serveur antérieur », toute autre panne remonte à l'appelant. */
export async function chargerArbreGenresMb(): Promise<EtatArbreMb> {
  try {
    const corps = await fetchJSON<unknown>(`${BASE}/library/genre-tree/musicbrainz`, undefined, undefined, true);
    return lireReponseArbreMb(corps);
  } catch (e: any) {
    if (e?.status === 404) return { etat: 'absent' };
    throw e;
  }
}
