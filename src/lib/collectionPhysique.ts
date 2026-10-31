/**
 * tune-server-rust#7195 — « Ma collection physique » : la collection Discogs
 * de l'utilisateur (vinyles, CD, SACD, cassettes…) comparée à sa
 * bibliothèque et à Qobuz / TIDAL.
 *
 * Contrat du greffon (`plugins/tune-collection-physique/src/lib.rs`), monté
 * sous `/api/v1/ext/collection-physique` SEULEMENT quand le greffon est
 * installé ET chargé :
 *
 *   GET  /reglages           → { nom_utilisateur, jeton: aucun|integre|personnel }
 *   PUT  /reglages           { nom_utilisateur | null }
 *   POST /reglages/identite  → le compte du jeton personnel, retenu
 *   POST /synchroniser       → 202 { lance, avancement } · 409 aucun_compte
 *   GET  /etat               → { avancement, derniere_synchro, derniere_erreur, … }
 *   GET  /collection[?format=&etat=] → { statut, compteurs, disques, attribution }
 *   GET  /cd?mb_release=     → { dans_la_collection, copie, disque }
 *
 * Le jeton Discogs n'est JAMAIS rendu : `jeton` dit seulement lequel existe.
 * Refus : `{ error: "collection_physique.<code>" }`, traduits ici.
 *
 * Tous les appels passent `sansBandeau` : l'écran porte ses erreurs, dans sa
 * langue.
 */
import { derived, writable } from 'svelte/store';
import * as api from './api';
import { BASE, fetchJSON } from './api';

export const NOM_GREFFON = 'collection-physique';
const RACINE = `${BASE}/ext/collection-physique`;

/** L'attribution que demandent les conditions d'usage de Discogs : en
 *  anglais, telle quelle, dans toutes les langues. */
export const ATTRIBUTION_DISCOGS = 'Data provided by Discogs';
export const LIEN_DISCOGS = 'https://www.discogs.com';

export type Jeton = 'aucun' | 'integre' | 'personnel';
export type Famille = 'vinyle' | 'cd' | 'sacd' | 'cassette' | 'autre';
export type EtatDisque = 'bibliotheque' | 'streaming' | 'nulle_part' | 'a_verifier';
export type Etape = 'liste' | 'codes_barres' | 'musicbrainz' | 'streaming';

export const FAMILLES: readonly Famille[] = ['vinyle', 'cd', 'sacd', 'cassette', 'autre'];
export const ETATS: readonly EtatDisque[] = ['bibliotheque', 'streaming', 'nulle_part', 'a_verifier'];

export interface Reglages {
  nom_utilisateur: string | null;
  jeton: Jeton;
}

export interface Avancement {
  en_cours: boolean;
  etape: Etape | null;
  fait: number;
  total: number;
}

export interface EtatSynchro {
  nom_utilisateur: string | null;
  avancement: Avancement;
  disques: number;
  tronquee: boolean;
  liste_lue_le: number | null;
  derniere_synchro: number | null;
  derniere_erreur: string | null;
}

export interface AlbumDeLaBibliotheque {
  album_id: number;
  titre: string;
  artiste: string | null;
  qualite: string | null;
  format: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
  /** La pochette de l'album local (`albums.cover_path`), servie par
   *  `/library/artwork` ; `null` s'il n'en a pas. */
  cover_path?: string | null;
  par: string;
}

export interface SurUnService {
  service: string;
  id: string;
  titre: string;
  artiste: string;
  par: 'code_barre' | 'artiste_titre';
}

export interface Disque {
  instance_id: number;
  release_id: number;
  artiste: string;
  titre: string;
  annee: number | null;
  labels: string[];
  numeros_catalogue: string[];
  formats: string[];
  precisions: string[];
  format: Famille;
  lien_discogs: string;
  /** La vignette Discogs de la PAGE DE COLLECTION (`thumb`, sinon
   *  `cover_image`) : une adresse `https://i.discogs.com/…`, ou absente. */
  vignette?: string | null;
  bibliotheque: AlbumDeLaBibliotheque | null;
  streaming: SurUnService[];
  etat: EtatDisque;
  /** `null` pour un support qui ne se copie pas (vinyle, cassette). */
  copie: boolean | null;
  proposer_extraction: boolean;
}

export interface Collection {
  statut: 'ok' | 'aucun_compte' | 'a_synchroniser';
  nom_utilisateur: string | null;
  tronquee?: boolean;
  derniere_synchro?: number | null;
  compteurs: {
    total: number;
    par_etat?: Partial<Record<EtatDisque, number>>;
    par_format?: Partial<Record<Famille, number>>;
    cd_non_copies?: number;
  };
  disques: Disque[];
}

export interface ReponseCd {
  dans_la_collection: boolean;
  copie: boolean;
  disque: Disque | null;
}

// ─── Le greffon est-il là ? ─────────────────────────────────────────────────

interface FicheGreffon { name: string; installed?: boolean; enabled?: boolean }

export const collectionPhysiquePlugin = writable<FicheGreffon | null | 'absent'>(null);

/** Installé ET chargé : sinon chaque appel rendrait le 404 nu d'axum. */
export const collectionPhysiqueChargee = derived(
  collectionPhysiquePlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.installed !== false && $p.enabled === true,
);

export async function refreshCollectionPhysiquePlugin(): Promise<void> {
  try {
    const liste = (await api.getInstalledPlugins()) as unknown as FicheGreffon[];
    collectionPhysiquePlugin.set(liste.find((p) => p.name === NOM_GREFFON) ?? 'absent');
  } catch {
    // Indéterminé : on garde `null`, l'entrée ne s'affiche pas sur une supposition.
  }
}

// ─── Les appels ─────────────────────────────────────────────────────────────

const JSON_PUT = (corps: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(corps) });

export const lireReglages = () => fetchJSON<Reglages>(`${RACINE}/reglages`, undefined, undefined, true);
export const poserCompte = (nom: string | null) =>
  fetchJSON<Reglages>(`${RACINE}/reglages`, JSON_PUT({ nom_utilisateur: nom }), undefined, true);
export const compteDuJeton = () =>
  fetchJSON<Reglages>(`${RACINE}/reglages/identite`, { method: 'POST' }, undefined, true);
export const synchroniser = () =>
  fetchJSON<{ lance: boolean; avancement: Avancement }>(`${RACINE}/synchroniser`, { method: 'POST' }, undefined, true);
export const lireEtat = () => fetchJSON<EtatSynchro>(`${RACINE}/etat`, undefined, undefined, true);

export function urlCollection(format: Famille | null, etat: EtatDisque | null): string {
  const q = new URLSearchParams();
  if (format) q.set('format', format);
  if (etat) q.set('etat', etat);
  const s = q.toString();
  return `${RACINE}/collection${s ? `?${s}` : ''}`;
}

export const lireCollection = (format: Famille | null, etat: EtatDisque | null) =>
  fetchJSON<Collection>(urlCollection(format, etat), undefined, undefined, true);

/** Un CD inséré (pressage MusicBrainz du greffon `cd`) est-il dans la
 *  collection, et copié ? `null` sans greffon ou sur une panne : l'écran du
 *  CD ne dit rien plutôt que de deviner. */
export async function cdDansLaCollection(mbRelease: string | null | undefined): Promise<ReponseCd | null> {
  const r = (mbRelease ?? '').trim();
  if (!r) return null;
  try {
    return await fetchJSON<ReponseCd>(`${RACINE}/cd?mb_release=${encodeURIComponent(r)}`, undefined, undefined, true);
  } catch {
    return null;
  }
}

// ─── Ce que l'écran affiche ─────────────────────────────────────────────────

/** Le code d'un refus du greffon, sans son préfixe ; `null` sinon. */
export function codeDeRefus(e: unknown): string | null {
  const o = e as { corps?: { error?: unknown }; code?: unknown } | null;
  const brut = typeof o?.corps?.error === 'string' ? o.corps.error : typeof o?.code === 'string' ? o.code : null;
  if (!brut) return null;
  return brut.replace(/^collection_physique\./, '');
}

const ERREURS_CONNUES = new Set([
  'collection_privee', 'utilisateur_inconnu', 'discogs_limite', 'discogs_indisponible',
  'musicbrainz_indisponible', 'bibliotheque_illisible', 'jeton_personnel_absent',
  'jeton_refuse', 'nom_invalide', 'aucun_compte',
]);

/** La clé i18n d'une erreur (de synchronisation ou de refus). */
export function cleErreur(code: string | null | undefined): string {
  return code && ERREURS_CONNUES.has(code)
    ? `collectionPhysique.erreur.${code}`
    : 'collectionPhysique.erreur.generique';
}

/** Un nom d'utilisateur Discogs que le greffon acceptera. */
export function nomValide(nom: string): boolean {
  const n = nom.trim();
  return n.length > 0 && n.length <= 64 && /^[A-Za-z0-9._-]+$/.test(n);
}

/** « 24 bits · 96 kHz », « FLAC », ou rien. */
export function qualiteDe(a: AlbumDeLaBibliotheque | null | undefined): string {
  if (!a) return '';
  const parts: string[] = [];
  if (a.bit_depth) parts.push(`${a.bit_depth} bits`);
  if (a.sample_rate) {
    const k = a.sample_rate / 1000;
    parts.push(`${Number.isInteger(k) ? k : k.toFixed(1)} kHz`);
  }
  if (!parts.length && a.format) parts.push(a.format.toUpperCase());
  return parts.join(' · ');
}

/** « RCA · PB 41447 · 1987 » — ce qui identifie un pressage. */
export function legendeDuDisque(d: Disque): string {
  const parts = [d.labels[0], d.numeros_catalogue[0], d.annee ? String(d.annee) : null];
  return parts.filter((p): p is string => !!p).join(' · ');
}

export const nomService = (k: string) => (k === 'tidal' ? 'TIDAL' : k.charAt(0).toUpperCase() + k.slice(1));

// ─── La grille ──────────────────────────────────────────────────────────────

/** La clé du choix grille / liste, dans `lib/preferencesEcran` comme celui de
 *  la Bibliothèque (`lib.display`). */
export const CLE_AFFICHAGE = 'collectionPhysique.display';

/** Une vignette Discogs que l'écran peut charger DIRECTEMENT : `https`, sur
 *  un hôte d'images de Discogs, et pas l'image vide (`spacer.gif`). Le
 *  serveur filtre déjà ; l'écran ne se fie pas à lui seul. */
export function vignetteDiscogsSure(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  const m = /^https:\/\/([^/?#]+)\//.exec(u);
  if (!m) return null;
  const hote = m[1].toLowerCase();
  if (hote !== 'i.discogs.com' && hote !== 'img.discogs.com') return null;
  if (/[\s"<>]/.test(u) || /spacer\.gif/i.test(u)) return null;
  return u;
}

export interface PochetteDuDisque {
  /** Ce qu'`AlbumArt` reçoit en `coverPath`. */
  coverPath: string | null;
  /** L'album local, pour le repli d'`AlbumArt` si sa pochette ne se charge pas. */
  albumId: number | null;
  /** `true` : une adresse Discogs, chargée telle quelle par le navigateur
   *  (jamais par le relais du serveur). */
  directe: boolean;
}

/**
 * La pochette d'un disque :
 * 1. dans la bibliothèque et l'album a une pochette → celle de l'album, par
 *    les routes de pochettes du serveur ;
 * 2. sinon la vignette Discogs de la page de collection ;
 * 3. sinon rien : `AlbumArt` montre son repli neutre.
 */
export function pochetteDuDisque(d: Disque): PochetteDuDisque {
  const b = d.bibliotheque;
  if (b?.cover_path) return { coverPath: b.cover_path, albumId: b.album_id, directe: false };
  const v = vignetteDiscogsSure(d.vignette);
  if (v) return { coverPath: v, albumId: null, directe: true };
  return { coverPath: null, albumId: null, directe: false };
}

export type Pastille = 'bibliotheque' | 'streaming' | 'non_copie' | 'a_verifier' | 'nulle_part';

/** Les pastilles d'une carte : l'état, puis « Pas encore copié » pour un CD
 *  possédé qui n'est pas dans la bibliothèque. */
export function pastillesDuDisque(d: Disque): Pastille[] {
  const p: Pastille[] = [d.etat];
  if (d.proposer_extraction) p.push('non_copie');
  return p;
}

export const CLE_PASTILLE: Record<Pastille, string> = {
  bibliotheque: 'collectionPhysique.etat.bibliotheque',
  streaming: 'collectionPhysique.etat.streaming',
  non_copie: 'collectionPhysique.pastilleNonCopie',
  a_verifier: 'collectionPhysique.etat.a_verifier',
  nulle_part: 'collectionPhysique.etat.nulle_part',
};

export type ClicSurDisque =
  | { vers: 'album'; albumId: number }
  | { vers: 'streaming'; service: SurUnService }
  | { vers: 'discogs'; url: string };

/** Où mène un clic sur la carte : l'album de la bibliothèque s'il existe,
 *  sinon l'album chez le service de streaming, sinon la fiche Discogs. */
export function clicSurDisque(d: Disque): ClicSurDisque {
  if (d.bibliotheque) return { vers: 'album', albumId: d.bibliotheque.album_id };
  const s = d.streaming[0];
  if (s) return { vers: 'streaming', service: s };
  return { vers: 'discogs', url: d.lien_discogs };
}
