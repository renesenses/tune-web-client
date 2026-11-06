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
 *   GET  /collection[?format=&etat=&dossier=&genre=&style=] → { statut, compteurs, disques, attribution }
 *   GET  /parcourir          → { par_dossier, par_genre, par_style } (#7929)
 *   GET  /disques/{release}/services → « Chercher sur les services » (#7928)
 *   GET  /cd?mb_release=     → { dans_la_collection, copie, disque }
 *   GET  /pochettes/{release}  → la pochette, depuis le cache LOCAL du serveur ;
 *                              503 `pochettes_limitees` + Retry-After quand
 *                              le CDN de Discogs freine (#7927)
 *   DELETE /cache[?quoi=pochettes] → « Effacer le cache »
 *
 * Cache (demande de Bertrand du 01/11/2026) : le serveur télécharge chaque
 * pochette UNE fois chez Discogs et la sert lui-même (ETag, 304) ; l'écran
 * n'appelle JAMAIS le CDN de Discogs. La liste se lit dans le cache du
 * serveur, tout de suite ; une revalidation discrète tourne derrière.
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
/** Les étapes de la synchronisation, dans l'ordre où le serveur les suit
 *  (correctif du 31/10/2026 : les services d'abord). L'affinage
 *  MusicBrainz vient ensuite, à part (`AffinageMusicbrainz`). */
export type Etape = 'liste' | 'streaming' | 'bibliotheque';

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
  /** L'affinage MusicBrainz, en tâche de fond après la synchronisation ;
   *  absent d'un serveur antérieur. */
  affinage_musicbrainz?: AffinageMusicbrainz;
  /** Le cache de pochettes du serveur (01/11/2026). */
  pochettes?: EtatPochettes;
}

/** Le cache de pochettes du serveur. Les champs après `restantes` viennent
 *  de tune-server-rust#7927 : absents d'un serveur antérieur. */
export interface EtatPochettes {
  en_cours: boolean;
  en_cache: number;
  restantes: number;
  echecs?: number;
  /** Le CDN de Discogs freine ou refuse : les téléchargements attendent. */
  limitees?: boolean;
  reprise_dans_s?: number | null;
  derniere_erreur?: string | null;
}

export interface AffinageMusicbrainz {
  en_cours: boolean;
  /** Disques dont les liens MusicBrainz restent à lire. */
  restants: number;
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
  /** Le disque a une pochette chez Discogs : le serveur la sert depuis son
   *  cache (`urlPochette`). L'adresse Discogs ne sort jamais du serveur. */
  pochette?: boolean;
  bibliotheque: AlbumDeLaBibliotheque | null;
  streaming: SurUnService[];
  etat: EtatDisque;
  /** `null` pour un support qui ne se copie pas (vinyle, cassette). */
  copie: boolean | null;
  proposer_extraction: boolean;
  /** tune-server-rust#7929 : le dossier Discogs de l'exemplaire, ses genres
   *  et ses styles ; absents d'un serveur antérieur. */
  dossier?: number | null;
  genres?: string[];
  styles?: string[];
}

/** Un dossier Discogs et son compteur (#7929). `nom` est `null` quand
 *  Discogs ne montre pas les dossiers (collection d'un autre compte). */
export interface CompteDossier { id: number; nom: string | null; nombre: number }
export interface CompteNom { nom: string; nombre: number }

/** Les filtres de navigation (#7929). */
export interface Navigation {
  dossier: number | null;
  genre: string | null;
  style: string | null;
}

export const SANS_NAVIGATION: Navigation = { dossier: null, genre: null, style: null };

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
    par_dossier?: CompteDossier[];
    par_genre?: CompteNom[];
    par_style?: CompteNom[];
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

export function urlCollection(format: Famille | null, etat: EtatDisque | null, nav: Navigation = SANS_NAVIGATION): string {
  const q = new URLSearchParams();
  if (format) q.set('format', format);
  if (etat) q.set('etat', etat);
  if (nav.dossier != null) q.set('dossier', String(nav.dossier));
  if (nav.genre) q.set('genre', nav.genre);
  if (nav.style) q.set('style', nav.style);
  const s = q.toString();
  return `${RACINE}/collection${s ? `?${s}` : ''}`;
}

export const lireCollection = (format: Famille | null, etat: EtatDisque | null, nav: Navigation = SANS_NAVIGATION) =>
  fetchJSON<Collection>(urlCollection(format, etat, nav), undefined, undefined, true);

// ─── « Chercher sur les services » (tune-server-rust#7928) ─────────────────

export interface PropositionService {
  service: string;
  id: string;
  titre: string;
  artiste: string;
  par: 'code_barre' | 'catalogue' | 'artiste_titre';
  /** De 0 à 100. */
  score: number;
  /** Le même album, selon la règle de la synchronisation. */
  exact: boolean;
}

export interface ResultatServices {
  release_id: number;
  services: string[];
  sans_reponse: string[];
  meilleure: PropositionService | null;
  propositions: PropositionService[];
}

export const chercherSurLesServices = (releaseId: number) =>
  fetchJSON<ResultatServices>(
    `${RACINE}/disques/${encodeURIComponent(String(releaseId))}/services`, undefined, undefined, true,
  );

/** Une proposition, sous la forme d'un album de service de la carte, pour
 *  l'ouvrir (fiche du service) ou l'écouter comme un disque « en
 *  streaming ». */
export function versSurUnService(p: PropositionService): SurUnService {
  return {
    service: p.service, id: p.id, titre: p.titre, artiste: p.artiste,
    par: p.par === 'artiste_titre' ? 'artiste_titre' : 'code_barre',
  };
}

/** Un disque où « Chercher sur les services » a du sens : ni dans la
 *  bibliothèque, ni déjà trouvé sur un service. */
export const peutChercherSurLesServices = (d: Disque) => !d.bibliotheque && d.streaming.length === 0;

// ─── L'état des pochettes (tune-server-rust#7927) ──────────────────────────

/** La phrase discrète de l'état des pochettes, ou `null` s'il n'y a rien à
 *  dire : « Discogs limite… reprise dans N min », « N pochettes en cours de
 *  téléchargement », ou « N pochettes indisponibles chez Discogs ». */
export function messagePochettes(
  p: EtatPochettes | null | undefined,
  traduire: (cle: string) => string,
): string | null {
  if (!p) return null;
  if (p.limitees) {
    const s = Math.max(1, Math.round(p.reprise_dans_s ?? 60));
    const cle = p.derniere_erreur === 'discogs_refuse'
      ? 'collectionPhysique.pochettes.refusees'
      : p.derniere_erreur === 'discogs_indisponible'
        ? 'collectionPhysique.pochettes.indisponibles'
        : 'collectionPhysique.pochettes.limitees';
    return traduire(cle).replace('{n}', String(p.restantes)).replace('{min}', String(Math.ceil(s / 60)));
  }
  if (p.restantes > 0) {
    return traduire('collectionPhysique.pochettes.enCours').replace('{n}', String(p.restantes));
  }
  if ((p.echecs ?? 0) > 0) {
    return traduire('collectionPhysique.pochettes.echecs').replace('{n}', String(p.echecs));
  }
  return null;
}

/** Faut-il relire l'état des pochettes (et retenter les cases vides) ? */
export const pochettesEnAttente = (p: EtatPochettes | null | undefined) =>
  !!p && (p.restantes > 0 || p.limitees === true);

/** « Effacer le cache » : `pochettes` seules, ou `tout` (pochettes, liste,
 *  fiches ; le compte suivi reste). */
export const effacerCache = (quoi: 'tout' | 'pochettes' = 'tout') =>
  fetchJSON<{ efface: string }>(`${RACINE}/cache?quoi=${quoi}`, { method: 'DELETE' }, undefined, true);

/** Au-delà de cet âge, la liste lue est revalidée à l'ouverture de l'écran
 *  (en tâche de fond : l'écran montre le cache tout de suite). */
export const REVALIDER_APRES_S = 10 * 60;

/** La liste mérite-t-elle une revalidation discrète ? */
export function aRevalider(e: EtatSynchro | null, maintenantS = Date.now() / 1000): boolean {
  if (!e?.nom_utilisateur || e.avancement?.en_cours) return false;
  if (e.liste_lue_le == null) return false;
  return maintenantS - e.liste_lue_le > REVALIDER_APRES_S;
}

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
  'jeton_refuse', 'nom_invalide', 'aucun_compte', 'ecriture',
]);

/** La clé i18n d'une erreur (de synchronisation ou de refus). */
export function cleErreur(code: string | null | undefined): string {
  return code && ERREURS_CONNUES.has(code)
    ? `collectionPhysique.erreur.${code}`
    : 'collectionPhysique.erreur.generique';
}

/** Un refus inconnu conserve sa cause et son statut au lieu d'un message vide. */
export function messageErreurCollection(e: unknown, traduire: (cle: string) => string): string {
  const code = typeof e === 'string' ? e.replace(/^collection_physique\./, '') : codeDeRefus(e);
  if (code && ERREURS_CONNUES.has(code)) return traduire(cleErreur(code));
  const statut = (e as { status?: unknown } | null)?.status;
  const causes = [code, typeof statut === 'number' ? `HTTP ${statut}` : null].filter(Boolean);
  if (!causes.length && e instanceof Error && e.message) causes.push(e.message);
  return traduire('collectionPhysique.erreur.inconnue').replace(
    '{cause}', causes.join(' · ') || traduire('collectionPhysique.erreur.sansReponse'),
  );
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

/** L'adresse LOCALE de la pochette d'un disque : servie par le greffon,
 *  depuis le cache du serveur. Une adresse `/api/…`, que `artworkUrl` passe
 *  telle quelle (et par le pont, avec son jeton). */
export function urlPochette(releaseId: number, version = 0): string {
  const base = `/api/v1/ext/${NOM_GREFFON}/pochettes/${encodeURIComponent(String(releaseId))}`;
  // #7927 : une case dont la pochette a échoué (CDN de Discogs limité) se
  // retente quand le cache du serveur avance — une autre adresse fait
  // oublier son échec à `AlbumArt`.
  return version > 0 ? `${base}?v=${version}` : base;
}

export interface PochetteDuDisque {
  /** Ce qu'`AlbumArt` reçoit en `coverPath`. */
  coverPath: string | null;
  /** L'album local, pour le repli d'`AlbumArt` si sa pochette ne se charge pas. */
  albumId: number | null;
  /** Toujours `false` depuis le cache du 01/11/2026 : plus rien ne se
   *  charge directement chez Discogs. */
  directe: boolean;
}

/**
 * La pochette d'un disque :
 * 1. dans la bibliothèque et l'album a une pochette → celle de l'album, par
 *    les routes de pochettes du serveur ;
 * 2. sinon la pochette Discogs, servie par le CACHE du serveur ;
 * 3. sinon rien : `AlbumArt` montre son repli neutre.
 */
export function pochetteDuDisque(d: Disque, version = 0): PochetteDuDisque {
  const b = d.bibliotheque;
  if (b?.cover_path) return { coverPath: b.cover_path, albumId: b.album_id, directe: false };
  if (d.pochette === true) return { coverPath: urlPochette(d.release_id, version), albumId: null, directe: false };
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
