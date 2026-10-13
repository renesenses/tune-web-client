/**
 * Le panneau « Autres versions » — web#2017 (FabienM, fils 2176 et 2236).
 *
 *  - « Seul un clic sur la vignette permet de lire » : chaque version reçoit
 *    un menu « … » — Lire, Ajouter à la file, Aller à l'album, Aller à
 *    l'artiste —, y compris une version de SERVICE, dont le titre était inerte.
 *  - « label "Autre enregistrement" répété X fois » : l'en-tête d'un groupe
 *    dit ce qui le distingue (album, interprète, durée), au lieu du même mot.
 *    Le serveur ne rend pas l'année d'un exemplaire : elle n'est pas inventée.
 *
 * Une seule forme pour les trois sortes de tuile (membre d'un groupe, version
 * locale, version de service) : `CibleVersion`.
 */
import { formatTime } from './utils';
import { ICONES, type EntreeMenuPiste } from './menuPiste';
import type { GroupeVersions, MembreGroupe } from './groupesVersions';
import type { VersionService } from './versionsPiste';

export interface CibleVersion {
  source: string;
  track_id: number | null;
  source_id: string | null;
  title: string;
  artist_name: string | null;
  album_title: string | null;
  album_id: number | string | null;
  cover_path: string | null;
  duration_ms: number | null;
}

export function cibleDeMembre(m: MembreGroupe): CibleVersion {
  return {
    source: m.source, track_id: m.track_id, source_id: m.source_id, title: m.title,
    artist_name: m.artist_name, album_title: m.album_title, album_id: m.album_id,
    cover_path: m.cover_path, duration_ms: m.duration_ms,
  };
}

/** Une version de la bibliothèque du mode plat (`OtherVersion`). */
export function cibleDeLocale(v: {
  track_id: number | null; album_id: number | null; title?: string | null; artist_name?: string | null;
  album_title?: string | null; cover_path?: string | null; duration_ms?: number | null;
}): CibleVersion {
  return {
    source: 'local', track_id: v.track_id, source_id: null, title: v.title ?? '',
    artist_name: v.artist_name ?? null, album_title: v.album_title ?? null, album_id: v.album_id,
    cover_path: v.cover_path ?? null, duration_ms: v.duration_ms ?? null,
  };
}

export function cibleDeService(v: VersionService & { duration_ms?: number | null }): CibleVersion {
  return {
    source: v.service, track_id: null, source_id: v.source_id, title: v.title,
    artist_name: v.artist_name, album_title: v.album_title, album_id: v.album_id,
    cover_path: v.cover_path, duration_ms: v.duration_ms ?? null,
  };
}

export const estDeBibliothequeVersion = (c: CibleVersion) => c.track_id != null;

/** La piste, sous la forme que `corpsDeFileListe` lit. */
export function pisteDeVersion(c: CibleVersion) {
  return estDeBibliothequeVersion(c)
    ? { id: c.track_id, source: 'local', title: c.title, artist_name: c.artist_name, duration_ms: c.duration_ms ?? undefined }
    : {
        id: null, source: c.source, source_id: c.source_id, title: c.title, artist_name: c.artist_name,
        album_title: c.album_title, cover_path: c.cover_path, duration_ms: c.duration_ms ?? undefined,
        album_id: c.album_id,
      };
}

/** L'album se désigne-t-il ? Local : un identifiant numérique ; service : son identifiant d'album. */
export function albumDesignable(c: CibleVersion): boolean {
  if (estDeBibliothequeVersion(c)) return typeof c.album_id === 'number';
  return c.album_id != null && String(c.album_id).trim() !== '' && !!c.source;
}

export const artisteDesignable = (c: CibleVersion): boolean => !!(c.artist_name ?? '').trim();

export interface GestesVersion {
  lire?: () => void;
  aLaFile?: () => void;
  allerAlbum?: () => void;
  allerArtiste?: () => void;
}

/** Les entrées du menu « … » d'une version — les clés et icônes du menu de piste. */
export function entreesMenuVersion(c: CibleVersion, jouable: boolean, g: GestesVersion): EntreeMenuPiste[] {
  const e: EntreeMenuPiste[] = [];
  const pousser = (ok: boolean, cle: string, icone: string, faire?: () => void, plein = false) => {
    if (!ok || !faire) return;
    e.push(plein ? { cle, icone, plein: true, faire } : { cle, icone, faire });
  };
  pousser(jouable, 'common.play', ICONES.play, g.lire, true);
  pousser(jouable, 'queue.addToQueue', ICONES.queue, g.aLaFile);
  pousser(albumDesignable(c), 'library.goToAlbum', ICONES.album, g.allerAlbum);
  pousser(artisteDesignable(c), 'library.goToArtist', ICONES.artist, g.allerArtiste);
  return e;
}

/** Le membre qui représente le groupe : celui joué par défaut, à défaut le premier. */
export function representant(g: GroupeVersions): MembreGroupe | null {
  return g.members.find((m) => m.is_default) ?? g.members[0] ?? null;
}

/**
 * Ce qui distingue un enregistrement : album, interprète, durée — sans
 * répéter ce qui est vide. `''` quand le groupe n'a rien à dire.
 */
export function distinctionGroupe(g: GroupeVersions): string {
  const m = representant(g);
  if (!m) return '';
  const albums = [...new Set(g.members.map((x) => (x.album_title ?? '').trim()).filter(Boolean))];
  const album = (m.album_title ?? '').trim() || albums[0] || '';
  const autres = albums.filter((a) => a !== album).length;
  return [
    album ? (autres > 0 ? `${album} (+${autres})` : album) : '',
    (m.artist_name ?? '').trim(),
    m.duration_ms ? formatTime(m.duration_ms) : '',
  ].filter(Boolean).join(' · ');
}
