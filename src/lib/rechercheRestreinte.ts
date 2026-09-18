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

export type TypeRecherche = 'tout' | 'artistes' | 'labels' | 'albums' | 'titres' | 'playlists';

export const TYPES_RECHERCHE: TypeRecherche[] = ['tout', 'artistes', 'labels', 'albums', 'titres', 'playlists'];

/** La section est-elle affichée pour le type choisi ? */
export function sectionVisible(choix: TypeRecherche, section: Exclude<TypeRecherche, 'tout'>): boolean {
  return choix === 'tout' || choix === section;
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
