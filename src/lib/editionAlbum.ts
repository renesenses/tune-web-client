/**
 * LE MODE « MODIFIER » DE LA FICHE ALBUM — GO de Bertrand, 25/09/2026.
 *
 * Éditer un album, une compilation ou un coffret SUR PLACE : les champs de
 * l'album, l'ordre et le nom des disques, l'ordre des pistes, le disque de
 * chaque piste, et le titre et l'artiste de chacune.
 *
 * Contrat serveur (lot `batch/edition-coffrets-20260925`) :
 *
 *   GET  /library/albums/{id}/edition          → `EditionReponse`
 *   PUT  /library/albums/{id}/edition          ← `CorpsEdition`, → `EditionReponse`
 *   POST /library/albums/{id}/discs/attach     ← `{ album_id }`
 *   POST /library/albums/{id}/discs/{n}/detach
 *
 * Ce module est PUR : il ne parle ni au réseau ni au DOM. Il sait
 *  - tirer un BROUILLON éditable de la réponse du serveur ;
 *  - déplacer un disque, une piste, dans ce brouillon ;
 *  - dire ce qui a CHANGÉ — le corps du PUT, et rien d'autre : un PUT qui
 *    renverrait tout réécrirait des champs que l'utilisateur n'a pas touchés
 *    et les marquerait « édités à la main » côté serveur (`champs_edites`).
 *
 * 🔴 `discs` est l'ORDRE FINAL, complet : toute piste de l'album y figure
 * exactement une fois, sinon le serveur répond 422. On ne l'envoie donc que
 * s'il a changé, et alors EN ENTIER.
 */

export type ModeCompilation = 'auto' | 'oui' | 'non';

export interface EditionAlbumChamps {
  id: number;
  title: string;
  album_artist: string | null;
  year: number | null;
  label: string | null;
  genre: string | null;
  release_type: string | null;
  cover_path: string | null;
  compilation_mode: ModeCompilation;
  compilation_effective: boolean;
  coffret: 'auto' | 'manuel' | null;
  champs_edites: string[];
}

export interface EditionDisque {
  number: number;
  title: string | null;
  cover_path: string | null;
  track_count: number;
}

export interface EditionPiste {
  id: number;
  disc_number: number | null;
  track_number: number | null;
  title: string;
  artist_name: string | null;
  duration_ms: number | null;
}

export interface EditionReponse {
  album: EditionAlbumChamps;
  discs: EditionDisque[];
  tracks: EditionPiste[];
}

export interface CorpsEdition {
  title?: string;
  album_artist?: string | null;
  year?: number | null;
  label?: string | null;
  genre?: string | null;
  release_type?: string | null;
  compilation_mode?: ModeCompilation;
  discs?: { number: number; title: string | null; track_ids: number[] }[];
  tracks?: { id: number; title?: string; artist_name?: string | null }[];
}

export interface BrouillonPiste {
  id: number;
  title: string;
  artist_name: string;
  duration_ms: number | null;
}

export interface BrouillonDisque {
  /** Le numéro du disque DANS LA RÉPONSE : son identité, pas son rang. */
  number: number;
  title: string;
  pistes: BrouillonPiste[];
}

/** Les champs de texte sont des chaînes : ce sont des `<input>`. */
export interface Brouillon {
  title: string;
  album_artist: string;
  year: string;
  label: string;
  genre: string;
  release_type: string;
  compilation_mode: ModeCompilation;
  disques: BrouillonDisque[];
}

/**
 * La réponse a-t-elle la FORME du contrat ?
 *
 * C'est la sonde qui décide si le bouton « Modifier » apparaît. Un serveur
 * antérieur répond 404 — ou, derrière certains relais, rend la page de l'appli
 * ou un tableau vide. Rien de tout cela n'est une fiche d'édition, et le
 * bouton ne doit pas promettre ce que le serveur ne sait pas faire.
 */
export function estReponseEdition(r: unknown): r is EditionReponse {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const o = r as Record<string, unknown>;
  const a = o.album as Record<string, unknown> | null | undefined;
  return !!a && typeof a === 'object' && typeof a.id === 'number'
    && Array.isArray(o.discs) && Array.isArray(o.tracks);
}

const texte = (v: unknown): string => (v == null ? '' : String(v));
/** Un champ vidé part en `null` : « pas de label », pas « label vide ». */
const ouNul = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/** Le disque d'une piste ; une piste sans numéro de disque est au premier. */
function disqueDe(p: EditionPiste, premier: number): number {
  return p.disc_number ?? premier;
}

/**
 * Le brouillon éditable, disques et pistes dans l'ordre du serveur.
 *
 * Une piste qui désigne un disque que `discs` ne liste pas n'est pas
 * perdue : son disque est ajouté. La perdre ferait partir un `discs` sans
 * elle, donc un 422 — ou pire, sur un serveur tolérant, une piste orpheline.
 */
export function brouillonDepuis(r: EditionReponse): Brouillon {
  const discs = [...r.discs].sort((a, b) => a.number - b.number);
  const premier = discs[0]?.number ?? 1;
  const pistes = [...r.tracks].sort((a, b) =>
    disqueDe(a, premier) - disqueDe(b, premier)
    || (a.track_number ?? 0) - (b.track_number ?? 0));
  const disques: BrouillonDisque[] = discs.map((d) => ({
    number: d.number, title: texte(d.title), pistes: [],
  }));
  for (const p of pistes) {
    const n = disqueDe(p, premier);
    let d = disques.find((x) => x.number === n);
    if (!d) {
      d = { number: n, title: '', pistes: [] };
      disques.push(d);
    }
    d.pistes.push({
      id: p.id, title: texte(p.title), artist_name: texte(p.artist_name), duration_ms: p.duration_ms ?? null,
    });
  }
  const a = r.album;
  return {
    title: texte(a.title),
    album_artist: texte(a.album_artist),
    year: a.year == null ? '' : String(a.year),
    label: texte(a.label),
    genre: texte(a.genre),
    release_type: texte(a.release_type),
    compilation_mode: a.compilation_mode ?? 'auto',
    disques,
  };
}

/** Déplace l'élément `de` au rang `vers` — une copie, jamais l'original. */
export function deplacer<T>(liste: readonly T[], de: number, vers: number): T[] {
  const c = [...liste];
  if (de < 0 || de >= c.length || vers < 0 || vers >= c.length || de === vers) return c;
  const [x] = c.splice(de, 1);
  c.splice(vers, 0, x);
  return c;
}

/**
 * Déplace une piste, dans son disque ou vers un autre.
 *
 * `vers.rang` absent (ou au-delà de la fin) : la piste va EN FIN du disque
 * cible — c'est le menu « Déplacer vers le disque N », et le dépôt sur la
 * zone d'un disque.
 */
export function deplacerPiste(
  disques: readonly BrouillonDisque[],
  de: { disque: number; rang: number },
  vers: { disque: number; rang?: number },
): BrouillonDisque[] {
  const copie = disques.map((d) => ({ ...d, pistes: [...d.pistes] }));
  const source = copie[de.disque];
  const cible = copie[vers.disque];
  if (!source || !cible || de.rang < 0 || de.rang >= source.pistes.length) return copie;
  const [p] = source.pistes.splice(de.rang, 1);
  const rang = vers.rang == null ? cible.pistes.length : Math.min(Math.max(vers.rang, 0), cible.pistes.length);
  cible.pistes.splice(rang, 0, p);
  return copie;
}

export type ErreurBrouillon = 'titreVide' | 'anneeInvalide' | 'titrePisteVide';

/** Ce que le client refuse d'envoyer, avant même le serveur. */
export function validerBrouillon(b: Brouillon): ErreurBrouillon | null {
  if (b.title.trim() === '') return 'titreVide';
  if (b.year.trim() !== '' && !/^\d{1,4}$/.test(b.year.trim())) return 'anneeInvalide';
  for (const d of b.disques) for (const p of d.pistes) if (p.title.trim() === '') return 'titrePisteVide';
  return null;
}

/** La structure des disques, telle que le PUT l'écrit — disques vides exclus. */
function structure(disques: readonly BrouillonDisque[]) {
  return disques
    .filter((d) => d.pistes.length > 0)
    .map((d) => ({ number: d.number, title: ouNul(d.title), track_ids: d.pistes.map((p) => p.id) }));
}

/**
 * Le corps du PUT : ce qui a CHANGÉ entre la réponse et le brouillon.
 *
 * `{}` quand rien n'a bougé — l'indicateur « non enregistré » se lit là, et
 * « Enregistrer » ne part pas.
 */
export function corpsEdition(r: EditionReponse, b: Brouillon): CorpsEdition {
  const o = brouillonDepuis(r);
  const corps: CorpsEdition = {};
  if (b.title.trim() !== o.title.trim()) corps.title = b.title.trim();
  for (const cle of ['album_artist', 'label', 'genre', 'release_type'] as const) {
    if (b[cle].trim() !== o[cle].trim()) corps[cle] = ouNul(b[cle]);
  }
  if (b.year.trim() !== o.year.trim()) corps.year = b.year.trim() === '' ? null : Number(b.year.trim());
  if (b.compilation_mode !== o.compilation_mode) corps.compilation_mode = b.compilation_mode;

  const avant = structure(o.disques);
  const apres = structure(b.disques);
  if (JSON.stringify(avant) !== JSON.stringify(apres)) corps.discs = apres;

  const origine = new Map<number, BrouillonPiste>();
  for (const d of o.disques) for (const p of d.pistes) origine.set(p.id, p);
  const pistes: NonNullable<CorpsEdition['tracks']> = [];
  for (const d of b.disques) {
    for (const p of d.pistes) {
      const q = origine.get(p.id);
      if (!q) continue;
      const ligne: NonNullable<CorpsEdition['tracks']>[number] = { id: p.id };
      if (p.title.trim() !== q.title.trim()) ligne.title = p.title.trim();
      if (p.artist_name.trim() !== q.artist_name.trim()) ligne.artist_name = ouNul(p.artist_name);
      if (Object.keys(ligne).length > 1) pistes.push(ligne);
    }
  }
  if (pistes.length) corps.tracks = pistes;
  return corps;
}

/** Les types de sortie que le client connaît : ceux de MusicBrainz (#4767). */
export const TYPES_DE_SORTIE = ['album', 'ep', 'single'] as const;
