/**
 * web#2287, point 2 — « Partager avec un cercle » n'est plus une copie
 * silencieuse : la playlist de cercle SUIT sa playlist locale d'origine.
 *
 * Décision de Bertrand du 21/10 (consigne 2 bis de tune-server-rust#6688) ;
 * contrat livré côté greffon par tune-server-rust#6694 :
 *
 *   PUT    /ext/circle/playlists/{id}/follow  { playlist_id, circle_id?, circle_name? }
 *   GET    /ext/circle/playlists/{id}/follow  → le lien, ou { following: false }
 *   DELETE /ext/circle/playlists/{id}/follow  « Ne plus suivre » (lien gardé, arrêté)
 *   POST   /ext/circle/playlists/{id}/follow/sync  « Synchroniser maintenant »
 *   GET    /ext/circle/playlists/{id}  → porte `follow` quand elle est suivie
 *   GET    /playlists[/{id}]  → `cercles: [{ id, nom, suivi, synchronisee_le }]`
 *
 * L'originale l'emporte : ce qu'un membre change dans la playlist de cercle
 * est remplacé au report suivant, et l'écran le DIT (`warning`).
 *
 * Un greffon d'avant ces routes répond 404 : le partage reste la copie
 * d'avant, sans rien casser.
 */
import { BASE, fetchJSON } from './api';

export interface SuiviPlaylist {
  following: boolean;
  stoppedAt: string | null;
  circleName: string | null;
  localPlaylistId: number | null;
  localName: string | null;
  lastSync: string | null;
  pending: boolean;
  lastError: unknown;
  warning: { code: string | null; at: string | null } | null;
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Lit le lien tel que le greffon le rend ; `null` si ce n'en est pas un. */
export function lireSuivi(b: unknown): SuiviPlaylist | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const s = b as Record<string, unknown>;
  if (typeof s.following !== 'boolean') return null;
  // `{ following: false }` sans rien d'autre : aucun lien.
  if (!s.following && s.stopped_at == null && s.local_name == null) return null;
  const w = s.warning && typeof s.warning === 'object' ? (s.warning as Record<string, unknown>) : null;
  const pid = typeof s.local_playlist_id === 'number' ? s.local_playlist_id : null;
  return {
    following: s.following,
    stoppedAt: texte(s.stopped_at),
    circleName: texte(s.circle_name),
    localPlaylistId: pid,
    localName: texte(s.local_name),
    lastSync: texte(s.last_sync),
    pending: s.pending === true,
    lastError: s.last_error ?? null,
    warning: w ? { code: texte(w.code), at: texte(w.at) } : null,
  };
}

/** La phrase de l'avertissement, ou `null`. */
export function cleAvertissement(s: SuiviPlaylist | null | undefined): string | null {
  const code = s?.warning?.code;
  if (!code) return null;
  if (code === 'circle.follow_overwritten') return 'v2.circle.follow.overwritten';
  if (code === 'circle.follow_source_missing') return 'v2.circle.follow.sourceMissing';
  return 'v2.circle.follow.warning';
}

const racine = `${BASE}/ext/circle/playlists`;
const seg = (v: string | number) => encodeURIComponent(String(v));

function envoyer<T>(url: string, method: string, corps?: unknown): Promise<T> {
  const options: RequestInit = { method };
  if (corps !== undefined) options.body = JSON.stringify(corps);
  return fetchJSON<T>(url, options, undefined, true);
}

/** La playlist de cercle `id` suit la playlist locale `playlistId`. */
export async function suivrePlaylistLocale(
  id: string | number,
  playlistId: number,
  cercle: { id: number; nom?: string | null },
): Promise<SuiviPlaylist | null> {
  const corps: Record<string, unknown> = { playlist_id: playlistId, circle_id: cercle.id };
  if (cercle.nom) corps.circle_name = cercle.nom;
  const r = await envoyer<{ follow?: unknown }>(`${racine}/${seg(id)}/follow`, 'PUT', corps);
  return lireSuivi(r?.follow);
}

export function nePlusSuivre(id: string | number): Promise<unknown> {
  return envoyer(`${racine}/${seg(id)}/follow`, 'DELETE');
}

export async function synchroniserSuivi(id: string | number): Promise<SuiviPlaylist | null> {
  const r = await envoyer<{ follow?: unknown }>(`${racine}/${seg(id)}/follow/sync`, 'POST');
  return lireSuivi(r?.follow);
}

/** Le badge d'une playlist LOCALE : les cercles où elle est partagée. */
export interface CercleDePlaylist {
  id: number | string;
  nom: string;
  suivi: boolean;
  synchroniseeLe: string | null;
}

export function cerclesDePlaylist(pl: unknown): CercleDePlaylist[] {
  const l = (pl as { cercles?: unknown } | null | undefined)?.cercles;
  if (!Array.isArray(l)) return [];
  return l
    .map((c: any) => ({
      id: c?.id,
      nom: texte(c?.nom) ?? '',
      suivi: c?.suivi === true,
      synchroniseeLe: texte(c?.synchronisee_le),
    }))
    .filter((c) => c.id != null && c.nom);
}

/** « Partagée avec un cercle : Jazz du dimanche » — ou `null`. */
export function ligneBadgeCercles(pl: unknown, tr: (k: string) => string): string | null {
  const c = cerclesDePlaylist(pl);
  if (!c.length) return null;
  const noms = c
    .map((x) => (x.suivi ? x.nom : `${x.nom} (${tr('v2.circle.follow.stoppedShort')})`))
    .join(', ');
  return tr('v2.circle.follow.badge').replace('{cercles}', noms);
}
