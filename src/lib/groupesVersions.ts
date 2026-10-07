/**
 * Les versions d'une piste REGROUPÉES par enregistrement — tune-server-rust#2264.
 *
 * Le serveur (`GET /library/tracks/{id}/versions/groups`) dit lesquels des
 * exemplaires trouvés sont le MÊME enregistrement — par ISRC, par identifiant
 * MusicBrainz, ou par titre + artiste + durée à ±2 s — et lequel jouer par
 * défaut selon la règle réglée (bibliothèque d'abord, meilleure qualité, ou
 * un service donné). L'écran n'a qu'à dessiner : aucune règle n'est refaite
 * ici.
 *
 * Module à part, et non dans `api.ts` : la route est neuve, et un serveur
 * antérieur répond 404. L'appelant retombe alors sur la liste plate de
 * `getTrackVersions`, sans bandeau d'erreur.
 */
import { BASE, fetchJSON } from './api';
import { libelleQualite } from './meilleureQualite';
import { corpsVersionLocale, corpsVersionService } from './versionsPiste';

/** Ce qui a fait entrer un membre dans son groupe ; `null` pour le premier. */
export type LienVersion = 'isrc' | 'mbid' | 'title_artist_duration' | null;

export interface MembreGroupe {
  /** `local`, ou le nom du service (`qobuz`, `tidal`…). */
  source: string;
  track_id: number | null;
  source_id: string | null;
  title: string;
  artist_name: string;
  album_title: string;
  album_id: number | string | null;
  cover_path: string | null;
  /** `reference`, `version` ou `reprise`. */
  kind: string | null;
  duration_ms: number | null;
  isrc: string | null;
  musicbrainz_recording_id: string | null;
  quality: { format: string | null; sample_rate: number | null; bit_depth: number | null } | null;
  /** `false` : le service dit que la piste ne se joue pas aujourd'hui. */
  available: boolean | null;
  link: LienVersion;
  is_reference: boolean;
  is_default: boolean;
}

export interface GroupeVersions {
  /** Le lien le plus faible du groupe ; `null` pour un groupe d'un membre. */
  identity: LienVersion;
  isrc: string | null;
  musicbrainz_recording_id: string | null;
  contains_reference: boolean;
  /** Indice, dans `members`, de la version jouée par défaut. */
  default: number | null;
  members: MembreGroupe[];
}

export interface GroupesVersions {
  track_id: number;
  title: string;
  artist_name: string;
  /** `local`, `quality` ou `service:<nom>`. */
  rule: string;
  /** `profile` : la règle du profil de la requête ; `setting` : le défaut global. */
  rule_origin: 'query' | 'profile' | 'setting' | 'default';
  groups: GroupeVersions[];
}

/**
 * Rejette quand la réponse n'a pas la forme attendue : un intermédiaire qui
 * rendrait autre chose (page d'erreur en 200, ancienne route) doit mener à la
 * liste plate, pas à un « aucune autre version » trompeur.
 */
export async function getTrackVersionGroups(id: number, rule?: string): Promise<GroupesVersions> {
  const q = rule ? `?rule=${encodeURIComponent(rule)}` : '';
  const r = await fetchJSON<GroupesVersions>(
    `${BASE}/library/tracks/${id}/versions/groups${q}`,
    undefined,
    undefined,
    true,
  );
  if (!r || !Array.isArray(r.groups)) throw new Error('versions/groups : réponse inattendue');
  return r;
}

/** « FLAC 96 kHz / 24 bit », ou `null` quand rien n'est connu. */
export function qualiteMembre(m: Pick<MembreGroupe, 'quality'>): string | null {
  const q = m.quality;
  if (!q || (!q.format && !q.sample_rate && !q.bit_depth)) return null;
  return libelleQualite(q) || null;
}

/**
 * Un lancement depuis « Autres versions » est un CHOIX EXPLICITE de version :
 * le serveur ne lui applique pas la règle du profil (décision du 07/10/2026).
 * Sans ce drapeau, cliquer sur la version FLAC d'un MP3 sous la règle
 * « Qobuz d'abord » aurait joué Qobuz.
 */
export function choixExplicite(corps: Record<string, unknown> | null): Record<string, unknown> | null {
  return corps ? { ...corps, explicit_version: true } : null;
}

/** Ce qu'on envoie à la lecture : la piste de bibliothèque, ou la piste du service. */
export function corpsMembre(m: MembreGroupe): Record<string, unknown> | null {
  if (m.track_id != null) return choixExplicite(corpsVersionLocale({ track_id: m.track_id }));
  return choixExplicite(corpsVersionService({
    service: m.source,
    source_id: m.source_id,
    album_id: m.album_id == null ? null : String(m.album_id),
    title: m.title,
    artist_name: m.artist_name,
    album_title: m.album_title,
    cover_path: m.cover_path,
  }));
}

/** La clé i18n du libellé d'un lien. */
export function cleLien(l: LienVersion): string | null {
  switch (l) {
    case 'isrc': return 'library.versionGroups.byIsrc';
    case 'mbid': return 'library.versionGroups.byMbid';
    case 'title_artist_duration': return 'library.versionGroups.byTitle';
    default: return null;
  }
}

/**
 * Un groupe vaut d'être montré s'il porte la piste de départ, ou plus d'un
 * exemplaire, ou un exemplaire autre que la piste de départ : la liste
 * « Autres versions » ne doit pas se réduire à la piste qu'on regarde.
 */
export function groupeVide(g: GroupeVersions): boolean {
  return g.members.length === 1 && g.members[0].is_reference;
}

// ─── La règle, par profil (tune-server-rust#2264, décision 3 du 07/10) ───

/** Les règles qu'on propose. Les services sont ceux qu'interroge « Autres versions ». */
export const REGLES_VERSION = ['local', 'quality', 'service:qobuz', 'service:tidal', 'service:deezer', 'service:spotify'] as const;

export interface RegleVersion {
  /** `local`, `quality` ou `service:<nom>`. */
  rule: string;
  /** `profile` : réglée sur ce profil ; `setting` : le défaut global ; `default` : rien n'est réglé. */
  origin: 'profile' | 'setting' | 'default';
  scope: 'profile' | 'global';
  profile_id: number | null;
}

/**
 * La règle qui s'applique au profil ACTIF : la requête porte son
 * `X-Profile-Id` (`fetchJSON`), et le serveur répond pour lui. `'global'` :
 * le défaut du serveur, que suit un profil sans règle à lui.
 */
export function getVersionRule(portee?: 'global'): Promise<RegleVersion> {
  const q = portee === 'global' ? '?scope=global' : '';
  return fetchJSON<RegleVersion>(`${BASE}/library/versions/rule${q}`);
}

/** Règle celle du profil actif ; `null` le rend au défaut du serveur. */
export function setVersionRule(rule: string | null): Promise<RegleVersion> {
  return fetchJSON<RegleVersion>(`${BASE}/library/versions/rule`, {
    method: 'PUT',
    body: JSON.stringify({ rule }),
  });
}

/** La réponse a-t-elle la forme de la route ? (Un serveur antérieur rend autre chose.) */
export function regleLisible(r: unknown): r is RegleVersion {
  return !!r && typeof (r as RegleVersion).rule === 'string' && typeof (r as RegleVersion).origin === 'string';
}

/** Le libellé d'une règle. `t` : la fonction de traduction courante. */
export function libelleRegle(rule: string, t: (k: string) => string): string {
  if (typeof rule !== 'string') return '';
  if (rule === 'local') return t('profiles.versionRule.local');
  if (rule === 'quality') return t('profiles.versionRule.quality');
  const service = rule.startsWith('service:') ? rule.slice('service:'.length) : rule;
  return t('profiles.versionRule.service').replace('{service}', nomDeService(service));
}

/** `qobuz` → `Qobuz`. */
export function nomDeService(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
