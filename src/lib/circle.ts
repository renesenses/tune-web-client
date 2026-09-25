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
 */
import { writable, derived } from 'svelte/store';
import * as api from './api';
import { BASE, fetchJSON, type ApiError } from './api';

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

/** Un de MES cercles : un classement privé, que les contacts ne voient pas. */
export interface CercleNomme {
  id: number;
  name: string;
  member_ids: number[];
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
