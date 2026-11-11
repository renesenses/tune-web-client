/**
 * #7224 — « Chercher dans mes sources » depuis la bibliothèque d'un contact.
 *
 * L'écoute chez un contact est fermée par défaut (décision du 10/10/2026,
 * #6086) : l'écran n'a ni bouton Lire ni action. Ce module donne l'alternative :
 * chercher l'album (titre + artiste) ou la piste dans MES sources — la
 * bibliothèque locale et les services connectés — avec la recherche globale
 * existante (`GET /search`, `federatedSearch`), sans nouvelle route serveur.
 *
 * Pur : aucune dépendance à un écran. Les corps de lecture sont ceux que
 * `SearchV2` envoie déjà (`source` va TOUJOURS avec `streaming_album_id`).
 */
import { federatedSearch } from './api';
import type { Album, FederatedSearchResult, Track } from './types';

export type GenreRecherche = 'album' | 'track';

/** Ce que l'écran cherche : le titre et l'artiste, tels que le contact les porte. */
export interface CibleRecherche {
  genre: GenreRecherche;
  titre: string;
  artiste?: string | null;
}

export interface Correspondance {
  genre: GenreRecherche;
  /** `local` ou la clé du service (`qobuz`, `tidal`…). */
  source: string;
  titre: string;
  artiste: string;
  /** Le corps envoyé à la lecture (`playAndSync`). */
  lecture: Record<string, unknown>;
}

/** Par source et par genre : assez pour choisir, pas assez pour noyer l'écran. */
export const MAX_PAR_SOURCE = 5;
const LIMITE_RECHERCHE = 12;

/** Les termes de la recherche : titre puis artiste, espaces nettoyés. */
export function termesRecherche(c: CibleRecherche): string {
  return [c.titre, c.artiste].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
}

const corpsAlbum = (a: Album, source: string): Record<string, unknown> | null => {
  if (source === 'local') return a.id != null ? { album_id: a.id } : null;
  const sid = (a as any).source_id ?? a.id;
  return sid != null ? { streaming_album_id: String(sid), source } : null;
};

const corpsPiste = (t: Track, source: string): Record<string, unknown> | null => {
  if (source === 'local') return t.id != null ? { track_id: t.id } : null;
  if (!t.source_id) return null;
  return {
    source, source_id: String(t.source_id), title: t.title ?? null, artist_name: t.artist_name ?? null,
    album_title: t.album_title ?? null, cover_path: t.cover_path ?? null, duration_ms: t.duration_ms,
  };
};

/** Les correspondances du genre demandé, bibliothèque locale d'abord, puis chaque service. */
export function correspondances(res: FederatedSearchResult | null | undefined, genre: GenreRecherche): Correspondance[] {
  const sorties: Correspondance[] = [];
  const blocs: [string, { albums?: Album[]; tracks?: Track[] } | undefined][] = [
    ['local', res?.local],
    ...Object.entries(res?.services ?? {}).map(([svc, b]) => [svc, b] as [string, { albums?: Album[]; tracks?: Track[] }]),
  ];
  for (const [source, bloc] of blocs) {
    const items: any[] = (genre === 'album' ? bloc?.albums : bloc?.tracks) ?? [];
    let n = 0;
    for (const it of items) {
      if (n >= MAX_PAR_SOURCE) break;
      const lecture = genre === 'album' ? corpsAlbum(it, source) : corpsPiste(it, source);
      if (!lecture || !it.title) continue;
      sorties.push({ genre, source, titre: String(it.title), artiste: String(it.artist_name ?? ''), lecture });
      n++;
    }
  }
  return sorties;
}

/** Lance la recherche globale et rend les correspondances. Rejette si la recherche échoue. */
export async function chercherDansMesSources(c: CibleRecherche): Promise<{ termes: string; resultats: Correspondance[] }> {
  const termes = termesRecherche(c);
  const res = await federatedSearch(termes, undefined, LIMITE_RECHERCHE);
  return { termes, resultats: correspondances(res, c.genre) };
}

/* ------------------------------------------------------------------------- *
 * #7224 (décision de Bertrand du 12/11, rc12) — un clic LANCE l'équivalent.
 *
 * Fil forum 2716 (Tades) : dans la bibliothèque d'un contact, écoute fermée
 * (#6086), un clic sur un album ou une piste doit jouer ce que J'AI de
 * semblable, sans liste à choisir. Avant le 10/10, le même clic jouait le
 * fichier du contact par le relais (T4, `ecouterChezContact`) ; la fermeture
 * par défaut de cette écoute (41bda6fb1) l'a rendu muet.
 *
 * Même recherche que le bouton (`GET /search`, titre + artiste), puis un
 * verdict, sans nouvelle route serveur. La bibliothèque d'abord, puis chaque
 * service dans l'ordre où le serveur les rend ; dans chacun :
 *   1. un identifiant commun — ISRC pour une piste, MBID de groupe de
 *      parutions pour un album (le catalogue d'un contact ne porte pas d'UPC) ;
 *   2. sinon titre ET artiste (et, pour une piste, une durée à
 *      `ECART_DUREE_MS` près quand les deux la connaissent).
 * Rien d'approché au-delà : mieux vaut « introuvable » et le bouton de
 * recherche qu'un autre disque lancé à la place.
 * ------------------------------------------------------------------------- */

/** Ce qu'il faut pour reconnaître l'équivalent d'un élément du contact. */
export interface CibleLecture extends CibleRecherche {
  /** Piste : l'ISRC porté par le catalogue du contact. */
  isrc?: string | null;
  /** Album : le MBID du groupe de parutions. */
  mbid?: string | null;
  /** Piste : sa durée chez le contact. */
  duree_ms?: number | null;
}

/** Deux encodages d'un même titre diffèrent de quelques secondes, pas davantage. */
export const ECART_DUREE_MS = 5000;

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normaliser(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Les mentions d'ÉDITION seulement : une réédition reste le même disque. Pas
 * « live », « remix », « edit », « acoustic » : ce sont d'autres
 * enregistrements, ils ne se confondent pas.
 */
const EDITION = /\b(remaster(ed)?|deluxe|edition|expanded|anniversary|bonus|explicit|mono|stereo|hi-?res)\b/i;

/** Le titre sans ses mentions d'édition en fin : « (Remastered 2011) », « [Deluxe] », « - 2011 Remaster ». */
function titreNu(s: string | null | undefined): string {
  let t = s ?? '';
  for (let avant = ''; avant !== t;) {
    avant = t;
    const m = t.match(/\s*(?:[([]([^()[\]]*)[)\]]|\s-\s([^-]*))\s*$/);
    if (m && EDITION.test(m[1] ?? m[2] ?? '')) t = t.slice(0, m.index);
  }
  return normaliser(t);
}

function memeTitre(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliser(a);
  if (!na) return false;
  if (na === normaliser(b)) return true;
  const ta = titreNu(a);
  return ta !== '' && ta === titreNu(b);
}

/** Les artistes d'un libellé : « A feat. B », « A & B », « A, B »… */
function artistesDe(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(/\s*(?:,|;|\/|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\band\b)\s*/i)
    .map(normaliser).filter(Boolean);
}

/**
 * Même artiste : libellés identiques une fois normalisés, ou TOUS les artistes
 * du contact présents chez le candidat (« Adele » ≈ « Adele feat. X », mais
 * « Simon & Garfunkel » ≠ « Simon »). Sans artiste chez le contact, seule une
 * piste dont la durée est connue des deux côtés peut encore se reconnaître.
 */
function memeArtiste(voulu: string | null | undefined, candidat: string | null | undefined): boolean {
  const v = normaliser(voulu);
  const c = normaliser(candidat);
  if (!v || !c) return false;
  if (v === c) return true;
  const chez = artistesDe(candidat);
  return artistesDe(voulu).every((a) => chez.includes(a));
}

const isrcNormalise = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/[-\s]/g, '').toUpperCase() : '';

const dureeCompatible = (voulue: number | null | undefined, candidat: unknown): boolean =>
  voulue == null || typeof candidat !== 'number' || candidat <= 0 || Math.abs(candidat - voulue) <= ECART_DUREE_MS;

function blocsDansLOrdre(res: FederatedSearchResult | null | undefined): [string, any[], any[]][] {
  const blocs: [string, { albums?: Album[]; tracks?: Track[] } | undefined][] = [
    ['local', res?.local],
    ...Object.entries(res?.services ?? {}) as [string, { albums?: Album[]; tracks?: Track[] }][],
  ];
  return blocs.map(([s, b]) => [s, (b?.albums ?? []) as any[], (b?.tracks ?? []) as any[]]);
}

/**
 * La correspondance à lancer, ou `null`. Pur. Source par source — la
 * bibliothèque, puis chaque service dans l'ordre du serveur —, d'abord un
 * identifiant commun, puis titre + artiste (+ durée pour une piste). Un
 * fichier à moi passe donc avant un service, même reconnu par le texte.
 */
export function meilleureCorrespondance(
  res: FederatedSearchResult | null | undefined,
  cible: CibleLecture,
): Correspondance | null {
  const isrc = isrcNormalise(cible.isrc);
  const mbid = (cible.mbid ?? '').toLowerCase();
  const parIdentifiant = (it: any): boolean => (cible.genre === 'track'
    ? isrc !== '' && isrcNormalise(it?.isrc) === isrc
    : mbid !== '' && typeof it?.musicbrainz_release_group_id === 'string'
      && it.musicbrainz_release_group_id.toLowerCase() === mbid);
  const sansArtiste = normaliser(cible.artiste) === '';
  const parLeTexte = (it: any): boolean => {
    if (!memeTitre(cible.titre, it?.title)) return false;
    if (cible.genre !== 'track') return memeArtiste(cible.artiste, it?.artist_name);
    if (sansArtiste) {
      // Le titre seul ne suffit pas : il faut une durée connue des deux côtés.
      return cible.duree_ms != null && typeof it?.duration_ms === 'number' && it.duration_ms > 0
        && Math.abs(it.duration_ms - cible.duree_ms) <= ECART_DUREE_MS;
    }
    return memeArtiste(cible.artiste, it?.artist_name) && dureeCompatible(cible.duree_ms, it?.duration_ms);
  };

  for (const [source, albums, pistes] of blocsDansLOrdre(res)) {
    const elements = cible.genre === 'album' ? albums : pistes;
    for (const critere of [parIdentifiant, parLeTexte]) {
      for (const it of elements) {
        if (!critere(it) || !it?.title) continue;
        const lecture = cible.genre === 'album' ? corpsAlbum(it, source) : corpsPiste(it, source);
        if (lecture) return { genre: cible.genre, source, titre: String(it.title), artiste: String(it.artist_name ?? ''), lecture };
      }
    }
  }
  return null;
}

/** La recherche du bouton, puis le verdict. Rejette si la recherche échoue. */
export async function trouverEquivalent(c: CibleLecture): Promise<{ termes: string; trouvee: Correspondance | null }> {
  const termes = termesRecherche(c);
  const res = await federatedSearch(termes, undefined, LIMITE_RECHERCHE);
  return { termes, trouvee: meilleureCorrespondance(res, c) };
}
