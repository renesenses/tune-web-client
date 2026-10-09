/**
 * Lecture CD — le greffon natif `cd` du serveur (renesenses/tune-server-rust#4863).
 *
 * Contrat du greffon (`plugins/tune-cd/src/routes.rs`), monté sous
 * `/api/v1/ext/cd` SEULEMENT quand le greffon est installé ET chargé :
 *
 *   GET  /etat    → { plateforme_prise_en_charge, lecteur, presence }
 *                   presence ∈ "aucun_lecteur" | "vide" | "disque"
 *   GET  /disque  → { disc_id, metadonnees: "musicbrainz" | "repli", titre,
 *                     artiste, pochette, pistes: [{ numero, titre, artiste,
 *                     duree_ms, … }] }
 *                   404 aucun_lecteur · 409 aucun_disque · 502 lecture_toc
 *   POST /jouer   { zone_id, piste? } → le disque ENTIER en file, joué à
 *                   partir de `piste` (la 1ʳᵉ sans elle) ; 400 piste_inconnue
 *   POST /ejecter { forcer? } → { ejecte, lecteur, zones_arretees }
 *                   (forum, fil 2135 : un SuperDrive n'a pas de bouton) ;
 *                   409 lecture_en_cours { zones } si une zone joue le disque
 *                   et que `forcer` manque · 409 aucun_disque · 404
 *                   aucun_lecteur · 501 ejection_non_prise_en_charge · 502
 *                   ejection
 *
 * L'insertion et l'éjection se voient en relisant `/etat` (voir
 * `LectureCdV2.svelte`) ; le greffon publie aussi `sources.changed`.
 *
 * Tous les appels passent `sansBandeau` : l'écran porte lui-même ses erreurs,
 * dans sa langue — jamais le bandeau brut « Server error: … ».
 */
import { writable, derived } from 'svelte/store';
import * as api from './api';
import { BASE, fetchJSON, type ApiError } from './api';

export type PresenceCd = 'aucun_lecteur' | 'vide' | 'disque';

export interface EtatLecteurCd {
  plateforme_prise_en_charge: boolean;
  lecteur: string | null;
  presence: PresenceCd;
  /**
   * tune-server-rust#6043 — le disque chargé en mémoire : `null` sans
   * chargement, absent d'un serveur qui ne sait pas charger.
   */
  chargement?: ChargementCd | null;
}

/** tune-server-rust#6043 — progression du chargement du CD en mémoire. */
export interface ChargementCd {
  disc_id: string;
  secteurs_charges: number;
  secteurs_total: number;
  pourcentage: number;
  pistes_chargees: number[];
  piste_en_cours: number | null;
  octets_ram: number;
  octets_fichier: number;
  secteurs_perdus: number;
  /** `null` tant que le chargement avance. */
  fin: 'termine' | 'ejecte' | 'libere' | null;
}

/** tune-server-rust#6043 — `GET /ext/cd/memoire`. */
export interface MemoireCd {
  disponible: boolean;
  actif: boolean;
  plafond_mio?: number;
  ram_disponible_mio?: number | null;
  chargement: ChargementCd | null;
}

export interface PisteCd {
  numero: number;
  titre: string;
  artiste: string;
  duree_ms: number;
}

export interface DisqueCd {
  disc_id: string;
  metadonnees: 'musicbrainz' | 'repli';
  titre: string | null;
  artiste: string | null;
  pochette: string | null;
  pistes: PisteCd[];
}

export interface LectureCdLancee {
  zone_id: number;
  disc_id: string;
  piste: number;
  file: number;
}

export function getEtatLecteurCd(): Promise<EtatLecteurCd> {
  return fetchJSON<EtatLecteurCd>(`${BASE}/ext/cd/etat`, undefined, undefined, true);
}

export function getDisqueCd(): Promise<DisqueCd> {
  return fetchJSON<DisqueCd>(`${BASE}/ext/cd/disque`, undefined, undefined, true);
}

/** Pose le disque entier en file sur la zone ; `piste` absente = la première. */
export function jouerCd(zoneId: number, piste?: number): Promise<LectureCdLancee> {
  const corps: { zone_id: number; piste?: number } = { zone_id: zoneId };
  if (piste != null) corps.piste = piste;
  return fetchJSON<LectureCdLancee>(
    `${BASE}/ext/cd/jouer`,
    { method: 'POST', body: JSON.stringify(corps) },
    undefined,
    true,
  );
}

export interface EjectionCd {
  ejecte: boolean;
  lecteur: string;
  zones_arretees: number[];
}

/**
 * Éjecte le disque. Sans `forcer`, le serveur REFUSE (409 lecture_en_cours)
 * si une zone le joue : l'écran demande alors confirmation, puis rappelle
 * avec `forcer`, qui arrête ces zones avant d'éjecter.
 */
export function ejecterCd(forcer = false): Promise<EjectionCd> {
  return fetchJSON<EjectionCd>(
    `${BASE}/ext/cd/ejecter`,
    { method: 'POST', body: JSON.stringify({ forcer }) },
    undefined,
    true,
  );
}

/** tune-server-rust#6043 — le réglage « Charger le CD en mémoire ». */
export function getMemoireCd(): Promise<MemoireCd> {
  return fetchJSON<MemoireCd>(`${BASE}/ext/cd/memoire`, undefined, undefined, true);
}

export function reglerMemoireCd(actif: boolean): Promise<MemoireCd> {
  return fetchJSON<MemoireCd>(
    `${BASE}/ext/cd/memoire`,
    { method: 'POST', body: JSON.stringify({ actif }) },
    undefined,
    true,
  );
}

/**
 * Ce que l'indicateur affiche du chargement : rien s'il ne porte pas sur le
 * disque affiché ou s'il s'est arrêté (éjection, réglage), sinon le
 * pourcentage et « fini ».
 */
export function vueChargementCd(
  c: ChargementCd | null | undefined,
  discId: string | null | undefined,
): { pourcentage: number; fini: boolean; surDisque: boolean } | null {
  if (!c || !discId || c.disc_id !== discId) return null;
  if (c.fin === 'ejecte' || c.fin === 'libere') return null;
  const fini = c.fin === 'termine';
  const pourcentage = fini ? 100 : Math.max(0, Math.min(99, Math.floor(c.pourcentage)));
  return { pourcentage, fini, surDisque: c.octets_fichier > 0 };
}

// ─── Le greffon est-il là ? ─────────────────────────────────────────────────

/** Ce que `/api/v1/plugins` dit du greffon `cd`, pour les champs qu'on lit. */
export interface EtatPluginCd {
  name: string;
  installed?: boolean;
  /** Le greffon TOURNE : son routeur est monté sous `/api/v1/ext/cd`. */
  enabled?: boolean;
}

/** `null` tant que le serveur n'a pas répondu ; `'absent'` s'il ne connaît pas `cd`. */
export const cdPlugin = writable<EtatPluginCd | null | 'absent'>(null);

/**
 * L'écran n'a de sens que si les routes répondent : installé ET chargé.
 * Installé mais pas encore redémarré, chaque appel rendrait le 404 nu d'axum.
 */
export const cdCharge = derived(
  cdPlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.installed === true && $p.enabled === true,
);

export async function refreshCdPlugin(): Promise<void> {
  try {
    const plugins = (await api.getInstalledPlugins()) as unknown as EtatPluginCd[];
    cdPlugin.set(plugins.find((p) => p.name === 'cd') ?? 'absent');
  } catch {
    // Indéterminé : on garde `null`, l'écran ne s'ouvre pas sur une supposition.
  }
}

// ─── Aides pures ────────────────────────────────────────────────────────────

/** `m:ss`, ou `h:mm:ss` au-delà d'une heure. */
export function dureeCd(ms: number): string {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Le titre à montrer. Sans métadonnées (`repli`), le serveur écrit « Piste N »
 * en français : on le remplace par la phrase de la langue de l'écran.
 */
export function titrePisteCd(p: PisteCd, disque: DisqueCd, pisteN: string): string {
  if (disque.metadonnees === 'repli' || !p.titre?.trim()) {
    return pisteN.replace('{n}', String(p.numero));
  }
  return p.titre;
}

/**
 * Le code d'un refus du greffon (`aucun_disque`, `lecture_toc`…), ou `null`
 * pour une panne sans code (réseau, route démontée).
 */
export function codeRefusCd(e: unknown): string | null {
  const code = (e as ApiError | null)?.code;
  return typeof code === 'string' && code ? code : null;
}

/** Intervalle normal de relecture de `/etat` tant que l'écran est ouvert. */
export const RELECTURE_CD_MS = 4000;
/** Plafond après des échecs répétés : on ralentit, on ne martèle pas. */
export const RELECTURE_CD_MAX_MS = 30000;

/** Délai avant la prochaine relecture : doublé à chaque échec, borné. */
export function delaiRelectureCd(echecsConsecutifs: number): number {
  if (echecsConsecutifs <= 0) return RELECTURE_CD_MS;
  return Math.min(RELECTURE_CD_MAX_MS, RELECTURE_CD_MS * 2 ** echecsConsecutifs);
}
