/**
 * tune-server-rust#6709 (Tades, fil 2364) — « Modes de la pièce ».
 *
 * Le serveur calcule les ondes stationnaires et propose des filtres en cloche
 * (`POST /eq/room-modes`). L'écran les montre, l'auditeur les retouche, puis
 * ils partent par `setEq` comme une courbe paramétrique ordinaire.
 *
 * ZONE SENSIBLE (volume) : des ATTÉNUATIONS seulement. Le serveur le garantit ;
 * l'écran le garantit AUSSI, pour deux raisons : la saisie à la main, et un
 * serveur qui répondrait autre chose. Tout gain passe par `borneGain`, qui ne
 * rend jamais plus que −3 dB : un « +6 » tapé dans la case devient −3, pas +6.
 */
import type { EqBand, RoomModeFilter, RoomModesRequest } from './api';

/** Bornes de l'issue : −20 à −3 dB, Q de 4 à 20, 20 à 250 Hz, 5 à 10 filtres. */
export const GAIN_MIN_DB = -20;
export const GAIN_MAX_DB = -3;
export const Q_MIN = 4;
export const Q_MAX = 20;
export const FREQ_MIN_HZ = 20;
export const FREQ_MAX_HZ = 250;
export const FILTRES_MIN = 5;
export const FILTRES_MAX = 10;
export const FILTRES_DEFAUT = 8;

function borne(x: number, min: number, max: number, defaut: number): number {
  if (!Number.isFinite(x)) return defaut;
  return Math.min(max, Math.max(min, x));
}

/**
 * Un gain de filtre de mode : TOUJOURS entre −20 et −3 dB. Un nombre positif,
 * nul, non fini ou trop faible devient −3 (la plus petite atténuation) : on ne
 * devine pas qu'un « 6 » voulait dire « −6 », mais on ne pousse jamais.
 */
export function borneGain(g: number): number {
  return borne(g, GAIN_MIN_DB, GAIN_MAX_DB, GAIN_MAX_DB);
}

export function borneQ(q: number): number {
  return borne(q, Q_MIN, Q_MAX, Q_MIN);
}

export function borneFrequence(f: number): number {
  return borne(f, FREQ_MIN_HZ, FREQ_MAX_HZ, FREQ_MIN_HZ);
}

/** Un filtre tel que l'écran l'édite : la case « utiliser » en plus. */
export interface FiltreEdite {
  freq: number;
  gain: number;
  q: number;
  utiliser: boolean;
  modes: [number, number, number][];
}

export function filtresEditables(filtres: RoomModeFilter[]): FiltreEdite[] {
  return filtres.map((f) => ({
    freq: borneFrequence(f.freq),
    gain: borneGain(f.gain),
    q: borneQ(f.q),
    utiliser: true,
    modes: Array.isArray(f.modes) ? f.modes : [],
  }));
}

/**
 * Les bandes à envoyer par `setEq` : les filtres cochés, bornés une dernière
 * fois. C'est la SEULE sortie de l'écran vers le son.
 */
export function bandesAAppliquer(filtres: FiltreEdite[]): EqBand[] {
  return filtres
    .filter((f) => f.utiliser)
    .map((f) => ({
      freq: borneFrequence(f.freq),
      gain: borneGain(f.gain),
      q: borneQ(f.q),
      type: 'peak' as const,
    }));
}

/**
 * « 2,5 », « 2.5 », « 2,5 m » → 2,5. `null` pour une case vide ou illisible :
 * c'est le serveur qui juge des bornes, l'écran ne fait que lire.
 */
export function lireMetres(texte: string): number | null {
  const t = texte.trim().replace(/\s*m$/i, '').replace(',', '.');
  if (!t) return null;
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Ce que l'écran saisit, en texte. */
export interface SaisiePiece {
  longueur: string;
  largeur: string;
  hauteur: string;
  auditeur: string;
  enceintes: string;
  rt60: string;
  nombre: number;
}

export const SAISIE_VIDE: SaisiePiece = {
  longueur: '', largeur: '', hauteur: '', auditeur: '', enceintes: '', rt60: '', nombre: FILTRES_DEFAUT,
};

/**
 * Le corps de `POST /eq/room-modes`, ou le nom du premier champ illisible.
 * Le temps de réverbération est facultatif : vide, le serveur prend 0,4 s.
 */
export function corpsDeLaPiece(s: SaisiePiece): { corps: RoomModesRequest } | { illisible: keyof SaisiePiece } {
  const champs: [keyof SaisiePiece, string][] = [
    ['longueur', s.longueur], ['largeur', s.largeur], ['hauteur', s.hauteur],
    ['auditeur', s.auditeur], ['enceintes', s.enceintes],
  ];
  const v: Record<string, number> = {};
  for (const [nom, texte] of champs) {
    const x = lireMetres(texte);
    if (x === null) return { illisible: nom };
    v[nom] = x;
  }
  const corps: RoomModesRequest = {
    length_m: v.longueur,
    width_m: v.largeur,
    height_m: v.hauteur,
    listener_from_back_wall_m: v.auditeur,
    speaker_from_front_wall_m: v.enceintes,
    count: Math.round(borne(s.nombre, FILTRES_MIN, FILTRES_MAX, FILTRES_DEFAUT)),
  };
  if (s.rt60.trim()) {
    const rt = lireMetres(s.rt60);
    if (rt === null) return { illisible: 'rt60' };
    corps.rt60_s = rt;
  }
  return { corps };
}

/** Le champ de l'API → le champ de l'écran, pour nommer un refus. */
export const CHAMP_DE_L_API: Record<string, keyof SaisiePiece> = {
  length_m: 'longueur',
  width_m: 'largeur',
  height_m: 'hauteur',
  listener_from_back_wall_m: 'auditeur',
  speaker_from_front_wall_m: 'enceintes',
  rt60_s: 'rt60',
  count: 'nombre',
};

/** Mode `[1, 1, 0]` → « 1-1-0 ». */
export function indices(n: [number, number, number]): string {
  return n.join('-');
}
