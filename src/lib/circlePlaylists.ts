/**
 * Tune Circle, étape T5 — les playlists COLLABORATIVES d'un cercle, par
 * références (renesenses/tune-server-rust#5328, décisions de Bertrand du
 * 28/09/2026).
 *
 * Une playlist de cercle ne contient que des RÉFÉRENCES — titre, artiste,
 * album, durée, ISRC, identifiants de service —, jamais un fichier, un chemin
 * ni un flux. Chacun la rejoue avec ce qu'il a : sa bibliothèque, son Qobuz,
 * son Tidal. Le cloud porte seul la vérité ; l'écran ne garde rien.
 *
 * Contrat du greffon, sous `/api/v1/ext/circle` (relais fidèle du cloud
 * `/api/v1/circle`, plus la résolution locale) :
 *
 *   GET    /playlists                       → [{ id, name, owner, count, version, updated_at, mine }]
 *   POST   /playlists {circle_id, name}     → 201 la playlist (propriétaire du cercle SEUL)
 *   GET    /playlists/{id}                  → { id, name, version, items: [{ item_id, …référence, added_by, added_at }] }
 *   PATCH  /playlists/{id} {name, version}  → la playlist (propriétaire seul)
 *   DELETE /playlists/{id}                  → { ok: true } (propriétaire seul)
 *   POST   /playlists/{id}/items {items|track_ids, position?, version} → la playlist (tout membre)
 *   DELETE /playlists/{id}/items/{item_id}?version= → la playlist (tout membre)
 *   PUT    /playlists/{id}/order {item_ids, version} → la playlist (permutation EXACTE)
 *   POST   /playlists/{id}/resolve          → [{ item_id, status: matched|not_found, source, source_id }]
 *   POST   /playlists/{id}/play {zone_id}   → ce qui est parti, et ce qui manque
 *   GET    /recoverable-playlists           → [{ id, name, owner, mine, count, archived_at, expires_at? }]
 *                                             les playlists ARCHIVÉES (cercle supprimé, ou
 *                                             playlist supprimée par son propriétaire) que
 *                                             j'ai le droit de récupérer, 30 jours durant
 *                                             (décisions du 28/09)
 *   POST   /recoverable-playlists/{id}/copy → copie en playlist LOCALE, puis le droit
 *                                             disparaît (greffon ; seule copie offerte : décision 5)
 *   DELETE /recoverable-playlists/{id}      → « je n'en veux pas » : le droit disparaît
 *
 * Refus : 404 pour tout ce qui n'est pas visible (révocation, retrait du
 * cercle, suppression — même corps qu'« inexistant ») ; 409
 * `{error:"version_conflict", playlist}` avec l'état courant ; 422
 * `too_many_playlists`, `playlist_too_large`, `invalid_position`,
 * `invalid_order` ou la validation Laravel ; 429 ; et les états T1 (412, 503).
 *
 * Contrat cloud figé : site-mozaiklabs#236, section « Contrat pour le greffon
 * et l'écran » (formes aux clés exactes, `added_by` = `{user_id, name}` entre
 * contacts ou `null`, `mine` par morceau, archivage à la suppression du cercle).
 *
 * 🔴 Tout ce qui vient du cloud est reconstruit CHAMP PAR CHAMP : si une
 * référence portait un jour `path`, `file_path`, `source_id` ou une adresse,
 * rien de cela n'atteindrait l'écran. Et tout ce qui part vers lui aussi :
 * une piste de service devient une référence en liste blanche, une piste
 * locale part par son seul `track_id`, que le greffon traduit sans chemin.
 */
import { BASE, fetchJSON, type ApiError } from './api';
import { estPisteLocale } from './pisteFile';
import type { Track } from './types';

/** Un identifiant du cloud : opaque, on ne le compare qu'à lui-même. */
export type IdOpaque = string | number;

/** Le propriétaire (du cercle) d'une playlist, tel que le cloud le nomme. */
export interface ProprietairePlaylist {
  user_id: number | null;
  name: string;
}

/** Une ligne de `GET /playlists`. */
export interface PlaylistCercleResume {
  id: IdOpaque;
  name: string;
  owner: ProprietairePlaylist | null;
  count: number;
  version: number;
  updated_at: string | null;
  /** Je suis le propriétaire du cercle : je renomme et je supprime. */
  mine: boolean;
  /** Mes playlists seulement : le cercle auquel elle appartient (jamais montré à un membre). */
  circle_id: number | null;
}

/** Les champs d'une référence, et EUX SEULS. */
export const CHAMPS_REFERENCE = [
  'title', 'artist_name', 'album_title', 'duration_ms', 'isrc', 'musicbrainz_recording_id',
  'qobuz_id', 'tidal_id', 'spotify_id', 'deezer_id', 'youtube_id',
] as const;

export interface ReferenceMorceau {
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  duration_ms?: number | null;
  isrc?: string | null;
  musicbrainz_recording_id?: string | null;
  qobuz_id?: string | null;
  tidal_id?: string | null;
  spotify_id?: string | null;
  deezer_id?: string | null;
  youtube_id?: string | null;
}

/**
 * Qui a ajouté un morceau, ce que l'écran a le DROIT d'en dire.
 *
 * Décision 1 du 28/09 : le nom seulement entre contacts. C'est le cloud qui
 * tranche — il rend un nom, ou rien. L'écran ne complète jamais : sans nom,
 * c'est « un membre du cercle », même s'il connaissait quelqu'un du même id.
 */
export type AuteurAjout = { nom: string } | null;

export interface MorceauCercle extends ReferenceMorceau {
  item_id: IdOpaque;
  added_by: AuteurAjout;
  /** C'est moi qui l'ai ajouté (toujours faux pour un ajout anonymisé). */
  mine: boolean;
  added_at: string | null;
}

export interface PlaylistCercle {
  id: IdOpaque;
  name: string;
  version: number;
  mine: boolean;
  items: MorceauCercle[];
}

// ─── Lecture défensive ───────────────────────────────────────────────────────

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
const idOpaque = (v: unknown): IdOpaque | null =>
  (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v !== '') ? v as IdOpaque : null;

/** Un identifiant de service : caractères sûrs, 64 au plus (contrat). */
const ID_SERVICE = /^[A-Za-z0-9._:-]{1,64}$/;
const idService = (v: unknown): string | null => {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : texte(v);
  return s && ID_SERVICE.test(s) ? s : null;
};

/** L'ISRC normalisé (12 caractères, sans tirets, en capitales), ou `null`. */
export function isrcNormalise(v: unknown): string | null {
  const s = texte(v);
  if (!s) return null;
  const n = s.replace(/[-\s]/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(n) ? n : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mbidRecording = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);

function liste(brut: unknown): unknown[] {
  if (Array.isArray(brut)) return brut;
  const b = brut as { data?: unknown; items?: unknown; playlists?: unknown } | null;
  if (Array.isArray(b?.data)) return b!.data as unknown[];
  if (Array.isArray(b?.playlists)) return b!.playlists as unknown[];
  return [];
}

export function playlistResume(b: any): PlaylistCercleResume | null {
  const id = idOpaque(b?.id);
  if (id == null) return null;
  const o = b?.owner;
  return {
    id,
    name: String(b?.name ?? ''),
    owner: o && typeof o === 'object' ? { user_id: entier(o.user_id), name: String(o.name ?? '') } : null,
    count: entier(b?.count) ?? entier(b?.items_count) ?? 0,
    version: entier(b?.version) ?? 0,
    updated_at: texte(b?.updated_at),
    mine: b?.mine === true,
    circle_id: entier(b?.circle_id),
  };
}

function auteur(b: any): AuteurAjout {
  const a = b?.added_by;
  const nom = typeof a === 'string' ? texte(a) : texte(a?.name);
  return nom ? { nom } : null;
}

/** Une référence reconstruite en liste blanche : aucun autre champ ne passe. */
export function reference(b: any): ReferenceMorceau {
  return {
    title: String(b?.title ?? ''),
    artist_name: texte(b?.artist_name),
    album_title: texte(b?.album_title),
    duration_ms: entier(b?.duration_ms),
    isrc: isrcNormalise(b?.isrc),
    musicbrainz_recording_id: mbidRecording(b?.musicbrainz_recording_id),
    qobuz_id: idService(b?.qobuz_id),
    tidal_id: idService(b?.tidal_id),
    spotify_id: idService(b?.spotify_id),
    deezer_id: idService(b?.deezer_id),
    youtube_id: idService(b?.youtube_id),
  };
}

export function morceauCercle(b: any): MorceauCercle | null {
  const item_id = idOpaque(b?.item_id ?? b?.id);
  if (item_id == null) return null;
  return { item_id, ...reference(b), added_by: auteur(b), mine: b?.mine === true, added_at: texte(b?.added_at) };
}

/** La playlist, ou `null` si le corps n'en est pas une (on relira alors). */
export function playlistCercle(b: any): PlaylistCercle | null {
  const p = b && typeof b === 'object' && !Array.isArray(b) && b.playlist && typeof b.playlist === 'object' ? b.playlist : b;
  const id = idOpaque(p?.id);
  if (id == null || !Array.isArray(p?.items)) return null;
  return {
    id,
    name: String(p?.name ?? ''),
    version: entier(p?.version) ?? 0,
    mine: p?.mine === true,
    items: (p.items as unknown[]).map(morceauCercle).filter((x): x is MorceauCercle => x != null),
  };
}

// ─── Les appels ──────────────────────────────────────────────────────────────

const racine = `${BASE}/ext/circle/playlists`;
const seg = (v: IdOpaque) => encodeURIComponent(String(v));

function envoyer<T>(url: string, method: string, corps?: unknown): Promise<T> {
  const options: RequestInit = { method };
  if (corps !== undefined) options.body = JSON.stringify(corps);
  return fetchJSON<T>(url, options, undefined, true);
}

export async function listerPlaylistsCercle(): Promise<PlaylistCercleResume[]> {
  const brut = await fetchJSON<unknown>(racine, undefined, undefined, true);
  return liste(brut).map(playlistResume).filter((x): x is PlaylistCercleResume => x != null);
}

/** Lit la playlist ; un corps illisible est une panne, pas une playlist vide. */
export async function lirePlaylistCercle(id: IdOpaque): Promise<PlaylistCercle> {
  const p = playlistCercle(await fetchJSON<unknown>(`${racine}/${seg(id)}`, undefined, undefined, true));
  if (!p) throw Object.assign(new Error('invalid playlist'), { status: 502 }) as ApiError;
  return p;
}

/** Le propriétaire du cercle seul : un membre reçoit un 404. */
export function creerPlaylistCercle(circleId: number, name: string): Promise<unknown> {
  return envoyer(racine, 'POST', { circle_id: circleId, name });
}

export function renommerPlaylistCercle(id: IdOpaque, name: string, version: number): Promise<unknown> {
  return envoyer(`${racine}/${seg(id)}`, 'PATCH', { name, version });
}

export function supprimerPlaylistCercle(id: IdOpaque): Promise<unknown> {
  return envoyer(`${racine}/${seg(id)}`, 'DELETE');
}

/**
 * Ce qu'on ajoute : des pistes de CE serveur par leur identifiant (le greffon
 * bâtit la référence, sans chemin), ou des références déjà construites.
 */
export interface Ajout {
  track_ids?: number[];
  items?: ReferenceMorceau[];
}

export function ajouterMorceaux(id: IdOpaque, ajout: Ajout, version: number, position?: number): Promise<unknown> {
  const corps: Record<string, unknown> = { version };
  if (ajout.track_ids?.length) corps.track_ids = ajout.track_ids;
  if (ajout.items?.length) corps.items = ajout.items;
  if (position != null) corps.position = position;
  return envoyer(`${racine}/${seg(id)}/items`, 'POST', corps);
}

export function retirerMorceau(id: IdOpaque, itemId: IdOpaque, version: number): Promise<unknown> {
  return envoyer(`${racine}/${seg(id)}/items/${seg(itemId)}?version=${encodeURIComponent(String(version))}`, 'DELETE');
}

export function reordonnerMorceaux(id: IdOpaque, itemIds: IdOpaque[], version: number): Promise<unknown> {
  return envoyer(`${racine}/${seg(id)}/order`, 'PUT', { item_ids: itemIds, version });
}

// ─── Après la suppression d'un cercle : récupérer une copie ──────────────────

/**
 * Une playlist d'un cercle SUPPRIMÉ, archivée par le cloud, que j'ai le droit
 * de récupérer (décision 3 du 28/09) : le propriétaire, et chaque contact
 * rangé et actif au moment de la suppression.
 */
export interface PlaylistRecuperable {
  id: IdOpaque;
  name: string;
  owner: ProprietairePlaylist | null;
  mine: boolean;
  count: number;
  archived_at: string | null;
  /** Fin du droit de récupérer (30 jours, décision du 28/09). Absent = l'écran ne dit pas de date. */
  expires_at: string | null;
}

export function playlistRecuperable(b: any): PlaylistRecuperable | null {
  const id = idOpaque(b?.id);
  if (id == null) return null;
  const o = b?.owner;
  return {
    id, name: String(b?.name ?? ''),
    owner: o && typeof o === 'object' ? { user_id: entier(o.user_id), name: String(o.name ?? '') } : null,
    mine: b?.mine === true, count: entier(b?.count) ?? 0, archived_at: texte(b?.archived_at),
    expires_at: dateValide(b?.expires_at),
  };
}

/** Une date ISO lisible, ou `null` : une échéance illisible ne s'affiche pas. */
function dateValide(v: unknown): string | null {
  const s = texte(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
}

const racineRecup = `${BASE}/ext/circle/recoverable-playlists`;

export async function listerRecuperables(): Promise<PlaylistRecuperable[]> {
  const brut = await fetchJSON<unknown>(racineRecup, undefined, undefined, true);
  return liste(brut).map(playlistRecuperable).filter((x): x is PlaylistRecuperable => x != null);
}

/**
 * La SEULE copie que l'écran offre (décision 5). Le greffon lit la playlist
 * archivée, crée la playlist locale, puis rend le droit au cloud.
 */
export function recupererCopie(id: IdOpaque): Promise<unknown> {
  return envoyer(`${racineRecup}/${seg(id)}/copy`, 'POST');
}

/** « Je n'en veux pas » : mon droit disparaît ; la playlist, avec le dernier droit. */
export function renoncerRecuperable(id: IdOpaque): Promise<unknown> {
  return envoyer(`${racineRecup}/${seg(id)}`, 'DELETE');
}

// ─── Résolution, chez MOI ────────────────────────────────────────────────────

/**
 * Où un morceau se rejoue chez l'utilisateur :
 * - `bibliotheque` : une piste de SA bibliothèque ;
 * - `service`      : via un de SES services (`service` le nomme) ;
 * - `introuvable`  : rien chez lui — l'écran le dit clairement.
 */
export type EtatResolution =
  | { etat: 'bibliotheque' }
  | { etat: 'service'; service: string }
  | { etat: 'introuvable' };

const SOURCES_LOCALES = new Set(['local', 'library', 'bibliotheque', 'upnp']);

export function etatResolution(b: any): EtatResolution | null {
  const st = texte(b?.status);
  if (st === 'not_found') return { etat: 'introuvable' };
  if (st !== 'matched') return null;
  const src = (texte(b?.source) ?? '').toLowerCase();
  if (!src || SOURCES_LOCALES.has(src)) return { etat: 'bibliotheque' };
  return /^[a-z0-9_-]{1,32}$/.test(src) ? { etat: 'service', service: src } : { etat: 'bibliotheque' };
}

/** Rien n'est gardé : la résolution est refaite à chaque ouverture. */
export async function resoudrePlaylistCercle(id: IdOpaque): Promise<Map<string, EtatResolution>> {
  const brut = await envoyer<unknown>(`${racine}/${seg(id)}/resolve`, 'POST');
  const m = new Map<string, EtatResolution>();
  const l = Array.isArray(brut) ? brut : liste(brut).length ? liste(brut) : (brut as any)?.items ?? [];
  for (const x of l as any[]) {
    const iid = idOpaque(x?.item_id);
    const e = etatResolution(x);
    if (iid != null && e) m.set(String(iid), e);
  }
  return m;
}

/** Ce que la lecture a mis en file, et ce qui manquait chez moi. */
export interface BilanLecture { lances: number | null; manquants: number }

export async function jouerPlaylistCercle(id: IdOpaque, zoneId: number): Promise<BilanLecture> {
  const b = await envoyer<any>(`${racine}/${seg(id)}/play`, 'POST', { zone_id: zoneId });
  const compte = (v: unknown) => (Array.isArray(v) ? v.length : entier(v));
  return {
    lances: compte(b?.queued) ?? compte(b?.matched) ?? compte(b?.played),
    manquants: compte(b?.missing) ?? compte(b?.not_found) ?? 0,
  };
}

// ─── Ajouter une piste depuis son menu ───────────────────────────────────────

const CHAMP_DU_SERVICE: Record<string, keyof ReferenceMorceau> = {
  qobuz: 'qobuz_id', tidal: 'tidal_id', spotify: 'spotify_id', deezer: 'deezer_id', youtube: 'youtube_id',
};

/**
 * La référence d'une piste de SERVICE, construite ici en liste blanche.
 *
 * 🔴 Rien d'autre que les champs du contrat : ni `source_id` brut, ni
 * `cover_path`, ni adresse. L'identifiant de service n'entre que sous le nom
 * de son service (`qobuz_id`…), et seulement s'il est fait de caractères sûrs.
 * `null` : une piste sans titre, ou d'un service que la référence ne sait pas
 * nommer (radio, Bandcamp…) — l'entrée du menu est alors absente.
 */
export function referenceDeService(t: Track): ReferenceMorceau | null {
  if (estPisteLocale(t)) return null;
  const titre = texte(t.title);
  const service = String(t.source ?? '').toLowerCase();
  const champ = CHAMP_DU_SERVICE[service];
  const sid = idService(t.source_id);
  if (!titre || !champ || !sid) return null;
  const r: ReferenceMorceau = { title: titre.slice(0, 300) };
  if (texte(t.artist_name)) r.artist_name = t.artist_name!;
  if (texte(t.album_title)) r.album_title = t.album_title!;
  const d = entier(t.duration_ms);
  if (d != null && d > 0) r.duration_ms = d;
  const isrc = isrcNormalise((t as { isrc?: unknown }).isrc);
  if (isrc) r.isrc = isrc;
  (r as unknown as Record<string, string>)[champ] = sid;
  return r;
}

/** Ce qu'une piste envoie pour rejoindre une playlist de cercle, ou `null` (entrée absente). */
export function ajoutDePiste(t: Track): Ajout | null {
  if (estPisteLocale(t) && typeof t.id === 'number') return { track_ids: [t.id] };
  const r = referenceDeService(t);
  return r ? { items: [r] } : null;
}

// ─── Concurrence et refus ────────────────────────────────────────────────────

export function estConflit(e: unknown): boolean {
  const err = e as ApiError | null;
  return err?.status === 409 || err?.code === 'version_conflict';
}

/** L'état courant joint au 409, s'il y est ; sinon `null` et l'écran relit. */
export function etatDuConflit(e: unknown): PlaylistCercle | null {
  const c = (e as ApiError | null)?.corps as any;
  if (!c || typeof c !== 'object') return null;
  return playlistCercle(c.playlist ?? c.current ?? c.data ?? c);
}

/** Un 404 : la playlist n'est plus partagée avec moi (ou n'existe plus — même réponse). */
export function plusPartagee(e: unknown): boolean {
  return (e as ApiError | null)?.status === 404;
}

/**
 * Un geste sous version : envoyé avec la version connue ; sur 409, l'état
 * reçu remplace l'état connu, et le geste est REFAIT une fois s'il a encore
 * un sens sur cet état (`rejouer` rend `null` sinon).
 *
 * `conflit` dit ce qui s'est passé, pour la phrase de l'écran :
 * - `aucun`   : passé du premier coup ;
 * - `refait`  : la playlist avait changé, le geste est passé sur la version à jour ;
 * - `change`  : la playlist a changé et le geste n'a plus de sens : rien n'est écrit.
 */
export interface IssueGeste { playlist: PlaylistCercle; conflit: 'aucun' | 'refait' | 'change' }

export async function gesteVersionne(
  etat: PlaylistCercle,
  envoyerGeste: (p: PlaylistCercle) => Promise<unknown>,
  rejouer: (p: PlaylistCercle) => ((p: PlaylistCercle) => Promise<unknown>) | null,
  relire: () => Promise<PlaylistCercle>,
): Promise<IssueGeste> {
  const lu = async (r: unknown) => playlistCercle(r) ?? (await relire());
  try {
    return { playlist: await lu(await envoyerGeste(etat)), conflit: 'aucun' };
  } catch (e) {
    if (!estConflit(e)) throw e;
    const courant = etatDuConflit(e) ?? (await relire());
    const refaire = rejouer(courant);
    if (!refaire) return { playlist: courant, conflit: 'change' };
    try {
      return { playlist: await lu(await refaire(courant)), conflit: 'refait' };
    } catch (e2) {
      if (!estConflit(e2)) throw e2;
      return { playlist: etatDuConflit(e2) ?? (await relire()), conflit: 'change' };
    }
  }
}

/** Déplace `itemId` au rang `vers` ; `null` s'il n'y est plus ou si rien ne bouge. */
export function ordreDeplace(items: { item_id: IdOpaque }[], itemId: IdOpaque, vers: number): IdOpaque[] | null {
  const ids = items.map((x) => x.item_id);
  const de = ids.findIndex((x) => String(x) === String(itemId));
  if (de < 0) return null;
  const cible = Math.max(0, Math.min(ids.length - 1, vers));
  if (cible === de) return null;
  const [m] = ids.splice(de, 1);
  ids.splice(cible, 0, m);
  return ids;
}

/** Le morceau est-il encore là ? (un retrait sur un état reçu en 409) */
export function contient(p: PlaylistCercle, itemId: IdOpaque): boolean {
  return p.items.some((x) => String(x.item_id) === String(itemId));
}

/** Refus propres à T5, en clés `v2.circle.pl.err.*` ; le reste suit `motifCercle`. */
export function codeT5(e: unknown): string | null {
  const err = e as ApiError | null;
  const code = typeof err?.code === 'string' ? err.code : '';
  switch (code) {
    case 'playlist_too_large': return 'v2.circle.pl.err.tooLarge';
    case 'too_many_playlists': return 'v2.circle.pl.err.tooMany';
    case 'invalid_order':
    case 'invalid_position': return 'v2.circle.pl.changed';
  }
  if (err?.status === 422) {
    const erreurs = (err?.corps as { errors?: Record<string, unknown> } | undefined)?.errors;
    if (erreurs && 'name' in erreurs) return 'v2.circle.pl.err.nameInvalid';
    if (erreurs && 'item_ids' in erreurs) return 'v2.circle.pl.changed';
    if (erreurs && Object.keys(erreurs).some((k) => k.startsWith('items'))) return 'v2.circle.pl.err.badItem';
  }
  return null;
}

/** Longueur maximale du nom d'une playlist de cercle. */
export const NOM_PLAYLIST_MAX = 100;

export function nomPlaylistValide(brut: string): string | null {
  const n = brut.trim();
  return n.length >= 1 && [...n].length <= NOM_PLAYLIST_MAX ? n : null;
}
