/**
 * web#2706 — l'écran « Correction de pièce » parle au greffon serveur
 * `plugins/tune-calibration` (tune-server-rust, lot rc11). Le greffon
 * s'appelle `calibration` ; l'hôte monte ses routes sous
 * `/api/v1/ext/calibration` (`routes/mod.rs` : `/ext/{plugin_name}`).
 *
 *   POST /simulations                         modes de basse sans micro (201)
 *   POST /simulations/{id}/correction         proposition prudente, rien d'écrit
 *   POST /simulations/{id}/correction/profil  la même, enregistrée comme profil
 *                                             de pièce de la zone (201)
 *   GET  /microphones                         entrées audio et étalonnages
 *   POST /microphones/etalonnages             déposer un étalonnage (201)
 *   POST /zones/{zone}/mesures                lancer une mesure (202)
 *   GET  /mesures, /mesures/{id}              avancement
 *   DELETE /mesures/{id}                      annuler
 *   GET  /mesures/{id}/resultat               réponse et RT60 (409 avant la fin)
 *   POST /mesures/{id}/correction[/profil]    comme pour une simulation
 *   POST /niveaux, GET|DELETE /niveaux/{id}   test de niveau du micro (rc14)
 *
 * « Appliquer » est un SECOND geste côté serveur : le profil de pièce
 * enregistré par `…/correction/profil` ne touche pas au son ; c'est
 * `POST /room-correction/profiles/{zone}/apply` qui écrit l'égaliseur de la
 * zone (profil `EqProfile` complet depuis tune-server-rust#7642) et le rend
 * audible. L'écran enchaîne les deux.
 *
 * Tout le greffon est Premium : sans licence, chaque route répond 402
 * `premium_required`.
 */
import { writable } from 'svelte/store';
import * as api from './api';

export const ID_GREFFON_CALIBRATION = 'calibration';
export const RACINE_CALIBRATION = `${api.BASE}/ext/${ID_GREFFON_CALIBRATION}`;

/** La zone visée par le menu de zone : celle dont on corrige la pièce. */
export const zoneCorrectionPiece = writable<{ id: number; name: string } | null>(null);

// ─── Pièce et surfaces (modes.rs) ──────────────────────────────────────────

export type Qualite = 'reflechissante' | 'amortie' | 'traitee';
export const QUALITES: readonly Qualite[] = ['reflechissante', 'amortie', 'traitee'];

export type Surface = 'avant' | 'arriere' | 'gauche' | 'droite' | 'sol' | 'plafond';
export const SURFACES: readonly Surface[] = ['avant', 'arriere', 'gauche', 'droite', 'sol', 'plafond'];

export const LIBELLES_SURFACES: Record<Surface, string> = {
  avant: 'v2.room.surfFront',
  arriere: 'v2.room.surfBack',
  gauche: 'v2.room.surfLeft',
  droite: 'v2.room.surfRight',
  sol: 'v2.room.surfFloor',
  plafond: 'v2.room.surfCeiling',
};

export const LIBELLES_QUALITES: Record<Qualite, string> = {
  reflechissante: 'v2.room.qualReflective',
  amortie: 'v2.room.qualDamped',
  traitee: 'v2.room.qualTreated',
};

/** Les bornes de `modes::valider` : un refus du serveur sinon. */
export const BORNES_PIECE = {
  cote: { min: 1.5, max: 20 },
  hauteur: { min: 1.5, max: 10 },
} as const;

export interface Piece { longueur_m: number; largeur_m: number; hauteur_m: number }
export interface Position { x: number; y: number; z: number }
export type Surfaces = Record<Surface, Qualite>;

export interface EntreeSimulation {
  piece: Piece;
  surfaces: Surfaces;
  auditeur: Position;
  enceintes: Position[];
  zone_id?: number;
}

export const PIECE_DEFAUT: Piece = { longueur_m: 5, largeur_m: 4, hauteur_m: 2.5 };
export const SURFACES_DEFAUT: Surfaces = {
  avant: 'amortie', arriere: 'amortie', gauche: 'amortie', droite: 'amortie', sol: 'amortie', plafond: 'amortie',
};

/** La dimension hors bornes, ou `null` si la pièce est acceptable. */
export function coteHorsBornes(p: Piece): keyof Piece | null {
  const ok = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
  if (!ok(p.longueur_m, BORNES_PIECE.cote.min, BORNES_PIECE.cote.max)) return 'longueur_m';
  if (!ok(p.largeur_m, BORNES_PIECE.cote.min, BORNES_PIECE.cote.max)) return 'largeur_m';
  if (!ok(p.hauteur_m, BORNES_PIECE.hauteur.min, BORNES_PIECE.hauteur.max)) return 'hauteur_m';
  return null;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/**
 * Le placement type d'une écoute stéréo, déduit des seules dimensions : x
 * part du mur avant (celui des enceintes), y du mur gauche, z du sol — le
 * repère de `modes.rs`. Enceintes à 20 % de la longueur (1 m au plus), au
 * quart et aux trois quarts de la largeur ; place d'écoute à 62 % de la
 * longueur (la règle des 38 % depuis le mur arrière), au milieu.
 */
export function placementType(p: Piece): { auditeur: Position; enceintes: Position[] } {
  const xe = arrondi(Math.min(1, p.longueur_m * 0.2));
  const ze = arrondi(Math.min(0.9, p.hauteur_m * 0.4));
  return {
    auditeur: { x: arrondi(p.longueur_m * 0.62), y: arrondi(p.largeur_m / 2), z: arrondi(Math.min(1.1, p.hauteur_m * 0.45)) },
    enceintes: [
      { x: xe, y: arrondi(p.largeur_m * 0.25), z: ze },
      { x: xe, y: arrondi(p.largeur_m * 0.75), z: ze },
    ],
  };
}

/** Les positions de l'auditeur et des enceintes (repère de `modes.rs`). */
export interface Placement { auditeur: Position; enceintes: Position[] }

/** `modes.rs` : 1 à 4 enceintes (`ENCEINTES_MAX`), sinon `400 simulation_invalide`. */
export const ENCEINTES_MIN = 1;
export const ENCEINTES_MAX = 4;

/** La cote de la pièce qui borne chaque axe : x ↔ longueur, y ↔ largeur, z ↔ hauteur. */
export const COTE_DE_L_AXE: Record<keyof Position, keyof Piece> = { x: 'longueur_m', y: 'largeur_m', z: 'hauteur_m' };
export const AXES: readonly (keyof Position)[] = ['x', 'y', 'z'];

/**
 * web#2803 — la première position qui sort de la pièce, ou `null`. Le
 * serveur la refuserait (`400 simulation_invalide`, « … hors de la pièce ») :
 * l'écran la signale avant d'envoyer. `qui` vaut `-1` pour l'auditeur, sinon
 * l'indice de l'enceinte.
 */
export function positionHorsPiece(pl: Placement, p: Piece): { qui: number; axe: keyof Position } | null {
  const dedans = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  const liste: [number, Position][] = [[-1, pl.auditeur], ...pl.enceintes.map((e, i) => [i, e] as [number, Position])];
  for (const [qui, pos] of liste) {
    for (const axe of AXES) {
      if (!dedans(Number(pos[axe]), Number(p[COTE_DE_L_AXE[axe]]))) return { qui, axe };
    }
  }
  return null;
}

/** Une enceinte de plus : au mur avant, au milieu de la largeur, à la hauteur des autres. */
export function enceinteAjoutee(p: Piece, existantes: readonly Position[]): Position {
  const type = placementType(p).enceintes[0];
  return { x: type.x, y: arrondi(p.largeur_m / 2), z: existantes[0]?.z ?? type.z };
}

/**
 * Le corps de `POST /simulations`. Sans placement saisi, la disposition type
 * déduite des dimensions (`placementType`) ; avec, les positions saisies
 * (web#2803, serveur tune-server-rust#8332).
 */
export function entreeSimulation(p: Piece, s: Surfaces, zoneId: number | null, placement?: Placement | null): EntreeSimulation {
  const piece = { longueur_m: Number(p.longueur_m), largeur_m: Number(p.largeur_m), hauteur_m: Number(p.hauteur_m) };
  const pos = (q: Position): Position => ({ x: Number(q.x), y: Number(q.y), z: Number(q.z) });
  const pl = placement
    ? { auditeur: pos(placement.auditeur), enceintes: placement.enceintes.map(pos) }
    : placementType(piece);
  const e: EntreeSimulation = { piece, surfaces: { ...s }, ...pl };
  if (zoneId != null) e.zone_id = zoneId;
  return e;
}

// ─── Réponses du greffon ───────────────────────────────────────────────────

export type TypeMode = 'axial' | 'tangentiel' | 'oblique';
export const LIBELLES_TYPES_MODE: Record<TypeMode, string> = {
  axial: 'v2.room.modeAxial',
  tangentiel: 'v2.room.modeTangential',
  oblique: 'v2.room.modeOblique',
};

export interface ModeSimule {
  frequence_hz: number;
  type: TypeMode;
  indices: [number, number, number];
  q: number;
  t60_s: number;
  couplage: number;
}

export interface Courbe { freqs_hz: number[]; db: number[] }

/** Les bornes d'une demande de correction sur une estimation (`BornesEstimation`). */
export interface BornesEstimation { bandes_defaut: number; coupe_defaut_db: number; bandes_max: number; coupe_max_db: number }

export interface Simulation {
  id: string;
  estimation: boolean;
  volume_m3: number;
  rt60_sabine_s: number;
  f_schroeder_hz: number;
  modes: ModeSimule[];
  reponse: Courbe;
  avertissements: string[];
  /**
   * tune-server-rust#8332 — les bornes prudentes et celles du mode expert.
   * L'écran les LIT, il ne les recopie pas. Absent sur un serveur plus
   * ancien : le mode expert n'est alors pas proposé.
   */
  bornes_correction?: { prudentes: BornesEstimation; expert: BornesEstimation };
}

export interface Bande { freq: number; gain: number; q: number; type: 'peak' | 'low_shelf' | 'high_shelf' }

export interface Proposition {
  id: string;
  zone_id: number | null;
  estimation?: boolean;
  bandes: Bande[];
  zone_hz: [number, number];
  pic_avant_db: number;
  pic_apres_db: number;
  courbes: { freqs_hz: number[]; mesure_db: number[]; cible_db: number[]; corrigee_db: number[] };
  avertissements: string[];
  /** Vrai quand la proposition a été faite en mode expert (#8332). */
  expert?: boolean;
}

export interface ProfilEnregistre { id: string; zone_id: number; appliquer: string; estimation: boolean }
export interface Application { applied: boolean; zone_id: string; filter_count?: number; applied_live?: boolean; reason?: string }

export type TypeCible = 'plate' | 'harman';
export const CIBLES: readonly TypeCible[] = ['plate', 'harman'];
export const LIBELLES_CIBLES: Record<TypeCible, string> = {
  plate: 'v2.room.targetFlat',
  harman: 'v2.room.targetHarman',
};
/**
 * Le mode expert d'une estimation sans micro (tune-server-rust#8332) : le
 * nombre de coupes et la coupe maximale, jusqu'aux bornes d'une mesure.
 * `null` : mode prudent, les bornes restent celles du serveur.
 */
export interface ReglageExpert { bandes_max: number; coupe_max_db: number }

/** Le réglage expert initial : les DÉFAUTS que le serveur annonce. */
export const expertParDefaut = (b: BornesEstimation): ReglageExpert =>
  ({ bandes_max: b.bandes_defaut, coupe_max_db: b.coupe_defaut_db });

/**
 * La plus petite coupe maximale acceptée, en dB. Le serveur refuse une coupe
 * nulle ou négative (`coupe <= 0.0` dans `demande_prudente`, tune-calibration
 * `modes.rs`, et dans `correction.rs`) : 0 donnait un 422 déroutant. 0,5 dB
 * est le pas du champ, la première valeur strictement positive qu'il propose.
 */
export const COUPE_MIN_DB = 0.5;

/** Le réglage ramené dans les bornes du serveur (1 … bandes_max, COUPE_MIN_DB … coupe_max_db). */
export function expertBorne(r: ReglageExpert, b: BornesEstimation): ReglageExpert {
  const borne = (v: number, min: number, max: number, defaut: number) =>
    (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : defaut);
  return {
    bandes_max: Math.round(borne(Number(r.bandes_max), 1, b.bandes_max, b.bandes_defaut)),
    coupe_max_db: borne(Number(r.coupe_max_db), COUPE_MIN_DB, b.coupe_max_db, b.coupe_defaut_db),
  };
}

export interface DemandeCorrection {
  cible: { type: TypeCible };
  bandes_max?: number;
  coupe_max_db?: number;
  expert?: true;
}

/**
 * Le corps `DemandeCorrection`. Sans réglage expert : la cible seulement, les
 * bornes restent celles du serveur. Avec : `expert: true` et les deux bornes.
 */
export function demandeCorrection(cible: TypeCible, expert?: ReglageExpert | null): DemandeCorrection {
  if (!expert) return { cible: { type: cible } };
  return { cible: { type: cible }, bandes_max: expert.bandes_max, coupe_max_db: expert.coupe_max_db, expert: true };
}

/** Les modes qui se montrent : les plus graves, ceux qui font les bosses. */
export function modesAffiches(modes: readonly ModeSimule[] | null | undefined, max = 12): ModeSimule[] {
  return [...(modes ?? [])].sort((a, b) => a.frequence_hz - b.frequence_hz).slice(0, max);
}
/**
 * Le couplage d'un mode ramené à une enceinte : `couplage` = Σ ψ(enceinte)·ψ(auditeur)
 * va de −N à +N pour N enceintes (tune-server-rust#8332).
 */
export const couplageRelatif = (m: ModeSimule, nEnceintes = 1) => Math.abs(m.couplage) / Math.max(1, nEnceintes);

/**
 * web#2803 — où tombe la place d'écoute pour ce mode : sur un NŒUD (< 0,2, peu
 * entendu, le greffon ne le corrige pas), sur un VENTRE (≥ 0,5), ou entre les deux.
 */
export type PositionMode = 'noeud' | 'entre' | 'ventre';
export function positionDuMode(m: ModeSimule, nEnceintes = 1): PositionMode {
  const c = couplageRelatif(m, nEnceintes);
  if (c < 0.2) return 'noeud';
  if (c >= 0.5) return 'ventre';
  return 'entre';
}
export const LIBELLES_POSITIONS_MODE: Record<PositionMode, string> = {
  noeud: 'v2.room.modeNode',
  entre: 'v2.room.modePartial',
  ventre: 'v2.room.modeStrong',
};

/** Un mode que la place d'écoute entend nettement (couplage relatif ≥ 0,5). */
export const modeFort = (m: ModeSimule, nEnceintes = 1) => positionDuMode(m, nEnceintes) === 'ventre';

// ─── Appels ────────────────────────────────────────────────────────────────

const json = (corps: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corps) });
// `sansBandeau` : l'écran porte lui-même l'échec et sa cause.
const appel = <T>(chemin: string, init?: RequestInit) =>
  api.fetchJSON<T>(`${RACINE_CALIBRATION}${chemin}`, init, undefined, true);

export const simuler = (e: EntreeSimulation) => appel<Simulation>('/simulations', json(e));
export const proposerSimulation = (id: string, cible: TypeCible, expert?: ReglageExpert | null) =>
  appel<Proposition>(`/simulations/${encodeURIComponent(id)}/correction`, json(demandeCorrection(cible, expert)));
export const enregistrerProfilSimulation = (id: string, cible: TypeCible, zoneId: number, expert?: ReglageExpert | null) =>
  appel<ProfilEnregistre>(`/simulations/${encodeURIComponent(id)}/correction/profil`,
    json({ ...demandeCorrection(cible, expert), zone_id: zoneId }));

export const appliquerProfilZone = (zoneId: number) =>
  api.fetchJSON<Application>(`${api.BASE}/room-correction/profiles/${zoneId}/apply`, { method: 'POST' }, undefined, true);

export interface EntreeMicro {
  nom: string;
  id: string;
  canaux: number;
  frequence_courante: number | null;
  virtuelle: boolean;
  mesurable: boolean;
  /** tune-server-rust#9070 — type d'accès ALSA (`hw`, `plughw`, `dsnoop`…) ; absent hors ALSA. */
  acces?: string | null;
}
export interface Microphones { pile: string; frequence_requise: number; entrees: EntreeMicro[]; etalonnages: string[] }

export const lireMicrophones = () => appel<Microphones>('/microphones');
export const deposerEtalonnage = (nom: string, texte: string) =>
  appel<{ nom: string; points: number }>('/microphones/etalonnages', json({ nom, texte }));

export interface DemandeMesure { entree: string; voie_micro?: number; etalonnage?: string | null }
export const lancerMesure = (zoneId: number, d: DemandeMesure) =>
  appel<{ id: string; zone_id: number }>(`/zones/${zoneId}/mesures`, json(d));

export type EtatMesure = 'preparation' | 'salve' | 'balayage' | 'analyse' | 'terminee' | 'refusee' | 'annulee' | 'erreur';
export interface Avancement {
  id: string;
  zone_id: number;
  entree: string;
  etat: EtatMesure;
  motif?: string;
  message?: string;
  /** tune-server-rust#9070 — code stable d'une erreur que l'écran traduit (`micro_muet`). */
  code?: string;
  /** tune-server-rust#9070 — identifiant exact du micro ouvert (`alsa:hw:CARD=…`). */
  peripherique?: string;
  progression: number;
  avertissements: string[];
}
export const ETATS_FINAUX: ReadonlySet<EtatMesure> = new Set(['terminee', 'refusee', 'annulee', 'erreur']);
export const LIBELLES_ETATS: Record<EtatMesure, string> = {
  preparation: 'v2.room.stPreparing',
  salve: 'v2.room.stBurst',
  balayage: 'v2.room.stSweep',
  analyse: 'v2.room.stAnalysis',
  terminee: 'v2.room.stDone',
  refusee: 'v2.room.stRefused',
  annulee: 'v2.room.stCancelled',
  erreur: 'v2.room.stError',
};

/** Le pas du suivi d'une mesure (réglable sous test). */
export const SUIVI = { intervalleMs: 1000 };

export const lireMesures = () => appel<{ mesures: Avancement[] }>('/mesures');
export const lireAvancement = (id: string) => appel<Avancement>(`/mesures/${encodeURIComponent(id)}`);
export const annulerMesure = (id: string) => appel<unknown>(`/mesures/${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface Rt60Bande { centre_hz: number; edt_s: number | null; t20_s: number | null; t30_s: number | null }
export interface ResultatMesure { id: string; reponse: Courbe & { lissage?: string }; rt60: Rt60Bande[]; avertissements: string[] }
export const lireResultat = (id: string) => appel<ResultatMesure>(`/mesures/${encodeURIComponent(id)}/resultat`);
export const proposerMesure = (id: string, cible: TypeCible) =>
  appel<Proposition>(`/mesures/${encodeURIComponent(id)}/correction`, json(demandeCorrection(cible)));
export const enregistrerProfilMesure = (id: string, cible: TypeCible) =>
  appel<ProfilEnregistre>(`/mesures/${encodeURIComponent(id)}/correction/profil`, json(demandeCorrection(cible)));

// ─── Test de niveau du micro (rc14, tune-server-rust#9529) ─────────────────
/*
 *   POST   /niveaux       { mode: 'signal' | 'ecoute', entree, voie_micro, zone_id } → 202 { id, alerte_asio }
 *   GET    /niveaux/{id}  vumètre en direct, bruit de fond, verdict
 *   DELETE /niveaux/{id}  arrêter
 *
 * « Écouter le micro » ouvre l'entrée sans rien jouer (arrêt seul en 30 s au
 * plus) ; « Tester le niveau » capte une seconde de bruit de fond puis joue
 * un bruit rose court sur la zone, et rend un verdict.
 */
export type ModeNiveau = 'signal' | 'ecoute';
export type EtatNiveau = 'preparation' | 'bruit_de_fond' | 'signal' | 'ecoute' | 'terminee' | 'annulee' | 'erreur';
export interface Niveaux { crete_dbfs: number; rms_dbfs: number }
export interface Vumetre extends Niveaux { crete_max_dbfs: number }
/** `faible` : faible mais mesurable (tune-server-rust#9529, relecture m7). */
export type Jugement = 'trop_faible' | 'faible' | 'bon' | 'trop_fort';
export type MotifNiveau = 'saturation' | 'trop_fort_spl' | 'trop_fort' | 'entree_muette' | 'signal_absent' | 'rsb_faible' | 'bon';
export interface PlageNiveau {
  crete_max_dbfs: number; rsb_min_db: number; rsb_conseille_db: number;
  rsb_absent_db?: number; spl_max_db?: number;
}
export interface VerdictNiveau {
  jugement: Jugement;
  motif: MotifNiveau;
  signal: Niveaux;
  bruit: Niveaux;
  rsb_db: number;
  /** Pression de crête au micro, avec un étalonnage seulement. */
  spl_db?: number | null;
  /** Le serveur a coupé le signal pendant sa montée (saturation, SPL). */
  coupe?: boolean;
  plage: PlageNiveau;
  message: string;
}
export interface AvancementNiveau {
  id: string;
  mode: ModeNiveau;
  zone_id: number | null;
  entree: string;
  etat: EtatNiveau;
  message?: string;
  code?: string;
  peripherique?: string;
  depuis_s: number;
  duree_prevue_s: number;
  vumetre: Vumetre | null;
  bruit: Niveaux | null;
  verdict: VerdictNiveau | null;
  /** La zone sort en ASIO : l'entrée Windows de la même interface peut rester muette. */
  alerte_asio?: boolean;
  avertissements: string[];
}
export interface DemandeNiveau {
  mode: ModeNiveau; entree: string; voie_micro: number; zone_id: number | null;
  /** Avec lui, le serveur plafonne la pression au micro (90 dB SPL), comme pour la mesure. */
  etalonnage?: string | null;
}

export const ETATS_FINAUX_NIVEAU: ReadonlySet<EtatNiveau> = new Set(['terminee', 'annulee', 'erreur']);
/** Le pas du vumètre (réglable sous test) : entre 100 et 200 ms. */
export const SUIVI_NIVEAU = { intervalleMs: 150 };
/** Lectures du suivi en échec d'affilée tolérées avant d'arrêter le test (relecture m-w2). */
export const ECHECS_SUIVI_NIVEAU = 3;
export const LIBELLES_ETATS_NIVEAU: Record<EtatNiveau, string> = {
  preparation: 'v2.room.lvlStPreparing',
  bruit_de_fond: 'v2.room.lvlStNoise',
  signal: 'v2.room.lvlStSignal',
  ecoute: 'v2.room.lvlStListen',
  terminee: 'v2.room.lvlStDone',
  annulee: 'v2.room.lvlStCancelled',
  erreur: 'v2.room.lvlStError',
};
export const LIBELLES_MOTIFS_NIVEAU: Record<MotifNiveau, string> = {
  saturation: 'v2.room.lvlSaturation',
  trop_fort_spl: 'v2.room.lvlTooLoudSpl',
  trop_fort: 'v2.room.lvlTooLoud',
  entree_muette: 'v2.room.lvlInputMuted',
  signal_absent: 'v2.room.lvlNoSignal',
  rsb_faible: 'v2.room.lvlWeak',
  bon: 'v2.room.lvlGood',
};

export const lancerTestNiveau = (d: DemandeNiveau) =>
  appel<{ id: string; mode: ModeNiveau; zone_id: number | null; alerte_asio?: boolean }>('/niveaux', json(d));
export const lireTestNiveau = (id: string) => appel<AvancementNiveau>(`/niveaux/${encodeURIComponent(id)}`);
export const arreterTestNiveau = (id: string) => appel<unknown>(`/niveaux/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Un niveau en dBFS, à une décimale (le signe moins typographique). */
export const dbfs = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('-', '−');

/** L'unité, la même dans toutes les langues. */
export const UNITE_DBFS = 'dBFS';

/** L'échelle du vumètre : de −60 dBFS (vide) à 0 dBFS (plein), en fraction. */
export const PLANCHER_VUMETRE_DBFS = -60;
export const fractionVumetre = (db: number | null | undefined): number =>
  db == null || !Number.isFinite(db) ? 0 : Math.min(1, Math.max(0, 1 - db / PLANCHER_VUMETRE_DBFS));

/** Le verdict dans la langue de l'écran ; un motif inconnu garde la phrase du serveur. */
export function texteVerdict(v: VerdictNiveau, t: (k: string) => string): string {
  const cle = LIBELLES_MOTIFS_NIVEAU[v.motif];
  if (!cle) return v.message;
  return t(cle)
    .replaceAll('{crete}', dbfs(v.signal.crete_dbfs))
    .replaceAll('{rsb}', String(Math.round(v.rsb_db)))
    .replaceAll('{min}', String(v.plage.rsb_min_db))
    .replaceAll('{conseille}', String(v.plage.rsb_conseille_db))
    .replaceAll('{max}', dbfs(v.plage.crete_max_dbfs))
    .replaceAll('{splmax}', String(v.plage.spl_max_db ?? 90))
    .replaceAll('{spl}', v.spl_db == null ? '–' : String(Math.round(v.spl_db)));
}

/** Les valeurs mesurées et la plage conseillée, sous le verdict. */
export function valeursVerdict(v: VerdictNiveau, t: (k: string) => string): string {
  return t('v2.room.lvlValues')
    .replaceAll('{crete}', dbfs(v.signal.crete_dbfs))
    .replaceAll('{rms}', dbfs(v.signal.rms_dbfs))
    .replaceAll('{bruit}', dbfs(v.bruit.rms_dbfs))
    .replaceAll('{max}', dbfs(v.plage.crete_max_dbfs))
    .replaceAll('{conseille}', String(v.plage.rsb_conseille_db));
}

/** Le temps de réverbération d'une bande : T30, à défaut T20, à défaut EDT. */
export const rt60De = (b: Rt60Bande): number | null => b.t30_s ?? b.t20_s ?? b.edt_s ?? null;

/** La mesure encore en cours sur cette zone (écran rouvert pendant une mesure). */
export function mesureEnCours(liste: readonly Avancement[] | null | undefined, zoneId: number): Avancement | null {
  return (liste ?? []).find((m) => m.zone_id === zoneId && !ETATS_FINAUX.has(m.etat)) ?? null;
}

/**
 * #8490 — l'avertissement de fréquence sous le choix du micro, ou rien.
 *
 * - `{hz}` paraît DEUX fois dans `v2.room.micRate` : `replace` n'en remplaçait
 *   que la première (« réglez-le à {hz} Hz » chez Xavier Joly, 11/11) ;
 * - `frequence_courante` absente veut dire que le serveur n'a pas pu LIRE le
 *   format du micro (UMIK-1 en S24_3LE, #8489), pas qu'il capte à une autre
 *   fréquence : on le dit tel quel au lieu de « ne capte pas à 48000 Hz ».
 */
export function avertissementFrequenceMicro(
  micro: EntreeMicro | null | undefined,
  requise: number,
  tr: (cle: string) => string,
): string | null {
  if (!micro || micro.mesurable) return null;
  if (micro.frequence_courante == null) return tr('v2.room.micFormatUnknown');
  return tr('v2.room.micRate').replaceAll('{hz}', String(requise));
}

/**
 * tune-server-rust#9070 — le nom d'un micro dans la liste, suivi de son type
 * d'accès ALSA quand le serveur le donne : plusieurs PCM d'une même carte
 * portent le même nom.
 */
export const libelleMicro = (m: Pick<EntreeMicro, 'nom' | 'acces'> & { id?: string }): string =>
  // Seulement pour un accès lié à une carte (`alsa:hw:CARD=…`) : pour
  // `alsa:default` ou `alsa:pipewire`, le type répéterait le nom
  // (« Default ALSA Device (default) »).
  m.acces && (m.id === undefined || /^alsa:[^:]+:/.test(m.id)) ? `${m.nom} (${m.acces})` : m.nom;

/**
 * tune-server-rust#9070 — l'entrée matérielle d'un PCM ALSA
 * (`alsa:dsnoop:CARD=U18dB,DEV=0` → `hw:CARD=U18dB,DEV=0`) ; `null` hors ALSA
 * ou sans carte. Même règle que le serveur (`entree_materielle_alsa`).
 */
export function entreeMaterielleAlsa(peripherique: string | null | undefined): string | null {
  const m = /^alsa:[^:]+:(.*)$/.exec(peripherique ?? '');
  if (!m) return null;
  const p = Object.fromEntries(m[1].split(',').map((kv) => kv.split('=') as [string, string]));
  return p.CARD ? `hw:CARD=${p.CARD},DEV=${p.DEV ?? '0'}` : null;
}

/**
 * tune-server-rust#9070 — la cause d'une mesure refusée ou en erreur. Un code
 * connu se traduit, sinon le texte du greffon, tel quel :
 * - `micro_muet` (le micro ouvert ne rend aucune trame) : le conseil dépend
 *   du PCM ouvert, comme le message du serveur (`SansTrame`) — ALSA hors
 *   `hw:` → choisir l'entrée matérielle ; déjà `hw:` → rapport de
 *   diagnostic ; hors ALSA → vérifier le branchement ;
 * - `micro_fige` (#9066, le micro cesse de capter pendant la mesure).
 */
export function causeMesure(
  m: Pick<Avancement, 'motif' | 'message' | 'code' | 'peripherique'> & { entree?: string },
  t: (k: string) => string,
): string | null {
  const p = m.peripherique ?? '?';
  if (m.code === 'micro_muet') {
    const hw = entreeMaterielleAlsa(m.peripherique);
    if (hw && !p.startsWith('alsa:hw:')) {
      return t('v2.room.errMicSilentChooseHw').replace('{peripherique}', p).replace('{hw}', hw);
    }
    if (hw) return t('v2.room.errMicSilentReport').replace('{peripherique}', p);
    return t('v2.room.errMicSilent').replace('{peripherique}', p);
  }
  if (m.code === 'micro_fige') {
    return t('v2.room.errMicFrozen').replace('{micro}', m.peripherique ?? m.entree ?? '?');
  }
  return m.motif ?? m.message ?? null;
}

/** Les vrais micros : une entrée virtuelle (Loopback, BlackHole) ne capte pas la pièce. */
export const micros = (m: Microphones | null | undefined): EntreeMicro[] => (m?.entrees ?? []).filter((e) => !e.virtuelle);

// ─── Présence du greffon (GET /plugins) ────────────────────────────────────

/**
 * - `inconnu` : pas de réponse ;
 * - `absent` : serveur sans ce greffon ;
 * - `a_installer` : au catalogue, pas installé (cas de la .18 au 07/11) ;
 * - `a_redemarrer` : installé, pas encore chargé ;
 * - `actif`.
 */
export type PresenceCalibration = 'inconnu' | 'absent' | 'a_installer' | 'a_redemarrer' | 'actif';
export function presenceCalibration(liste: unknown): PresenceCalibration {
  if (!Array.isArray(liste)) return 'inconnu';
  const f = liste.find((p) => p && (p as { name?: unknown }).name === ID_GREFFON_CALIBRATION) as
    { installed?: unknown; enabled?: unknown; loaded?: unknown } | undefined;
  if (!f) return 'absent';
  if (f.installed !== true) return 'a_installer';
  if (f.enabled === false || f.loaded === false) return 'a_redemarrer';
  return 'actif';
}

/**
 * web#2719 — le greffon `equalizer`. « Appliquer » écrit l'égaliseur de la zone,
 * mais la chaîne audio n'applique ce profil que si le greffon est installé ET
 * activé (serveur : `premium_plugins::enabled("equalizer")`). Sinon la
 * correction est enregistrée et on n'entend rien.
 *
 * - `inconnu` : liste illisible (ne bloque pas, la route répondra) ;
 * - `a_installer` : absent de la liste ou pas installé ;
 * - `desactive` : installé, désactivé ;
 * - `a_redemarrer` : installé, pas encore chargé ;
 * - `actif`.
 */
export const ID_GREFFON_EGALISEUR = 'equalizer';
export type PresenceEgaliseur = 'inconnu' | 'a_installer' | 'desactive' | 'a_redemarrer' | 'actif';
export function presenceEgaliseur(liste: unknown): PresenceEgaliseur {
  if (!Array.isArray(liste)) return 'inconnu';
  const f = liste.find((p) => p && (p as { name?: unknown }).name === ID_GREFFON_EGALISEUR) as
    { installed?: unknown; enabled?: unknown; loaded?: unknown } | undefined;
  if (!f || f.installed !== true) return 'a_installer';
  if (f.enabled !== true) return 'desactive';
  if (f.loaded === false) return 'a_redemarrer';
  return 'actif';
}
/** L'égaliseur manque (la correction serait enregistrée sans s'entendre). */
export const egaliseurManque = (p: PresenceEgaliseur): boolean => p !== 'actif' && p !== 'inconnu';

// ─── Erreurs : leur cause, telle que le serveur l'écrit ────────────────────

export interface ErreurCalibration { premium: boolean; code: string | null; cause: string | null; status: number | null }

/**
 * Le refus d'une route, avec sa CAUSE : le `message` du greffon (« longueur
 * de la pièce 30 m : entre 1.5 et 20 m »), à défaut le texte de l'erreur.
 */
export function lireErreur(e: unknown): ErreurCalibration {
  const x = (e ?? {}) as { status?: number; code?: string; message?: string; corps?: { message?: unknown; error?: unknown } };
  const status = typeof x.status === 'number' ? x.status : null;
  const premium = status === 402 || x.code === 'premium_required';
  const msg = typeof x.corps?.message === 'string' && x.corps.message.trim() ? x.corps.message.trim() : null;
  const code = typeof x.corps?.error === 'string' ? x.corps.error : (x.code ?? null);
  return { premium, code, cause: msg ?? (typeof x.message === 'string' && x.message ? x.message : null), status };
}

// ─── Tracé des courbes (abscisse logarithmique) ────────────────────────────

export const TRACE = { largeur: 560, hauteur: 220, gauche: 38, droite: 10, haut: 10, bas: 26 } as const;

export interface Serie { cle: 'mesure' | 'cible' | 'corrigee'; freqs: number[]; db: number[] }

const GRADUATIONS_F = [20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000];

export function libelleFrequence(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}

/** Les polylignes SVG des séries, sur une grille commune. */
export function tracerCourbes(series: readonly Serie[]) {
  const T = TRACE;
  const fs = series.flatMap((s) => s.freqs).filter((f) => f > 0 && Number.isFinite(f));
  const ds = series.flatMap((s) => s.db).filter((d) => Number.isFinite(d));
  const fMin = fs.length ? Math.min(...fs) : 20;
  const fMax = fs.length ? Math.max(...fs) : 300;
  const dMin = Math.floor((ds.length ? Math.min(...ds) : -10) / 5) * 5 - 5;
  const dMax = Math.ceil((ds.length ? Math.max(...ds) : 10) / 5) * 5 + 5;
  const l0 = Math.log10(fMin);
  const l1 = Math.log10(fMax === fMin ? fMin * 2 : fMax);
  const x = (f: number) => T.gauche + ((Math.log10(f) - l0) / (l1 - l0)) * (T.largeur - T.gauche - T.droite);
  const y = (d: number) => T.haut + ((dMax - d) / (dMax - dMin)) * (T.hauteur - T.haut - T.bas);
  const pas = dMax - dMin > 40 ? 10 : 5;
  const graduationsY: number[] = [];
  for (let v = dMin; v <= dMax; v += pas) graduationsY.push(v);
  return {
    x, y,
    graduationsX: GRADUATIONS_F.filter((f) => f >= fMin && f <= fMax),
    graduationsY,
    traits: series.map((s) => ({
      cle: s.cle,
      points: s.freqs
        .map((f, i) => [f, s.db[i]] as const)
        .filter(([f, d]) => f > 0 && Number.isFinite(f) && Number.isFinite(d))
        .map(([f, d]) => `${x(f).toFixed(1)},${y(d).toFixed(1)}`)
        .join(' '),
    })),
  };
}

// ─── Mesure à plusieurs positions (C4, lot TESS T10a) ──────────────────────

/*
 * tune-server-rust, `plugins/tune-calibration/src/routes.rs` et `session.rs`
 * (lot `batch/tess-20261118`, commit c1965ced6) :
 *
 *   POST /zones/{zone}/sessions        { positions: 3..9, centrale, … } → 201 Vue
 *                                      400 session_invalide
 *   GET  /sessions                     { sessions: Vue[] }
 *   GET  /sessions/{id}                Vue (positions, etats, moyenne dès 3
 *                                      positions dont la centrale) ; 404 session_inconnue
 *   POST /sessions/{id}/positions      corps de /zones/{z}/mesures + index,
 *                                      etiquette → 202 { session, position, id, zone_id }
 *                                      409 mesure_en_cours / session_sans_zone,
 *                                      422 mesure_refusee
 *   GET  /sessions/{id}/export         document v2 (Session)
 *   POST /sessions/import              document v1 ou v2 → 201 Vue + version_lue ;
 *                                      409 unsupported_version, 400 session_invalide
 *   POST /sessions/{id}/correction     Proposition sur la moyenne ; 422 correction_refusee
 *   POST /sessions/{id}/correction/profil   201 ProfilEnregistre ; 400 zone_requise
 *   POST /comparaisons                 { avant, apres, cible? } → ComparaisonAB ;
 *                                      404 inconnue, 422 comparaison_refusee
 *
 * L'avancement et l'annulation d'une position sont ceux d'une mesure
 * ordinaire : `GET /mesures/{id}` et `DELETE /mesures/{id}`, avec l'`id`
 * rendu par `POST /sessions/{id}/positions`.
 *
 * Un serveur rc13 ou plus ancien ne connaît pas ces routes : `GET /sessions`
 * y répond 404, et l'écran garde sa mesure à une seule position.
 */

/** `tune_calibration::positions::{POSITIONS_MIN, POSITIONS_MAX}`. */
export const POSITIONS_MIN = 3;
export const POSITIONS_MAX = 9;
export const POSITIONS_DEFAUT = 5;
/** La position centrale (la place d'écoute) : la première mesurée. */
export const POSITION_CENTRALE = 0;

/** `VerdictPosition` : ce qu'il advient d'une position dans la moyenne. */
export interface VerdictPosition {
  index: number;
  poids: number;
  ecart_median_db: number;
  decalage_niveau_db: number;
  rejetee: boolean;
  /** Le texte du greffon, en français : l'écran en traduit le sens (`causeRejet`). */
  motif?: string;
}

/** `Resultat` d'une position (le même que `GET /mesures/{id}/resultat`). */
export interface ResultatPosition {
  niveau_joue_dbfs: number;
  reponse: Courbe & { lissage?: string };
  ri?: { rsb_db: number };
  avertissements: string[];
}
export interface PositionSession {
  index: number;
  etiquette?: string;
  mesure_id?: string;
  entree?: string;
  resultat?: ResultatPosition;
}
/** `EtatPosition` : l'état de la mesure de la position, aplati (`etat`, `motif`, `message`). */
export interface EtatPosition { index: number; mesure_id?: string; etat: EtatMesure; motif?: string; message?: string }

export interface MoyenneSession {
  positions_retenues: number;
  seuil_rejet_db: number;
  verdicts: VerdictPosition[];
  freqs_hz: number[];
  db: number[];
  avertissements: string[];
}

/** `session::Vue` : ce que rendent la création, la lecture et l'import. */
export interface VueSession {
  version: number;
  id: string;
  zone_id: number | null;
  positions_prevues: number;
  centrale: number;
  config?: { rejet?: { seuil_db?: number; niveau_db?: number } };
  positions: PositionSession[];
  etats: EtatPosition[];
  moyenne?: MoyenneSession;
  moyenne_indisponible?: string;
  /** Seulement à l'import. */
  version_lue?: number;
}

export interface Indicateurs {
  ecart_type_db: number;
  ecart_type_creux_db: number;
  creux_max_db: number;
  pic_max_db: number;
  ecart_cible_db?: number;
}
/** `positions::ComparaisonAB`. */
export interface Comparaison {
  bande_hz: [number, number];
  avant: Indicateurs;
  apres: Indicateurs;
  freqs_hz: number[];
  avant_db: number[];
  apres_db: number[];
  difference_db: number[];
  amelioree: boolean;
}

/**
 * La sonde de capacité, LÉGÈRE (M1) : `GET /sessions/{SONDE}`, un id qui
 * n'existe pas. Le greffon C4 répond `404 session_inconnue` ; un serveur rc13
 * ne connaît pas la route (404 sans ce code). `GET /sessions` rendrait les 32
 * sessions complètes (courbes comprises) à chaque ouverture : trop lourd sur
 * un Raspberry Pi. Aucune route plus légère n'existe côté serveur.
 */
export const SONDE_SESSIONS = 'sonde-capacite';
export function capaciteDepuisSonde(e: unknown): boolean {
  const x = lireErreur(e);
  return x.status === 404 && x.code === 'session_inconnue';
}
export const sonderSessions = (): Promise<boolean> =>
  appel<unknown>(`/sessions/${SONDE_SESSIONS}`).then(() => false, (e) => capaciteDepuisSonde(e));

/** `session::IMPORT_MAX_OCTETS` : 4 Mio, la limite du corps de `POST /sessions/import`. */
export const IMPORT_MAX_OCTETS = 4 * 1024 * 1024;
/** Relances du suivi d'une mesure après une panne passagère (réseau, 5xx). */
export const RELANCES_SUIVI = 4;
/** L'attente avant la relance n° `k` (1, 2, …) : croissante, bornée à 8 s. */
export const delaiRelance = (k: number, pas: number) => Math.min(8000, pas * 2 ** k);

/** La session qui porte cette mesure, s'il y en a une. */
export const sessionDeLaMesure = (liste: readonly VueSession[] | null | undefined, mesureId: string): VueSession | null =>
  (liste ?? []).find((s) => s.positions.some((p) => p.mesure_id === mesureId)) ?? null;

/** La capacité « plusieurs positions » : `GET /sessions` répond une liste. */
export function capaciteSessions(r: unknown): boolean {
  return Array.isArray((r as { sessions?: unknown } | null | undefined)?.sessions);
}

/** Le nombre de positions ramené dans 3 … 9 (5 par défaut). */
export function positionsBornees(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return POSITIONS_DEFAUT;
  return Math.min(POSITIONS_MAX, Math.max(POSITIONS_MIN, v));
}

/** La position mesurée (résultat recopié dans la session). */
export const positionMesuree = (s: VueSession, i: number): boolean =>
  s.positions.some((p) => p.index === i && p.resultat != null);

/** L'état de la mesure d'une position, ou `null` si elle n'a jamais été lancée. */
export const etatPosition = (s: VueSession, i: number): EtatPosition | null =>
  s.etats.find((e) => e.index === i) ?? null;

/** Le verdict de la moyenne pour une position, s'il y a une moyenne. */
export const verdictPosition = (s: VueSession, i: number): VerdictPosition | null =>
  s.moyenne?.verdicts.find((v) => v.index === i) ?? null;

/** La première position à mesurer (la règle du serveur : la première libre), ou `null`. */
export function prochainePosition(s: VueSession): number | null {
  for (let i = 0; i < s.positions_prevues; i++) {
    if (positionMesuree(s, i)) continue;
    const e = etatPosition(s, i);
    if (e && !ETATS_FINAUX.has(e.etat)) continue;
    return i;
  }
  return null;
}

/**
 * Pourquoi une position est écartée, dans l'ordre du serveur
 * (`positions::moyenne_positions`) : d'abord un NIVEAU décalé (au-delà de
 * `rejet.niveau_db`, 6 dB par défaut), sinon une FORME trop différente des
 * autres (écart à la médiane au-delà du seuil appliqué). Le `motif` du greffon
 * est en français : l'écran en traduit le sens à partir de ces nombres.
 */
export type CauseRejet = 'niveau' | 'forme';
export function causeRejet(v: VerdictPosition, s: VueSession): CauseRejet {
  const tolerance = s.config?.rejet?.niveau_db ?? 6;
  return Math.abs(v.decalage_niveau_db) > tolerance ? 'niveau' : 'forme';
}

/** Le nom du fichier d'export : zone et date, rien du serveur. */
export function nomExportSession(s: Pick<VueSession, 'id' | 'zone_id'>, quand = new Date()): string {
  const d = quand.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const id = s.id.replace(/[^A-Za-z0-9_-]/g, '');
  return `tune-mesure-pieces-${s.zone_id ?? 'x'}-${d}-${id}.json`;
}

/** Télécharger un document JSON (l'export d'une session). */
export function telechargerJson(nom: string, doc: unknown): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export const lireSessions = () => appel<{ sessions: VueSession[] }>('/sessions');
export const creerSession = (zoneId: number, positions: number) =>
  appel<VueSession>(`/zones/${zoneId}/sessions`, json({ positions, centrale: POSITION_CENTRALE }));
export const lireSession = (id: string) => appel<VueSession>(`/sessions/${encodeURIComponent(id)}`);
export const mesurerPosition = (id: string, d: DemandeMesure & { index: number }) =>
  appel<{ session: string; position: number; id: string; zone_id: number }>(`/sessions/${encodeURIComponent(id)}/positions`, json(d));
export const exporterSession = (id: string) => appel<unknown>(`/sessions/${encodeURIComponent(id)}/export`);
export const importerSession = (doc: unknown) => appel<VueSession>('/sessions/import', json(doc));
export const proposerSession = (id: string, cible: TypeCible) =>
  appel<Proposition>(`/sessions/${encodeURIComponent(id)}/correction`, json(demandeCorrection(cible)));
export const enregistrerProfilSession = (id: string, cible: TypeCible) =>
  appel<ProfilEnregistre>(`/sessions/${encodeURIComponent(id)}/correction/profil`, json(demandeCorrection(cible)));
export const comparer = (avant: string, apres: string, cible: TypeCible) =>
  appel<Comparaison>('/comparaisons', json({ avant, apres, cible: { type: cible } }));
