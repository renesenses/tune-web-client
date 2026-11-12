/** #6902 — contrat coordination/contrat-messagerie-circle-rc9.md. Rien en stockage navigateur. */
import { writable } from 'svelte/store';
import { BASE, fetchJSON } from './api';
import * as api from './api';
import { activeView, pendingSearchQuery } from './stores/navigation';
import { basculerLeSas } from './ecouterPlusTard';
import { playAndSync } from './stores/zones';
import { zoneRequise } from './zoneRequise';
import type { Source } from './types';
import type { CibleEtiquette } from './cibleEtiquette';
import { formeDuTheme, FORMAT_THEME, VERSION_THEME, type ThemePerso } from './monTheme';

export const MESSAGE_MAX = 4000;
export const RELECTURE_MESSAGES_MS = 60_000;
export type CarteMusique = { type: 'album' | 'track' | 'playlist'; title: string; artist_name?: string; album_title?: string; cover_url?: string; musicbrainz_id?: string; isrc?: string; qobuz_id?: string; tidal_id?: string; spotify_id?: string; deezer_id?: string; youtube_id?: string };
/** #2527 — un thème « Mon thème » envoyé à un contact : son nom et ses 20 couleurs, rien d'autre
 *  (contrat cloud : site-mozaiklabs, `CircleMessage::THEME_COLOR_KEYS`). */
export type CarteTheme = { type: 'theme'; title: string; colors: Record<string, string> };
export type CarteCercle = CarteMusique | CarteTheme;
/** `sender_name` : conversation de cercle (rc11) et fil de cercle général (rc12) — le nom de l'auteur tant qu'il est membre, `null` pour un ancien membre. */
export interface MessageCercle { id: number; sender_id: number; mine: boolean; body: string | null; card: CarteCercle | null; created_at: string; sender_name?: string | null }
/** rc11 — écrire à tout un cercle (site-mozaiklabs#454). `write` : `all` (défaut) ou `owner`. */
export type EcritureCercle = 'all' | 'owner';
export interface CercleDeConversation { id: number; name: string; owner_id: number; owner_name: string; mine: boolean; write: EcritureCercle }
export type ConversationCercle =
  | { id: number; kind: 'direct'; contact: { user_id: number; name: string }; unread_count: number; last_message?: MessageCercle | null }
  | { id: number; kind: 'circle'; contact: null; circle: CercleDeConversation; can_write: boolean; unread_count: number; last_message?: MessageCercle | null }
  /** rc12 — le fil d'un cercle général rejoint volontairement (site-mozaiklabs#422). Le pseudo n'y
   *  paraît qu'après acceptation, une fois par cercle, enregistrée côté cloud (`name_consent_required`). */
  | { id: number; kind: 'general'; contact: null; circle: { id: number; name: string }; name_consent_required: boolean; unread_count: number; last_message?: MessageCercle | null };
/** Le nom affiché d'une conversation : le contact, ou « # Nom du cercle ». */
export const nomConversation = (c: ConversationCercle) => c.kind === 'direct' ? c.contact.name : `# ${c.circle.name}`;
/** Peut-on écrire ici ? Toujours en privé et dans un cercle général ; selon le réglage du cercle sinon. */
export const ecritureOuverte = (c: ConversationCercle) => c.kind !== 'circle' || c.can_write;
/** rc12 — un cercle général du catalogue (période, genre, label, artiste). Aucun membre n'y est nommé. */
export type CategorieCercleGeneral = 'period' | 'genre' | 'label' | 'artist';
export interface CercleGeneral { id: number; name: string; category: CategorieCercleGeneral | null; member_count: number; joined: boolean }
export interface PageMessages { conversation: ConversationCercle; messages: MessageCercle[]; next_cursor: string | null }
export const messagerieSupport = writable<boolean | null>(null);
export const demandeConversation = writable<{ contact?: number; conversation?: number; cercle?: number; general?: number } | null>(null);
export const erreurOuvertureConversation = writable<{ contact: number; cle: string } | null>(null);
export function ecrireAuContact(contact: number): void {
  erreurOuvertureConversation.set(null);
  demandeConversation.set({ contact });
  document.getElementById('circle-messages')?.scrollIntoView?.({ block: 'start' });
}
/** rc11 — « Écrire au cercle » depuis la fiche du cercle. */
export function ecrireAuCercle(cercle: number): void {
  erreurOuvertureConversation.set(null);
  demandeConversation.set({ cercle });
  document.getElementById('circle-messages')?.scrollIntoView?.({ block: 'start' });
}
/** rc12 — « Écrire au cercle » depuis la rubrique « Cercles généraux ». */
export function ecrireAuCercleGeneral(general: number): void {
  erreurOuvertureConversation.set(null);
  demandeConversation.set({ general });
  document.getElementById('circle-messages')?.scrollIntoView?.({ block: 'start' });
}
/** rc12 — quitter un cercle général retire tout de suite son fil de la messagerie ouverte. */
export const ADHESION_GENERALE_CHANGEE = 'circle-general-membership-changed';
export const carteAPartager = writable<CarteCercle | null>(null);
const racine = () => `${BASE}/ext/circle`;
const idsService = ['qobuz_id', 'tidal_id', 'spotify_id', 'deezer_id', 'youtube_id'] as const;
const texte = (v: unknown) => typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
export const longueurMessage = (v: string) => Array.from(v).length;
export const messageEnvoyable = (body: string, card: CarteCercle | null) => longueurMessage(body.trim()) <= MESSAGE_MAX && (!!body.trim() || card !== null);

export function pochettePublique(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 2048) return undefined;
  try {
    const u = new URL(v);
    const domaines = ['coverartarchive.org', 'archive.org', 'static.qobuz.com', 'resources.tidal.com', 'i.scdn.co', 'dzcdn.net', 'i.ytimg.com', 'mozaiklabs.fr'];
    if ((v.split('/')[2] ?? '').includes(':') || u.protocol !== 'https:' || u.username || u.password || u.port || !domaines.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))) return undefined;
    return v;
  } catch { return undefined; }
}

/** Projection commune aux cartes reçues ET envoyées : aucune URL de fichier ni id local. */
export function carteMusique(b: any): CarteMusique | null {
  if (!b || !['album', 'track', 'playlist'].includes(b.type) || !texte(b.title)) return null;
  const c: CarteMusique = { type: b.type, title: Array.from(texte(b.title)).slice(0, 300).join('') };
  for (const k of ['artist_name', 'album_title'] as const) if (texte(b[k])) c[k] = Array.from(texte(b[k])).slice(0, 300).join('');
  for (const k of idsService) if ((typeof b[k] === 'string' || Number.isSafeInteger(b[k])) && /^[A-Za-z0-9._:-]{1,64}$/.test(String(b[k]))) c[k] = String(b[k]);
  const cover = pochettePublique(b.cover_url); if (cover) c.cover_url = cover;
  if (typeof b.musicbrainz_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.musicbrainz_id)) c.musicbrainz_id = b.musicbrainz_id.toLowerCase();
  const isrc = typeof b.isrc === 'string' ? b.isrc.replace(/[- ]/g, '').toUpperCase() : '';
  if (c.type === 'track' && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) c.isrc = isrc;
  return c;
}

/** #2527 — la carte d'un thème, jugée sur sa FORME comme un import (la lisibilité
 *  se juge à l'application). Une carte abîmée ne s'affiche pas. */
export function carteTheme(b: any): CarteTheme | null {
  if (!b || b.type !== 'theme') return null;
  const f = formeDuTheme({ format: FORMAT_THEME, version: VERSION_THEME, name: b.title, colors: b.colors });
  return f.ok ? { type: 'theme', title: f.theme.name, colors: f.theme.colors } : null;
}
export const estCarteTheme = (c: CarteCercle | null | undefined): c is CarteTheme => c?.type === 'theme';
/** Le thème d'une carte, au format d'export / import. */
export function themeDeCarte(c: CarteTheme): ThemePerso {
  return { format: FORMAT_THEME, version: VERSION_THEME, name: c.title, colors: { ...c.colors } };
}
/** Toute carte de la messagerie : musique ou thème. */
export function carteCercle(b: any): CarteCercle | null {
  return b?.type === 'theme' ? carteTheme(b) : carteMusique(b);
}

export function carteDepuisObjet(o: { type: string; nom?: string | null; artisteNom?: string | null; pochette?: string | null; service?: string | null; sourceId?: string | null }): CarteMusique | null {
  return carteMusique({ type: o.type === 'piste' ? 'track' : o.type, title: o.nom, artist_name: o.artisteNom, cover_url: o.pochette, ...(o.service && o.sourceId ? { [`${o.service}_id`]: o.sourceId } : {}) });
}
export function carteDepuisPiste(p: any): CarteMusique | null {
  return carteMusique({ ...p, type: 'track', title: p?.title, cover_url: p?.cover_url ?? p?.cover_path, ...(p?.source && p?.source_id ? { [`${p.source}_id`]: p.source_id } : {}) });
}
function message(b: any): MessageCercle | null {
  if (!Number.isSafeInteger(b?.id) || !Number.isSafeInteger(b?.sender_id)) return null;
  const m: MessageCercle = { id: b.id, sender_id: b.sender_id, mine: b.mine === true, body: typeof b.body === 'string' ? b.body : null, card: carteCercle(b.card), created_at: typeof b.created_at === 'string' ? b.created_at : '' };
  if ('sender_name' in b) m.sender_name = texte(b.sender_name) || null;
  return m;
}
function cercleDeConversation(b: any): CercleDeConversation | null {
  if (!Number.isSafeInteger(b?.id) || !texte(b?.name) || !Number.isSafeInteger(b?.owner_id)) return null;
  return { id: b.id, name: texte(b.name), owner_id: b.owner_id, owner_name: texte(b.owner_name), mine: b.mine === true, write: b.write === 'owner' ? 'owner' : 'all' };
}
function conversation(b: any): ConversationCercle | null {
  if (b?.kind === 'general') {
    if (!Number.isSafeInteger(b?.id) || !Number.isSafeInteger(b.circle?.id) || !texte(b.circle?.name) || typeof b.name_consent_required !== 'boolean') return null;
    return { id: b.id, kind: 'general', contact: null, circle: { id: b.circle.id, name: texte(b.circle.name) }, name_consent_required: b.name_consent_required, unread_count: Number.isSafeInteger(b.unread_count) ? Math.max(0, b.unread_count) : 0, last_message: message(b.last_message) };
  }
  if (b?.kind === 'circle') {
    const circle = cercleDeConversation(b.circle);
    if (!Number.isSafeInteger(b?.id) || !circle) return null;
    return { id: b.id, kind: 'circle', contact: null, circle, can_write: b.can_write === true, unread_count: Number.isSafeInteger(b.unread_count) ? Math.max(0, b.unread_count) : 0, last_message: message(b.last_message) };
  }
  if (!Number.isSafeInteger(b?.id) || b?.kind !== 'direct' || !Number.isSafeInteger(b.contact?.user_id) || !texte(b.contact?.name)) return null;
  return { id: b.id, kind: 'direct', contact: { user_id: b.contact.user_id, name: texte(b.contact.name) }, unread_count: Number.isSafeInteger(b.unread_count) ? Math.max(0, b.unread_count) : 0, last_message: message(b.last_message) };
}
export async function conversations(): Promise<ConversationCercle[]> {
  const b = await fetchJSON<any>(`${racine()}/conversations`, undefined, undefined, true);
  messagerieSupport.set(true);
  if (!Array.isArray(b?.conversations)) throw new Error('Invalid conversations');
  return b.conversations.map(conversation).filter((c: ConversationCercle | null): c is ConversationCercle => c !== null);
}
export async function ouvrirConversation(contact: number): Promise<ConversationCercle> {
  const b = conversation(await fetchJSON(`${racine()}/contacts/${contact}/conversation`, { method: 'POST' }, undefined, true));
  if (!b) throw new Error('Invalid conversation');
  return b;
}
/** rc11 — la conversation d'un cercle dont on est membre (404 sinon). */
export async function ouvrirConversationCercle(cercle: number): Promise<ConversationCercle> {
  const b = conversation(await fetchJSON(`${racine()}/circles/${cercle}/conversation`, { method: 'POST' }, undefined, true));
  if (!b || b.kind !== 'circle') throw new Error('Invalid conversation');
  return b;
}
/** rc12 — le catalogue des cercles généraux. 404 : site sans cercles généraux (la rubrique se masque). */
export async function cerclesGeneraux(): Promise<CercleGeneral[]> {
  const b = await fetchJSON<any>(`${racine()}/general-circles`, undefined, undefined, true);
  if (!Array.isArray(b?.circles)) throw new Error('Invalid general circles');
  return b.circles.filter((c: any) => Number.isSafeInteger(c?.id) && texte(c?.name)).map((c: any): CercleGeneral => ({
    id: c.id, name: texte(c.name),
    category: ['period', 'genre', 'label', 'artist'].includes(c.category) ? c.category : null,
    member_count: Number.isSafeInteger(c.member_count) ? Math.max(0, c.member_count) : 0,
    joined: c.joined === true,
  }));
}
export const rejoindreCercleGeneral = (id: number) => fetchJSON(`${racine()}/general-circles/${id}/membership`, { method: 'POST' }, undefined, true);
export const quitterCercleGeneral = (id: number) => fetchJSON(`${racine()}/general-circles/${id}/membership`, { method: 'DELETE' }, undefined, true);
/** rc12 — le fil d'un cercle général rejoint (404 sinon). */
export async function ouvrirFilGeneral(general: number): Promise<ConversationCercle> {
  const b = conversation(await fetchJSON(`${racine()}/general-circles/${general}/conversation`, { method: 'POST' }, undefined, true));
  if (!b || b.kind !== 'general') throw new Error('Invalid conversation');
  return b;
}
/** rc12 — l'acceptation d'afficher son pseudo dans CE cercle, enregistrée par le cloud avant le premier texte ou la première carte. */
export const consentirPseudo = (conversation: number) => fetchJSON(`${racine()}/conversations/${conversation}/name-consent`, { method: 'POST', body: JSON.stringify({ accepted: true }) }, undefined, true);
/** Le cloud refuse un envoi sans acceptation du pseudo (422 `circle.name_consent_required`). */
export const refusFautePseudo = (e: unknown) => (e as any)?.status === 422 && (e as any)?.code === 'circle.name_consent_required';
export async function lireMessages(id: number, cursor?: string): Promise<PageMessages> {
  const q = new URLSearchParams({ limit: '50' }); if (cursor) q.set('cursor', cursor);
  const b = await fetchJSON<any>(`${racine()}/conversations/${id}/messages?${q}`, undefined, undefined, true);
  const c = conversation(b?.conversation);
  if (!c || !Array.isArray(b?.messages)) throw new Error('Invalid messages');
  return { conversation: c, messages: b.messages.map(message).filter((m: MessageCercle | null): m is MessageCercle => m !== null), next_cursor: typeof b.next_cursor === 'string' ? b.next_cursor : null };
}
export async function envoyerMessage(id: number, body: string, card: CarteCercle | null = null): Promise<void> {
  const projection = card === null ? null : carteCercle(card);
  if (!messageEnvoyable(body, projection)) throw Object.assign(new Error('Invalid message'), { status: 422 });
  await fetchJSON(`${racine()}/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ ...(body.trim() ? { body: body.trim() } : {}), ...(projection ? { card: projection } : {}) }) }, undefined, true);
}
/** rc11 — écrire à tout le cercle : sa route à lui (le site y tient droits et seaux). */
export async function envoyerAuCercle(cercle: number, body: string, card: CarteCercle | null = null): Promise<void> {
  const projection = card === null ? null : carteCercle(card);
  if (!messageEnvoyable(body, projection)) throw Object.assign(new Error('Invalid message'), { status: 422 });
  await fetchJSON(`${racine()}/circles/${cercle}/conversation/messages`, { method: 'POST', body: JSON.stringify({ ...(body.trim() ? { body: body.trim() } : {}), ...(projection ? { card: projection } : {}) }) }, undefined, true);
}
/** rc11 — le propriétaire règle qui peut écrire. */
export const reglerEcritureCercle = (cercle: number, write: EcritureCercle) => fetchJSON(`${racine()}/circles/${cercle}/messaging`, { method: 'PUT', body: JSON.stringify({ write }) }, undefined, true);
export const marquerConversationLue = (id: number, up_to?: number) => fetchJSON(`${racine()}/conversations/${id}/read`, { method: 'POST', body: JSON.stringify(up_to === undefined ? {} : { up_to }) }, undefined, true);
export const effacerMessage = (id: number, message: number) => fetchJSON(`${racine()}/conversations/${id}/messages/${message}`, { method: 'DELETE' }, undefined, true);
export function signalerMessages(id: number, message_ids: number[], reason: string, comment: string): Promise<unknown> {
  return fetchJSON(`${racine()}/conversations/${id}/reports`, { method: 'POST', body: JSON.stringify({ message_ids: [...new Set(message_ids)].slice(0, 20), reason, ...(comment.trim() ? { comment: comment.trim() } : {}) }) }, undefined, true);
}
export function chercherCarte(c: CarteMusique): void {
  pendingSearchQuery.set([c.title, c.artist_name].filter(Boolean).join(' ')); activeView.set('search');
}
/** Les identifiants du service d'abord ; à défaut, recherche chez le destinataire. */
export async function ecouterCarte(c: CarteMusique): Promise<void> {
  for (const champ of idsService) {
    if (!c[champ]) continue;
    const zone = zoneRequise(); if (zone === null) return;
    const source = champ.replace('_id', '') as Source;
    try {
      await playAndSync(zone, c.type === 'album' ? { source, streaming_album_id: c[champ] }
        : c.type === 'playlist' ? { source, streaming_playlist_id: c[champ] }
        : { source, source_id: c[champ], title: c.title, artist_name: c.artist_name });
      return;
    } catch { /* Un service indisponible laisse une recherche locale possible. */ }
  }
  chercherCarte(c);
}
export async function garderCarte(c: CarteMusique): Promise<void> {
  let cible: CibleEtiquette | null = null;
  for (const champ of idsService) {
    if (c[champ]) { cible = { itemType: c.type, source: champ.replace('_id', ''), sourceId: c[champ]!, titre: c.title, artiste: c.artist_name, pochette: c.cover_url }; break; }
  }
  if (!cible) {
    const normal = (s: string) => s.trim().toLocaleLowerCase();
    const b = c.type === 'playlist' ? await api.getPlaylists(500) : await api.searchLibrary(c.title, 100);
    const items = Array.isArray(b) ? b : c.type === 'album' ? b.albums : b.tracks;
    const trouve = items.find((o: any) => normal(o.title ?? o.name ?? '') === normal(c.title) && (!c.artist_name || normal(o.artist_name ?? '') === normal(c.artist_name)));
    if (trouve && typeof trouve.id === 'number') cible = { itemType: c.type, itemId: trouve.id };
  }
  if (!cible) throw Object.assign(new Error('Not found'), { code: 'circle.card_not_found' });
  await basculerLeSas(cible);
}
