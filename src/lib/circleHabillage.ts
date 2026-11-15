/**
 * Tune Circle rc12 — l'habillage des maquettes de Levente (15/11/2026).
 *
 * Fonctions PURES, sans réseau : elles trient, filtrent et comptent ce que
 * les API existantes rendent déjà. Règle de Bertrand : AUCUNE donnée
 * inventée. Ce qu'aucune API ne fournit (abonnés, écoutes, tendances,
 * présence en ligne, personnes près de vous) n'a ni fonction ni bloc ici.
 */
import type { ConversationCercle, MessageCercle, CarteMusique } from './circleMessagerie';
import type { PlaylistCercleResume } from './circlePlaylists';
import type { ContactCercle } from './circle';
import type { Lieu } from './champCercle/scene';
import type { NotifCercle } from './circleNotifications';

// ── Messages ────────────────────────────────────────────────────────────────

/** Les filtres de la liste des conversations. « Playlists » de la maquette :
 *  aucune conversation n'a ce genre côté cloud, le filtre n'existe pas. */
export const FILTRES_CONVERSATIONS = ['tout', 'directs', 'groupes'] as const;
export type FiltreConversations = (typeof FILTRES_CONVERSATIONS)[number];

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function filtrerConversations(
  liste: readonly ConversationCercle[], filtre: FiltreConversations, recherche: string,
): ConversationCercle[] {
  const q = sansAccents(recherche.trim());
  return liste.filter((c) => {
    if (filtre === 'directs' && c.kind !== 'direct') return false;
    if (filtre === 'groupes' && c.kind === 'direct') return false;
    if (!q) return true;
    const nom = c.kind === 'direct' ? c.contact.name : c.circle.name;
    const dernier = c.last_message?.body ?? c.last_message?.card?.title ?? '';
    return sansAccents(nom).includes(q) || sansAccents(dernier).includes(q);
  });
}

/** « Partagé dans cette conversation » : les cartes musique des messages
 *  CHARGÉS du fil, la plus récente d'abord, sans doublon (même titre, même artiste). */
export function partagesDuFil(messages: readonly MessageCercle[]): (CarteMusique & { message_id: number })[] {
  const vus = new Set<string>();
  const out: (CarteMusique & { message_id: number })[] = [];
  for (const m of [...messages].sort((a, b) => b.id - a.id)) {
    const c = m.card;
    if (!c || c.type === 'theme') continue;
    const cle = `${c.type}|${c.title}|${c.artist_name ?? ''}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({ ...c, message_id: m.id });
  }
  return out;
}

// ── Playlists partagées ─────────────────────────────────────────────────────

/** « Suivies », « Tendances » de la maquette : ni suivi ni écoutes dans
 *  `GET /playlists` — ces filtres n'existent pas. « Nouveautés » : mises à jour
 *  depuis {@link JOURS_NOUVEAUTE} jours (`updated_at`), seule date rendue. */
export const FILTRES_PLAYLISTS = ['tout', 'nouveautes', 'amis', 'miennes'] as const;
export type FiltrePlaylists = (typeof FILTRES_PLAYLISTS)[number];
export const TRIS_PLAYLISTS = ['recentes', 'nom', 'titres'] as const;
export type TriPlaylists = (typeof TRIS_PLAYLISTS)[number];
export const JOURS_NOUVEAUTE = 7;

const temps = (v: string | null | undefined) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : -Infinity; };

export function filtrerPlaylists(
  liste: readonly PlaylistCercleResume[], filtre: FiltrePlaylists, tri: TriPlaylists, maintenant = Date.now(),
): PlaylistCercleResume[] {
  const seuil = maintenant - JOURS_NOUVEAUTE * 86_400_000;
  const gardees = liste.filter((p) => {
    if (filtre === 'amis') return !p.mine;
    if (filtre === 'miennes') return p.mine;
    if (filtre === 'nouveautes') return temps(p.updated_at) >= seuil;
    return true;
  });
  const parNom = (a: PlaylistCercleResume, b: PlaylistCercleResume) => a.name.localeCompare(b.name);
  return gardees.sort((a, b) => {
    if (tri === 'nom') return parNom(a, b);
    if (tri === 'titres') return b.count - a.count || parNom(a, b);
    return temps(b.updated_at) - temps(a.updated_at);
  });
}

/** Le propriétaire affiché sur une carte : le partageur, ou `null` (c'est moi). */
export const proprietaireAffiche = (p: PlaylistCercleResume) => (p.mine ? null : p.owner?.name ?? null);

// ── Découvrir, Mon cercle ───────────────────────────────────────────────────

/** Les initiales d'un nom (deux au plus), pour un avatar sans photo — le cloud n'en rend pas. */
export function initiales(nom: string, locale = 'fr'): string {
  return nom.trim().split(/\s+/u).slice(0, 2).map((n) => Array.from(n)[0] ?? '').join('').toLocaleUpperCase(locale);
}

/**
 * Les compteurs de Découvrir, calculés sur MON cercle (contacts acceptés,
 * lieux qu'ils ont choisi de montrer, playlists partagées). `null` = inconnu :
 * le compteur se cache plutôt que d'afficher zéro.
 */
export interface CompteursCercle { membres: number; pays: number | null; playlists: number | null }
export function compteursCercle(
  contacts: readonly ContactCercle[], lieux: ReadonlyMap<number, Lieu> | null, playlists: readonly PlaylistCercleResume[] | null,
): CompteursCercle {
  let pays: number | null = null;
  if (lieux && lieux.size > 0) {
    const codes = new Set<string>();
    for (const c of contacts) { const cc = lieux.get(c.user_id)?.country_code; if (cc) codes.add(cc.toUpperCase()); }
    pays = codes.size > 0 ? codes.size : null;
  }
  return { membres: contacts.length, pays, playlists: playlists ? playlists.length : null };
}

/** « Nouveau sur Tune Circle » : les contacts qui ont ACCEPTÉ (notifications `contact_accepted`), les plus récents d'abord. */
export const nouveauxDansLeCercle = (notifs: readonly NotifCercle[], n = 4) =>
  notifs.filter((x) => x.kind === 'contact_accepted').sort((a, b) => temps(b.at) - temps(a.at)).slice(0, n);

/** « Activité récente » : les partages de playlists et les arrivées, les plus récents d'abord. */
export const activiteRecente = (notifs: readonly NotifCercle[], n = 5) =>
  notifs.filter((x) => x.kind === 'playlist_shared' || x.kind === 'contact_accepted')
    .sort((a, b) => temps(b.at) - temps(a.at)).slice(0, n);

/** « Messages récents » : les conversations qui ont un dernier message, les plus récentes d'abord. */
export const conversationsRecentes = (liste: readonly ConversationCercle[], n = 3) =>
  liste.filter((c) => !!c.last_message).sort((a, b) => temps(b.last_message?.created_at) - temps(a.last_message?.created_at)).slice(0, n);
