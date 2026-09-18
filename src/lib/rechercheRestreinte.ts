/**
 * Restreindre la recherche — point 8 d'Yves Corbat (17/09/2026) :
 * « restreindre par type (Artiste, Label, Album et Titre) » et « usage des
 * doubles guillemets dans la recherche ».
 *
 * Le TYPE est un choix unique : les pastilles servaient jusqu'ici à ÉCARTER
 * une section à la fois, si bien qu'il fallait trois clics pour ne garder que
 * les albums.
 *
 * Les GUILLEMETS demandent une phrase exacte. Le serveur les applique à la
 * bibliothèque (`format_fts_query`) ; les services, eux, rendent ce qu'ils
 * veulent — le filtre ci-dessous tient la même promesse sur tout ce qui
 * s'affiche, quelle que soit la source.
 */
import { dansLePerimetreDe } from './perimetreRecherche';

/**
 * Les types affichables. « Tout » n'en est plus un — #1145.
 *
 * Il valait un membre de l'union tant que le type était un CHOIX UNIQUE. La
 * règle retenue pour les deux rangées de pastilles en fait autre chose : une
 * pastille qui RELÂCHE la restriction, c'est-à-dire l'ensemble VIDE. Le garder
 * dans l'union aurait donné deux façons de dire « tout » — la pastille et
 * l'ensemble vide — qui auraient fini par diverger.
 */
export type TypeRecherche = 'artistes' | 'labels' | 'albums' | 'titres' | 'playlists';

export const TYPES_RECHERCHE: TypeRecherche[] = ['artistes', 'labels', 'albums', 'titres', 'playlists'];

/**
 * La section est-elle affichée ?
 *
 * 🔴 La MÊME règle que les sources (`dansLePerimetreDe`), et par le même code :
 * c'est tout l'objet de #1145. Deux rangées identiques à l'œil qui obéissaient
 * à deux modèles de données — un ensemble d'un côté, un choix unique de
 * l'autre — ne pouvaient pas se comporter pareil.
 */
export function sectionVisible(
  selection: ReadonlySet<TypeRecherche>,
  section: TypeRecherche,
): boolean {
  return dansLePerimetreDe(selection as ReadonlySet<string>, section);
}

/** Les passages entre doubles guillemets. Un guillemet resté ouvert court
 *  jusqu'à la fin — la recherche part pendant la frappe. Même découpage que le
 *  serveur (`phrases_et_reste`). */
export function phrasesEntreGuillemets(q: string): string[] {
  if (!q.includes('"')) return [];
  return q
    .split('"')
    .filter((_, i) => i % 2 === 1)
    .map((p) => normaliser(p))
    .filter((p) => p.length > 0);
}

/** Minuscules, sans accents, ponctuation ramenée à une espace. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const CHAMPS = ['name', 'title', 'artist_name', 'album_title', 'album_artist', 'nom'] as const;

/** Chaque phrase doit se trouver, mots entiers et dans l'ordre, dans UN des
 *  champs de l'élément. Sans phrase, tout passe. */
export function respecteLesPhrases(x: any, phrases: string[]): boolean {
  if (!phrases.length) return true;
  const champs = CHAMPS
    .map((c) => x?.[c])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => ` ${normaliser(v)} `);
  return phrases.every((p) => champs.some((c) => c.includes(` ${p} `)));
}
