/**
 * Tune Circle rc9 — les notifications de Tune web (décision de Bertrand du
 * 26/10/2026, web#2437 ; contrat `coordination/contrat-tune-circle-rc8.md`,
 * « Notifications »). Relayées par le greffon `circle` (tune-server-rust#7130)
 * depuis le cloud (site-mozaiklabs#384) :
 *
 *   GET  /notifications                → { unread_count, notifications: [{ id, kind, read, at,
 *                                          actor: { user_id, name }, circle_name, playlist,
 *                                          conversation_id, invitation_id, count }] }
 *   POST /notifications/{id}/read      → { unread_count }
 *   POST /notifications/read-all       → { unread_count: 0 }
 *   GET  /notifications/preferences    → { playlist_shared, circle_invitation, message, contact }
 *   PUT  /notifications/preferences    → idem (corps partiel, booléens)
 *
 * Canal : Tune web SEULEMENT (ni push, ni mail). Rien n'est chiffré au-delà de
 * HTTPS. Lire une notification ne dit rien à son émetteur.
 *
 * Pas de temps réel : le cloud n'a aucun canal poussé vers les serveurs Tune.
 * On interroge toutes les {@link INTERVALLE_NOTIFS_MS} ms tant que l'onglet est
 * visible, et au retour sur l'onglet. Un serveur plus ancien (404) arrête le
 * suivi : aucune pastille, l'écran reste celui d'avant.
 */
import { writable, get } from 'svelte/store';
import { BASE, fetchJSON, type ApiError } from './api';

export const INTERVALLE_NOTIFS_MS = 60_000;

export type GenreNotif = 'playlist_shared' | 'circle_invitation' | 'message' | 'contact_request' | 'contact_accepted';
export const GENRES_NOTIF: readonly GenreNotif[] = ['playlist_shared', 'circle_invitation', 'message', 'contact_request', 'contact_accepted'];

export type TypeReglage = 'playlist_shared' | 'circle_invitation' | 'message' | 'contact';
export const TYPES_REGLAGE: readonly TypeReglage[] = ['playlist_shared', 'circle_invitation', 'message', 'contact'];
export type Reglages = Record<TypeReglage, boolean>;

export interface NotifCercle {
  id: number;
  kind: GenreNotif;
  read: boolean;
  at: string;
  actor: { user_id: number; name: string };
  circle_name: string | null;
  playlist: { id: number; name: string } | null;
  conversation_id: number | null;
  invitation_id: number | null;
  count: number;
}

/** `inconnu` : pas encore lu ; `absent` : serveur sans ces routes ; `deconnecte` : 412. */
export type EtatRelaisNotifs = 'inconnu' | 'ok' | 'absent' | 'deconnecte' | 'indisponible';

export interface EtatNotifs {
  relais: EtatRelaisNotifs;
  nonLues: number;
  liste: NotifCercle[];
}

export const notifsCercle = writable<EtatNotifs>({ relais: 'inconnu', nonLues: 0, liste: [] });

const URL_NOTIFS = () => `${BASE}/ext/circle/notifications`;
const statut = (e: unknown) => (e as ApiError | null)?.status;
const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const chaine = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Une notification reconstruite champ par champ, ou `null` si elle n'est pas lisible. */
export function notifValide(b: any): NotifCercle | null {
  if (!b || typeof b !== 'object') return null;
  const id = entier(b.id);
  const kind = GENRES_NOTIF.includes(b.kind) ? (b.kind as GenreNotif) : null;
  const acteur = entier(b.actor?.user_id);
  const nom = chaine(b.actor?.name);
  if (id === null || kind === null || acteur === null || nom === null) return null;
  const pl = b.playlist && entier(b.playlist.id) !== null && chaine(b.playlist.name) ? { id: b.playlist.id as number, name: b.playlist.name as string } : null;
  return {
    id,
    kind,
    read: b.read === true,
    at: typeof b.at === 'string' ? b.at : '',
    actor: { user_id: acteur, name: nom },
    circle_name: chaine(b.circle_name),
    playlist: pl,
    conversation_id: entier(b.conversation_id),
    invitation_id: entier(b.invitation_id),
    count: Math.min(99, Math.max(1, entier(b.count) ?? 1)),
  };
}

function relaisDe(e: unknown): EtatRelaisNotifs {
  const s = statut(e);
  if (s === 404) return 'absent';
  if (s === 412) return 'deconnecte';
  return 'indisponible';
}

/** Relit la liste ; en cas de panne, garde ce qui était affiché. */
export async function relireNotifications(): Promise<void> {
  try {
    const b = await fetchJSON<any>(URL_NOTIFS(), undefined, undefined, true);
    const liste = Array.isArray(b?.notifications) ? b.notifications.map(notifValide).filter((n: NotifCercle | null): n is NotifCercle => n !== null) : [];
    notifsCercle.set({ relais: 'ok', nonLues: entier(b?.unread_count) ?? liste.filter((n: NotifCercle) => !n.read).length, liste });
  } catch (e) {
    const relais = relaisDe(e);
    notifsCercle.update((p) => (relais === 'indisponible' ? { ...p, relais } : { relais, nonLues: 0, liste: [] }));
  }
}

function appliquerLue(ids: Set<number> | 'toutes', nonLues: number | null) {
  notifsCercle.update((p) => {
    const liste = p.liste.map((n) => (ids === 'toutes' || ids.has(n.id) ? { ...n, read: true } : n));
    return { ...p, liste, nonLues: nonLues ?? liste.filter((n) => !n.read).length };
  });
}

/** POST sans corps : rien d'autre ne part que l'identifiant. */
export async function marquerLue(id: number): Promise<void> {
  const b = await fetchJSON<any>(`${URL_NOTIFS()}/${encodeURIComponent(String(id))}/read`, { method: 'POST' }, undefined, true);
  appliquerLue(new Set([id]), entier(b?.unread_count));
}

export async function toutMarquerLu(): Promise<void> {
  await fetchJSON<any>(`${URL_NOTIFS()}/read-all`, { method: 'POST' }, undefined, true);
  appliquerLue('toutes', 0);
}

function reglagesValides(b: any): Reglages {
  const r = {} as Reglages;
  for (const k of TYPES_REGLAGE) r[k] = b?.[k] !== false;
  return r;
}

/** `null` : serveur sans ces routes (404). */
export async function lireReglages(): Promise<Reglages | null> {
  try {
    return reglagesValides(await fetchJSON<any>(`${URL_NOTIFS()}/preferences`, undefined, undefined, true));
  } catch (e) {
    if (statut(e) === 404) return null;
    throw e;
  }
}

/** Un seul interrupteur à la fois : seule sa clé part. */
export async function reglerType(type: TypeReglage, actif: boolean): Promise<Reglages> {
  const b = await fetchJSON<any>(`${URL_NOTIFS()}/preferences`, { method: 'PUT', body: JSON.stringify({ [type]: actif }) }, undefined, true);
  return reglagesValides(b);
}

// ─── Suivi espacé ───────────────────────────────────────────────────────────

let minuteur: ReturnType<typeof setTimeout> | null = null;
let suivi = false;

function surVisibilite() {
  if (suivi && typeof document !== 'undefined' && !document.hidden) void tour(true);
}

async function tour(immediat = false) {
  if (!suivi) return;
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
  const cache = typeof document !== 'undefined' && document.hidden;
  if (immediat || !cache) await relireNotifications();
  if (!suivi) return;
  // Serveur trop ancien : on s'arrête, sans rien interroger de plus.
  if (get(notifsCercle).relais === 'absent') { arreterSuiviNotifications(); return; }
  minuteur = setTimeout(() => void tour(), INTERVALLE_NOTIFS_MS);
}

/** Lance le suivi (idempotent). L'appelant le fait quand le greffon tourne. */
export function demarrerSuiviNotifications(): void {
  if (suivi) return;
  suivi = true;
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', surVisibilite);
  void tour(true);
}

export function arreterSuiviNotifications(): void {
  suivi = false;
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', surVisibilite);
}
