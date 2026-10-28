/** #6902 — contrat coordination/contrat-messagerie-circle-rc9.md. Rien en stockage navigateur. */
import { writable } from 'svelte/store';
import { BASE, fetchJSON } from './api';
import * as api from './api';
import { activeView, pendingSearchQuery } from './stores/navigation';
import { basculerLeSas } from './ecouterPlusTard';
import type { CibleEtiquette } from './cibleEtiquette';

export const MESSAGE_MAX = 4000;
export const RELECTURE_MESSAGES_MS = 60_000;
export type CarteMusique = { type: 'album' | 'track' | 'playlist'; title: string; artist_name?: string; album_title?: string; cover_url?: string; musicbrainz_id?: string; isrc?: string; qobuz_id?: string; tidal_id?: string; spotify_id?: string; deezer_id?: string; youtube_id?: string };
export interface MessageCercle { id: number; sender_id: number; mine: boolean; body: string | null; card: CarteMusique | null; created_at: string }
export interface ConversationCercle { id: number; kind: 'direct'; contact: { user_id: number; name: string }; unread_count: number; last_message?: MessageCercle | null }
export interface PageMessages { conversation: ConversationCercle; messages: MessageCercle[]; next_cursor: string | null }
export const messagerieSupport = writable<boolean | null>(null);
export const demandeConversation = writable<{ contact?: number; conversation?: number } | null>(null);
export const carteAPartager = writable<CarteMusique | null>(null);
const racine = () => `${BASE}/ext/circle`;
const idsService = ['qobuz_id', 'tidal_id', 'spotify_id', 'deezer_id', 'youtube_id'] as const;
const texte = (v: unknown) => typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
export const longueurMessage = (v: string) => Array.from(v).length;
export const messageEnvoyable = (body: string, card: CarteMusique | null) => longueurMessage(body.trim()) <= MESSAGE_MAX && (!!body.trim() || card !== null);

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
  for (const k of idsService) if (/^[A-Za-z0-9._:-]{1,64}$/.test(String(b[k] ?? ''))) c[k] = String(b[k]);
  const cover = pochettePublique(b.cover_url); if (cover) c.cover_url = cover;
  if (typeof b.musicbrainz_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.musicbrainz_id)) c.musicbrainz_id = b.musicbrainz_id.toLowerCase();
  const isrc = typeof b.isrc === 'string' ? b.isrc.replace(/[- ]/g, '').toUpperCase() : '';
  if (c.type === 'track' && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) c.isrc = isrc;
  return c;
}

export function carteDepuisObjet(o: { type: string; nom?: string | null; artisteNom?: string | null; pochette?: string | null; service?: string | null; sourceId?: string | null }): CarteMusique | null {
  return carteMusique({ type: o.type === 'piste' ? 'track' : o.type, title: o.nom, artist_name: o.artisteNom, cover_url: o.pochette, ...(o.service && o.sourceId ? { [`${o.service}_id`]: o.sourceId } : {}) });
}
export function carteDepuisPiste(p: any): CarteMusique | null {
  return carteMusique({ ...p, type: 'track', title: p?.title, cover_url: p?.cover_url ?? p?.cover_path, ...(p?.source && p?.source_id ? { [`${p.source}_id`]: p.source_id } : {}) });
}
function message(b: any): MessageCercle | null {
  if (!Number.isSafeInteger(b?.id) || !Number.isSafeInteger(b?.sender_id)) return null;
  return { id: b.id, sender_id: b.sender_id, mine: b.mine === true, body: typeof b.body === 'string' ? b.body : null, card: carteMusique(b.card), created_at: typeof b.created_at === 'string' ? b.created_at : '' };
}
function conversation(b: any): ConversationCercle | null {
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
export async function lireMessages(id: number, cursor?: string): Promise<PageMessages> {
  const q = new URLSearchParams({ limit: '50' }); if (cursor) q.set('cursor', cursor);
  const b = await fetchJSON<any>(`${racine()}/conversations/${id}/messages?${q}`, undefined, undefined, true);
  const c = conversation(b?.conversation);
  if (!c || !Array.isArray(b?.messages)) throw new Error('Invalid messages');
  return { conversation: c, messages: b.messages.map(message).filter((m: MessageCercle | null): m is MessageCercle => m !== null), next_cursor: typeof b.next_cursor === 'string' ? b.next_cursor : null };
}
export async function envoyerMessage(id: number, body: string, card: CarteMusique | null = null): Promise<void> {
  const projection = card === null ? null : carteMusique(card);
  if (!messageEnvoyable(body, projection)) throw Object.assign(new Error('Invalid message'), { status: 422 });
  await fetchJSON(`${racine()}/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ ...(body.trim() ? { body: body.trim() } : {}), ...(projection ? { card: projection } : {}) }) }, undefined, true);
}
export const marquerConversationLue = (id: number, up_to?: number) => fetchJSON(`${racine()}/conversations/${id}/read`, { method: 'POST', body: JSON.stringify(up_to === undefined ? {} : { up_to }) }, undefined, true);
export const effacerMessage = (id: number, message: number) => fetchJSON(`${racine()}/conversations/${id}/messages/${message}`, { method: 'DELETE' }, undefined, true);
export function signalerMessages(id: number, message_ids: number[], reason: string, comment: string): Promise<unknown> {
  return fetchJSON(`${racine()}/conversations/${id}/reports`, { method: 'POST', body: JSON.stringify({ message_ids: [...new Set(message_ids)].slice(0, 20), reason, ...(comment.trim() ? { comment: comment.trim() } : {}) }) }, undefined, true);
}
export function chercherCarte(c: CarteMusique): void {
  pendingSearchQuery.set([c.title, c.artist_name].filter(Boolean).join(' ')); activeView.set('search');
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
