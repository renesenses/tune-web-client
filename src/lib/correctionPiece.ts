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
