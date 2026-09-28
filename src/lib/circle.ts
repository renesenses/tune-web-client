/**
 * Tune Circle, étape T1 — le greffon natif `circle` du serveur
 * (renesenses/tune-server-rust#5018, greffon #5027, cloud site-mozaiklabs#223,
 * avenant « PLUSIEURS cercles par utilisateur » du 25/09/2026).
 *
 * Le greffon relaie vers mozaiklabs, qui porte SEUL la vérité : l'écran ne
 * garde aucun état local du cercle, il relit `GET /` après chaque geste.
 *
 * Contrat, monté sous `/api/v1/ext/circle` SEULEMENT quand le greffon est
 * installé ET chargé :
 *
 *   GET    /                            → { members, sent, received, circles }
 *                                          ou { connected: false } sans session mozaiklabs
 *   POST   /invitations {email, circle_id?} → 201 l'invitation (même réponse,
 *                                          que l'adresse ait un compte ou non)
 *   POST   /invitations/{id}/accept     → le contact { user_id, name, since }
 *   POST   /invitations/{id}/decline    → { ok: true }
 *   DELETE /invitations/{id}            → { ok: true }
 *   DELETE /members/{user_id}           → { ok: true }  RÉVOCATION : retiré de TOUS les cercles
 *   POST   /circles {name}              → 201 { id, name, member_ids: [] }
 *   PATCH  /circles/{id} {name}         → le cercle
 *   DELETE /circles/{id}                → { ok: true }  (les contacts restent)
 *   PUT    /circles/{id}/members/{uid}  → le cercle     (range un contact)
 *   DELETE /circles/{id}/members/{uid}  → { ok: true }  (de CE cercle seulement)
 *
 * Refus : 404 `{error:"not_found"}` ; 409 `already_member`, `already_invited`,
 * `invitation_received`, `circle_name_taken` ; 422 `self_invitation`,
 * `too_many_circles`, ou la validation Laravel `{errors:{email|name:[…]}}` ;
 * 429 avec `Retry-After` ; 412 `circle.not_connected` ; 503
 * `circle.cloud_unavailable`.
 *
 * Tous les appels passent `sansBandeau` : l'écran dit lui-même chaque refus,
 * dans sa langue — jamais le bandeau brut « Server error: … ».
 *
 * ── Étape T2 (renesenses/tune-server-rust#5325, décisions du 28/09/2026) ──
 * Le catalogue d'un contact, EN LECTURE, lu dans sa copie en ligne :
 *
 *   GET    /                            → chaque cercle gagne
 *                                          `sharing: { library, server_id }` (additif)
 *   PUT    /circles/{id}/sharing/library → partage la bibliothèque de CE serveur
 *                                          avec CE cercle (sans corps : le greffon
 *                                          ajoute lui-même son `server_id`)
 *   DELETE /circles/{id}/sharing/library → coupe, effet immédiat → { ok: true }
 *   GET    /library-sync                → { premium, active, last_sync, pending, server_id? },
 *                                          état LOCAL de la copie en ligne ; `server_id`
 *                                          = CE serveur (décision du 28/09, facultatif)
 *   GET    /shared-with-me              → [{ user_id, name, library }]
 *   GET    /contacts/{uid}/library/stats                 → { tracks, albums, artists, last_sync }
 *   GET    /contacts/{uid}/library/artists?search&sort&page
 *   GET    /contacts/{uid}/library/albums?search&sort&artist&page   (`artist` = IDENTIFIANT d'artiste)
 *   GET    /contacts/{uid}/library/albums/{album_id}/tracks
 *   GET    /contacts/{uid}/library/tracks?search&sort&page
 *
 * Un 404 sur `/contacts/…` veut dire « plus partagé » (révocation, retrait du
 * cercle, partage coupé) : il est identique pour un compte inexistant, et
 * l'écran n'en déduit rien d'autre.
 */
import { writable, derived } from 'svelte/store';
import * as api from './api';
import { BASE, fetchJSON, type ApiError } from './api';
import type { Track } from './types';

export interface ContactCercle {
  user_id: number;
  name: string;
  since: string;
}

export interface InvitationCercle {
  id: number;
  /** Dans `sent` : l'adresse saisie par moi. Dans `received` : le nom de l'auteur. */
  name_or_email: string;
  created_at: string;
  expires_at: string;
}

/** T2 — ce qu'un de MES cercles partage. Absent = rien (greffon T1, ou jamais activé). */
export interface PartageCercle {
  library: boolean;
  server_id?: string | null;
}

/** Un de MES cercles : un classement privé, que les contacts ne voient pas. */
export interface CercleNomme {
  id: number;
  name: string;
  member_ids: number[];
  sharing?: PartageCercle | null;
}

export interface EtatCercleConnecte {
  connected?: true;
  members: ContactCercle[];
  sent: InvitationCercle[];
  received: InvitationCercle[];
  circles?: CercleNomme[];
}

export type EtatCercle = { connected: false } | EtatCercleConnecte;

export function estConnecte(e: EtatCercle): e is EtatCercleConnecte {
  return (e as { connected?: boolean }).connected !== false;
}

const seg = (v: number) => encodeURIComponent(String(v));

function envoyer<T>(url: string, method: string, corps?: unknown): Promise<T> {
  const options: RequestInit = { method };
  if (corps !== undefined) options.body = JSON.stringify(corps);
  return fetchJSON<T>(url, options, undefined, true);
}

export function getCercle(): Promise<EtatCercle> {
  return fetchJSON<EtatCercle>(`${BASE}/ext/circle`, undefined, undefined, true);
}

/** `circleId` facultatif : à l'acceptation, l'invité est rangé dans ce cercle. */
export function inviterAuCercle(email: string, circleId?: number | null): Promise<InvitationCercle> {
  const corps: { email: string; circle_id?: number } = { email };
  if (circleId != null) corps.circle_id = circleId;
  return envoyer<InvitationCercle>(`${BASE}/ext/circle/invitations`, 'POST', corps);
}

export function accepterInvitation(id: number): Promise<ContactCercle> {
  return envoyer<ContactCercle>(`${BASE}/ext/circle/invitations/${seg(id)}/accept`, 'POST');
}

export function refuserInvitation(id: number): Promise<{ ok: boolean }> {
  return envoyer(`${BASE}/ext/circle/invitations/${seg(id)}/decline`, 'POST');
}

export function annulerInvitation(id: number): Promise<{ ok: boolean }> {
  return envoyer(`${BASE}/ext/circle/invitations/${seg(id)}`, 'DELETE');
}

/** RÉVOCATION : immédiate, le contact quitte tous mes cercles. */
export function revoquerContact(userId: number): Promise<{ ok: boolean }> {
  return envoyer(`${BASE}/ext/circle/members/${seg(userId)}`, 'DELETE');
}

export function creerCercle(name: string): Promise<CercleNomme> {
  return envoyer<CercleNomme>(`${BASE}/ext/circle/circles`, 'POST', { name });
}

export function renommerCercle(id: number, name: string): Promise<CercleNomme> {
  return envoyer<CercleNomme>(`${BASE}/ext/circle/circles/${seg(id)}`, 'PATCH', { name });
}

/** Supprime le classement ; les contacts restent des contacts. */
export function supprimerCercle(id: number): Promise<{ ok: boolean }> {
  return envoyer(`${BASE}/ext/circle/circles/${seg(id)}`, 'DELETE');
}

export function rangerDansCercle(id: number, userId: number): Promise<CercleNomme> {
  return envoyer<CercleNomme>(`${BASE}/ext/circle/circles/${seg(id)}/members/${seg(userId)}`, 'PUT');
}

/** Retire de CE cercle seulement : ce n'est PAS une révocation. */
export function retirerDuCercle(id: number, userId: number): Promise<{ ok: boolean }> {
  return envoyer(`${BASE}/ext/circle/circles/${seg(id)}/members/${seg(userId)}`, 'DELETE');
}

// ─── T2 : partager ma bibliothèque avec un cercle ───────────────────────────

/** 🔴 Désactivé par défaut : seul un `sharing.library === true` explicite compte. */
export function partageActif(c: CercleNomme): boolean {
  return c.sharing?.library === true;
}

/** Sans corps : le greffon ajoute SON `server_id`, jamais celui du client. */
export function partagerBibliotheque(id: number): Promise<unknown> {
  return envoyer(`${BASE}/ext/circle/circles/${seg(id)}/sharing/library`, 'PUT');
}

export function arreterPartageBibliotheque(id: number): Promise<{ ok: boolean }> {
  return envoyer(`${BASE}/ext/circle/circles/${seg(id)}/sharing/library`, 'DELETE');
}

/** L'état LOCAL de la copie en ligne : sans lui, on croirait partager un catalogue vide ou vieux. */
export interface EtatSynchroBibliotheque {
  premium?: boolean;
  active?: boolean;
  last_sync?: string | null;
  pending?: number;
  /** Le `server_id` de CE serveur (décision du 28/09/2026). Absent = inconnu. */
  server_id?: string | null;
}

/**
 * Où ce cercle partage-t-il ? Décision du 28/09/2026 : UN seul serveur
 * partagé par propriétaire, pour tous ses cercles.
 *
 * - `non`      : l'interrupteur est éteint ;
 * - `ici`      : il partage CE serveur (ou on ne sait pas lequel : sans
 *                `server_id` local, l'écran ne suppose pas un « ailleurs ») ;
 * - `ailleurs` : il partage un AUTRE serveur du compte ; l'activer ici
 *                DÉPLACE le partage.
 */
export type OuPartage = 'non' | 'ici' | 'ailleurs';

export function ouPartage(c: CercleNomme, serveurLocal: string | null | undefined): OuPartage {
  if (!partageActif(c)) return 'non';
  const sid = c.sharing?.server_id;
  if (serveurLocal && sid && sid !== serveurLocal) return 'ailleurs';
  return 'ici';
}

export function getSynchroBibliotheque(): Promise<EtatSynchroBibliotheque> {
  return fetchJSON<EtatSynchroBibliotheque>(`${BASE}/ext/circle/library-sync`, undefined, undefined, true);
}

/** Ce que l'écran dit de la copie en ligne, à côté d'un interrupteur allumé. */
export type AvisSynchro =
  | { cle: 'v2.circle.share.syncNone' }
  | { cle: 'v2.circle.share.syncInactive' }
  | { cle: 'v2.circle.share.syncPending'; n: number }
  | { cle: 'v2.circle.share.syncOk'; date: string };

export function avisSynchro(e: EtatSynchroBibliotheque | null): AvisSynchro | null {
  if (!e) return null;
  if (!e.last_sync) return { cle: 'v2.circle.share.syncNone' };
  if (e.active === false) return { cle: 'v2.circle.share.syncInactive' };
  if (typeof e.pending === 'number' && e.pending > 0) return { cle: 'v2.circle.share.syncPending', n: e.pending };
  return { cle: 'v2.circle.share.syncOk', date: e.last_sync };
}

// ─── T2 : ce que mes contacts partagent avec moi ────────────────────────────

/** Un contact qui partage sa bibliothèque avec moi. Jamais le nom ni le nombre de ses cercles. */
export interface PartageRecu {
  user_id: number;
  name: string;
}

export async function getPartagesAvecMoi(): Promise<PartageRecu[]> {
  const brut = await fetchJSON<unknown>(`${BASE}/ext/circle/shared-with-me`, undefined, undefined, true);
  const liste = Array.isArray(brut) ? brut : ((brut as { data?: unknown[] } | null)?.data ?? []);
  return liste
    .filter((x: any) => x && typeof x.user_id === 'number' && x.library !== false)
    .map((x: any) => ({ user_id: x.user_id, name: String(x.name ?? '') }));
}

/**
 * Les objets du catalogue d'un contact, reconstruits CHAMP PAR CHAMP.
 *
 * 🔴 Jamais `{ ...brut }` : si le cloud laissait un jour passer `cover_path`,
 * `source_id` ou un chemin quelconque, il ne toucherait pas l'écran. La liste
 * blanche est celle de la projection du contrat (#5325), rien de plus.
 */
export interface ArtisteContact { id: number; name: string }
export interface AlbumContact {
  id: number; title: string; artist_name: string | null; genre: string | null;
  track_count: number | null; year: number | null;
  /** Décision 4 du 28/09 : la pochette PUBLIQUE vient de Cover Art Archive par cet identifiant. */
  musicbrainz_release_group_id: string | null;
}
export interface PisteContact {
  id: number; title: string; artist_name: string | null; album_title: string | null;
  album_id: number | null; format: string | null; sample_rate: number | null;
  bit_depth: number | null; duration_ms: number | null; genre: string | null;
  track_number: number | null; disc_number: number | null;
  /** Décision 3 du 28/09 : servira à T5 (ajout à une playlist collaborative). */
  isrc: string | null;
}
export interface StatsContact { tracks: number; albums: number; artists: number; last_sync: string | null }

const texteOuNul = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const nombreOuNul = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function artisteContact(b: any): ArtisteContact {
  return { id: Number(b?.id), name: String(b?.name ?? '') };
}

export function albumContact(b: any): AlbumContact {
  return {
    id: Number(b?.id), title: String(b?.title ?? ''), artist_name: texteOuNul(b?.artist_name),
    genre: texteOuNul(b?.genre), track_count: nombreOuNul(b?.track_count), year: nombreOuNul(b?.year),
    musicbrainz_release_group_id: mbidValide(b?.musicbrainz_release_group_id),
  };
}

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un MBID bien formé, ou `null` : rien d'autre n'entre dans une adresse. */
function mbidValide(v: unknown): string | null {
  return typeof v === 'string' && MBID.test(v) ? v.toLowerCase() : null;
}

/**
 * La pochette PUBLIQUE d'un album de contact, ou `null` (icône générique).
 *
 * 🔴 Seul l'identifiant MusicBrainz sort — jamais un titre ni un artiste —,
 * et il sort par le relais de pochettes de NOTRE serveur (`artworkUrl` fait
 * passer toute adresse absolue par `/library/artwork/proxy`, qui admet
 * `coverartarchive.org` et `archive.org`, vers lequel il redirige). Rien
 * n'est demandé au serveur du contact. Une pochette introuvable (404) laisse
 * l'icône générique : `AlbumArt` s'en charge sur `onerror`.
 */
export function pochetteAlbumContact(a: Pick<AlbumContact, 'musicbrainz_release_group_id'>): string | null {
  const m = a.musicbrainz_release_group_id;
  return m ? `https://coverartarchive.org/release-group/${m}/front-250` : null;
}

export function pisteContact(b: any): PisteContact {
  return {
    id: Number(b?.id), title: String(b?.title ?? ''), artist_name: texteOuNul(b?.artist_name),
    album_title: texteOuNul(b?.album_title), album_id: nombreOuNul(b?.album_id),
    format: texteOuNul(b?.format), sample_rate: nombreOuNul(b?.sample_rate),
    bit_depth: nombreOuNul(b?.bit_depth), duration_ms: nombreOuNul(b?.duration_ms),
    genre: texteOuNul(b?.genre), track_number: nombreOuNul(b?.track_number),
    disc_number: nombreOuNul(b?.disc_number), isrc: texteOuNul(b?.isrc),
  };
}

/**
 * Une piste de contact à la forme `Track` de la Bibliothèque, pour la liste
 * commune (`ListePistesV2`, en `lectureSeule`).
 *
 * 🔴 `id`, `album_id` et `artist_id` restent NULS : ce sont des identifiants
 * du serveur de l'AMI. Passés tels quels, `AlbumArt` irait chercher la
 * pochette de l'album local de même numéro, et la ligne se croirait « en
 * lecture » dès que la piste locale de même numéro joue.
 */
export function pisteVersTrack(p: PisteContact): Track {
  return {
    id: null, title: p.title, artist_name: p.artist_name, album_title: p.album_title,
    album_id: null, format: (p.format ?? null) as any, sample_rate: p.sample_rate,
    bit_depth: p.bit_depth, duration_ms: p.duration_ms ?? undefined,
    genre: p.genre as any, track_number: p.track_number ?? undefined,
    disc_number: p.disc_number ?? undefined, cover_path: null,
  } as Track;
}

/** Une page du cloud : tableau nu, ou `{ data, current_page, last_page }` à la Laravel. */
export interface PageContact<T> { items: T[]; page: number; derniere: boolean; total: number | null }

function lirePage<T>(brut: any, page: number, taille: number, un: (b: any) => T): PageContact<T> {
  const liste: any[] = Array.isArray(brut) ? brut : (brut?.data ?? brut?.items ?? []);
  const items = liste.map(un);
  const cp = nombreOuNul(brut?.current_page) ?? page;
  const lp = nombreOuNul(brut?.last_page);
  const derniere = lp != null ? cp >= lp : items.length < taille;
  return { items, page: cp, derniere, total: nombreOuNul(brut?.total) };
}

/** Taille d'une page demandée au cloud. */
export const PAGE_CATALOGUE = 50;

/** `artist` : l'IDENTIFIANT d'artiste de la projection (ce que le cloud attend), jamais son nom. */
export interface RequeteCatalogue { page?: number; search?: string; sort?: string; artist?: number }

function requete(q: RequeteCatalogue): string {
  const p = new URLSearchParams();
  p.set('page', String(q.page ?? 1));
  p.set('per_page', String(PAGE_CATALOGUE));
  if (q.search?.trim()) p.set('search', q.search.trim());
  if (q.sort) p.set('sort', q.sort);
  if (q.artist != null) p.set('artist', String(q.artist));
  return p.toString();
}

const racineContact = (uid: number) => `${BASE}/ext/circle/contacts/${seg(uid)}/library`;
const lire = <T>(url: string) => fetchJSON<T>(url, undefined, undefined, true);

export async function statsContact(uid: number): Promise<StatsContact> {
  const b = await lire<any>(`${racineContact(uid)}/stats`);
  return {
    tracks: nombreOuNul(b?.tracks) ?? 0, albums: nombreOuNul(b?.albums) ?? 0,
    artists: nombreOuNul(b?.artists) ?? 0, last_sync: texteOuNul(b?.last_sync),
  };
}

export async function artistesContact(uid: number, q: RequeteCatalogue = {}): Promise<PageContact<ArtisteContact>> {
  return lirePage(await lire<any>(`${racineContact(uid)}/artists?${requete(q)}`), q.page ?? 1, PAGE_CATALOGUE, artisteContact);
}

export async function albumsContact(uid: number, q: RequeteCatalogue = {}): Promise<PageContact<AlbumContact>> {
  return lirePage(await lire<any>(`${racineContact(uid)}/albums?${requete(q)}`), q.page ?? 1, PAGE_CATALOGUE, albumContact);
}

export async function pistesContact(uid: number, q: RequeteCatalogue = {}): Promise<PageContact<PisteContact>> {
  return lirePage(await lire<any>(`${racineContact(uid)}/tracks?${requete(q)}`), q.page ?? 1, PAGE_CATALOGUE, pisteContact);
}

export async function pistesAlbumContact(uid: number, albumId: number): Promise<PisteContact[]> {
  const b = await lire<any>(`${racineContact(uid)}/albums/${seg(albumId)}/tracks`);
  const liste: any[] = Array.isArray(b) ? b : (b?.data ?? b?.items ?? []);
  return liste.map(pisteContact);
}

/** Un 404 pendant la navigation : le catalogue n'est plus partagé avec moi. */
export function plusPartage(e: unknown): boolean {
  return (e as ApiError | null)?.status === 404;
}

// ─── Le greffon est-il là ? ─────────────────────────────────────────────────

export interface EtatPluginCircle {
  name: string;
  installed?: boolean;
  /** Le greffon TOURNE : son routeur est monté sous `/api/v1/ext/circle`. */
  enabled?: boolean;
}

/** `null` tant que le serveur n'a pas répondu ; `'absent'` s'il ne connaît pas `circle`. */
export const circlePlugin = writable<EtatPluginCircle | null | 'absent'>(null);

/** Installé ET chargé : sinon chaque appel rendrait le 404 nu d'axum. */
export const circleCharge = derived(
  circlePlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.installed === true && $p.enabled === true,
);

export async function refreshCirclePlugin(): Promise<void> {
  try {
    const plugins = (await api.getInstalledPlugins()) as unknown as EtatPluginCircle[];
    circlePlugin.set(plugins.find((p) => p.name === 'circle') ?? 'absent');
  } catch {
    // Indéterminé : on garde `null`, l'écran ne s'ouvre pas sur une supposition.
  }
}

// ─── Connexion mozaiklabs ───────────────────────────────────────────────────

/**
 * Ouvre la connexion au compte mozaiklabs : le même chemin que le menu du
 * compte (`AvatarMenu.signIn`), drapeaux de retour compris.
 */
export function seConnecterAMozaiklabs(): void {
  try { localStorage.setItem('tune_sso_pending', Date.now().toString()); } catch { /* navigation privée */ }
  try { sessionStorage.setItem('tune_sso_pending', '1'); } catch { /* idem */ }
  window.location.href = `${BASE}/cloud/sso/authorize`;
}

// ─── Refus, en clés de traduction ───────────────────────────────────────────

/** Ce que l'écran dit d'un refus : une clé, et le délai d'un 429. */
export interface MotifCercle {
  cle: string;
  /** Minutes avant de réessayer (429), si le serveur les a nommées. */
  minutes?: number;
  /** Le service du cercle ne répond pas : l'écran propose « Réessayer ». */
  indisponible?: boolean;
  /** La session mozaiklabs n'est plus là : l'écran relit et le dira. */
  deconnecte?: boolean;
  /** T2 : ce serveur n'est pas relié au compte ; l'écran mène à Réglages ▸ Système ▸ Cloud. */
  nonRelie?: boolean;
}

/**
 * T2 — le refus de LIAISON du serveur, à l'activation d'un partage.
 * Le code exact est à confirmer avec le lot greffon : tout code qui dit
 * « not_linked » est lu comme tel, quel que soit le statut HTTP.
 */
export function estRefusDeLiaison(code: string): boolean {
  return /(^|[._])not_linked$/.test(code) || code === 'circle.server_unlinked';
}

/**
 * Traduit un refus du greffon en clé `v2.circle.*`. `champ` dit ce que le
 * geste envoyait, pour lire une validation 422 sans code nommé.
 *
 * 🔴 AUCUNE clé ne dit « cette adresse n'a pas de compte » : le cloud répond
 * pareil que l'adresse soit connue ou non, et l'écran ne doit rien en déduire.
 */
export function motifCercle(e: unknown, champ: 'email' | 'name' | null = null): MotifCercle {
  const err = e as ApiError | null;
  const status = err?.status;
  const code = typeof err?.code === 'string' ? err.code : '';
  if (estRefusDeLiaison(code)) return { cle: 'v2.circle.share.notLinked', nonRelie: true };
  if (status === 429) {
    const s = err?.retryAfter;
    return s ? { cle: 'v2.circle.err.tooManyWait', minutes: Math.max(1, Math.ceil(s / 60)) } : { cle: 'v2.circle.err.tooMany' };
  }
  if (status === 503 || code === 'circle.cloud_unavailable') return { cle: 'v2.circle.err.unavailable', indisponible: true };
  if (status === 412 || code === 'circle.not_connected' || status === 401) return { cle: 'v2.circle.err.notConnected', deconnecte: true };
  switch (code) {
    case 'already_member': return { cle: 'v2.circle.err.alreadyMember' };
    case 'already_invited': return { cle: 'v2.circle.err.alreadyInvited' };
    case 'invitation_received': return { cle: 'v2.circle.err.invitationReceived' };
    case 'self_invitation': return { cle: 'v2.circle.err.selfInvitation' };
    case 'circle_name_taken': return { cle: 'v2.circle.err.nameTaken' };
    case 'too_many_circles': return { cle: 'v2.circle.err.tooManyCircles' };
    case 'not_found':
    case 'circle.not_found': return { cle: 'v2.circle.err.notFound' };
  }
  if (status === 422) {
    const erreurs = (err?.corps as { errors?: Record<string, unknown> } | undefined)?.errors;
    if (erreurs && 'name' in erreurs) return { cle: 'v2.circle.err.nameInvalid' };
    if (erreurs && 'email' in erreurs) return { cle: 'v2.circle.err.emailInvalid' };
    if (champ === 'name') return { cle: 'v2.circle.err.nameInvalid' };
    if (champ === 'email') return { cle: 'v2.circle.err.emailInvalid' };
  }
  if (status === 404) return { cle: 'v2.circle.err.notFound' };
  return { cle: 'v2.circle.err.failed' };
}

/** Longueur maximale d'un nom de cercle (contrat : 1 à 60 caractères). */
export const NOM_CERCLE_MAX = 60;

/** Le nom tel qu'il partira, ou `null` s'il ne respecte pas 1 à 60 caractères. */
export function nomCercleValide(brut: string): string | null {
  const n = brut.trim();
  return n.length >= 1 && [...n].length <= NOM_CERCLE_MAX ? n : null;
}

/** Relecture modérée tant que l'écran est ouvert et l'onglet visible. */
export const RELECTURE_CERCLE_MS = 60_000;

// ─── T4 : écouter chez un contact (Premium) ─────────────────────────────────
//
// renesenses/tune-server-rust#5327 et les décisions de Bertrand du 28/09/2026 :
//
//   POST /contacts/{uid}/listen { track_id, zone_id } → { ok: true }
//        Le greffon demande au cloud un billet court pour CETTE piste, puis lance
//        la lecture du flux relayé sur la zone. L'écran ne voit jamais le billet
//        ni l'adresse du flux : il ne reçoit que `ok`.
//
// Refus : 404 (plus partagé, identique à « inexistant ») ; 402 relayé du cloud ;
// 409 `owner_unavailable` ; 503 `circle.owner_offline` (le pont ne joint pas le
// serveur du contact) ; 503 `circle.cloud_unavailable`, 412, 429 comme T1.
//
// Décisions : aucune présence permanente (le contact apprend que le serveur est
// éteint EN LANÇANT l'écoute) ; refus Premium ou indisponibilité = phrase NEUTRE,
// jamais « l'autre n'a pas Premium » ; qualité = fichier d'origine, rien à régler.

/**
 * L'écoute à distance est-elle offerte ici ? Le `premium` de `/library-sync`
 * (le greffon le lit du compte relié) fait foi ; sans lui (greffon plus ancien,
 * lecture en échec), l'état de licence du serveur. Tant que ni l'un ni l'autre
 * n'a répondu : NON — aucun bouton ne s'affiche sur une supposition.
 */
export function ecoutePermise(
  premiumSynchro: boolean | null | undefined,
  licence: { loaded: boolean; premium: boolean },
): boolean {
  if (typeof premiumSynchro === 'boolean') return premiumSynchro;
  return licence.loaded && licence.premium;
}

/**
 * Lance, sur ma zone, l'écoute d'une piste d'un contact — ou d'un album
 * entier : `track_ids` dans l'ordre, et le greffon demande un billet par
 * piste au moment de la jouer. Une piste seule part en `track_id`.
 *
 * 🔴 Le 402 est accepté ICI et relevé à la main : `fetchJSON` pose sinon son
 * bandeau global générique, EN PLUS de la phrase que l'écran dit lui-même.
 */
export async function ecouterChezContact(uid: number, pistes: number | number[], zoneId: number): Promise<void> {
  let statut = 0;
  const corps = Array.isArray(pistes) ? { track_ids: pistes, zone_id: zoneId } : { track_id: pistes, zone_id: zoneId };
  await fetchJSON<unknown>(
    `${BASE}/ext/circle/contacts/${seg(uid)}/listen`,
    { method: 'POST', body: JSON.stringify(corps) },
    (s) => { statut = s; return s === 402; },
    true,
  );
  if (statut === 402) {
    const err = new Error('premium_required') as ApiError;
    err.status = 402;
    err.code = 'premium_required';
    throw err;
  }
}

/** Ce que l'écran dit d'un refus d'écoute : toujours une clé `v2.circle.listen.*` ou une de T1. */
export type MotifEcoute =
  | { cle: 'v2.circle.listen.ownerOffline' }
  | { cle: 'v2.circle.listen.unavailable' }
  | { cle: 'v2.circle.listen.premiumRequired' }
  | { cle: 'v2.circle.listen.notShared' }
  | MotifCercle;

const codeDe = (e: unknown): string => {
  const err = e as ApiError | null;
  if (typeof err?.code === 'string') return err.code;
  const c = (err?.corps as { code?: unknown; error?: unknown } | undefined);
  return typeof c?.code === 'string' ? c.code : typeof c?.error === 'string' ? c.error : '';
};

/**
 * Traduit un refus de `POST /listen` (contrat cloud site-mozaiklabs#237,
 * consignes du 28/09/2026) :
 *
 * - 503 `owner_offline` (le pont, relayé) : le serveur du contact est éteint
 *   ou injoignable — le catalogue, lui, reste consultable ;
 * - 402 `premium_required` (`who: listener`) : c'est MON abonnement, je peux
 *   le savoir ;
 * - 409 `owner_unavailable` : phrase NEUTRE — rien sur le propriétaire ;
 * - 404 : ce titre n'est plus partagé avec moi ;
 * - le reste comme T1 (412, 429, 503 `circle.cloud_unavailable`).
 */
export function motifEcoute(e: unknown): MotifEcoute {
  const err = e as ApiError | null;
  const code = codeDe(e);
  if (/(^|[._])owner_offline$/.test(code)) return { cle: 'v2.circle.listen.ownerOffline' };
  if (/(^|[._])owner_unavailable$/.test(code) || err?.status === 409) return { cle: 'v2.circle.listen.unavailable' };
  if (err?.status === 402 || /(^|[._])premium_required$/.test(code)) return { cle: 'v2.circle.listen.premiumRequired' };
  if (plusPartage(e)) return { cle: 'v2.circle.listen.notShared' };
  return motifCercle(e);
}

/**
 * L'événement de fin d'écoute (`circle.stream_revoked`) : le pont a refusé
 * le billet en cours de lecture (révocation, partage coupé, fin du Premium).
 * Accepté sous son propre type, ou comme `code` d'un échec de lecture.
 */
export function estEcouteRevoquee(event: { type?: unknown; data?: any } | null | undefined): boolean {
  if (!event) return false;
  if (event.type === 'circle.stream_revoked') return true;
  const echec = event.type === 'zone.playback_error' || event.type === 'playback.error';
  return echec && (event.data?.code === 'circle.stream_revoked' || event.data?.reason === 'circle.stream_revoked');
}
