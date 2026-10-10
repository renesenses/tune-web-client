/**
 * Réaffectation des canaux — renesenses/tune-server-rust#6044.
 *
 * Une matrice N entrées × M sorties, gains en dB, pour envoyer chaque canal
 * d'un fichier multicanal là où il doit aller (d'abord les fichiers 4.0 vers
 * une installation stéréo, 5.1 ou 7.1). Réglage par zone, règle facultative
 * par album (#5279), qui prime.
 *
 * Le serveur valide, normalise et rend `effective` (gains linéaires après
 * normalisation, atténuation par sortie, recopie au bit près ou mélange) :
 * ce module ne recalcule rien de cela. Il porte les routes, la forme du
 * réglage et les gestes de la grille (redimensionner, lire une case).
 */
import { BASE, fetchJSON } from './api';

/** Une case de la grille : un gain en dB, ou `null` pour muet. */
export type GainDb = number | null;

export interface ReglageReaffectation {
  enabled: boolean;
  inputs: number;
  outputs: number;
  /** Une ligne par SORTIE, une colonne par ENTRÉE. */
  gains_db: GainDb[][];
  normalize: boolean;
  preset?: string | null;
}

export interface MatriceEffective {
  valid: boolean;
  identity?: boolean;
  bit_exact_copy?: boolean;
  linear_gains?: number[][];
  normalization_db?: number[];
  bit_perfect?: boolean;
  error?: string;
}

export interface EtatReaffectation {
  key: string;
  saved: boolean;
  settings: ReglageReaffectation;
  effective: MatriceEffective;
  input_names: string[] | null;
  output_names: string[] | null;
  zone_id?: number;
  album_id?: number;
  applied_live?: boolean;
}

export interface PrereglageReaffectation {
  id: string;
  label: string;
  settings: ReglageReaffectation;
  effective: MatriceEffective;
  input_names: string[] | null;
  output_names: string[] | null;
}

export interface CatalogueReaffectation {
  presets: PrereglageReaffectation[];
  limits: { max_channels: number; gain_min_db: number; gain_max_db: number };
}

const RACINE = () => `${BASE}/channel-remap`;

export function getPrereglagesReaffectation(): Promise<CatalogueReaffectation> {
  return fetchJSON<CatalogueReaffectation>(`${RACINE()}/presets`);
}

export function getReaffectationZone(zoneId: number): Promise<EtatReaffectation> {
  return fetchJSON<EtatReaffectation>(`${RACINE()}/zones/${zoneId}`);
}

export function setReaffectationZone(zoneId: number, reglage: ReglageReaffectation): Promise<EtatReaffectation> {
  return fetchJSON<EtatReaffectation>(`${RACINE()}/zones/${zoneId}`, {
    method: 'PUT',
    body: JSON.stringify(reglage),
  });
}

export function deleteReaffectationZone(zoneId: number): Promise<EtatReaffectation> {
  return fetchJSON<EtatReaffectation>(`${RACINE()}/zones/${zoneId}`, { method: 'DELETE' });
}

export function getReaffectationAlbum(albumId: number): Promise<EtatReaffectation> {
  return fetchJSON<EtatReaffectation>(`${RACINE()}/albums/${albumId}`);
}

export function setReaffectationAlbum(albumId: number, reglage: ReglageReaffectation): Promise<EtatReaffectation> {
  return fetchJSON<EtatReaffectation>(`${RACINE()}/albums/${albumId}`, {
    method: 'PUT',
    body: JSON.stringify(reglage),
  });
}

export function deleteReaffectationAlbum(albumId: number): Promise<EtatReaffectation> {
  return fetchJSON<EtatReaffectation>(`${RACINE()}/albums/${albumId}`, { method: 'DELETE' });
}

/** Les bornes que le serveur applique (`sdk/tune-plugin-channel-remap`). */
export const CANAUX_MAX = 32;
export const GAIN_MIN_DB = -60;
export const GAIN_MAX_DB = 12;

/** Les noms des canaux dans l'ordre que rend le décodeur de Tune (ordre par
 *  défaut FLAC / WAV), de 1 à 8 ; au-delà, l'écran numérote. Miroir de
 *  `NOMS_PAR_DEFAUT` côté serveur. */
const NOMS: string[][] = [
  ['M'],
  ['FL', 'FR'],
  ['FL', 'FR', 'FC'],
  ['FL', 'FR', 'BL', 'BR'],
  ['FL', 'FR', 'FC', 'BL', 'BR'],
  ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'],
  ['FL', 'FR', 'FC', 'LFE', 'BC', 'SL', 'SR'],
  ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'],
];

export function nomsDesCanaux(n: number): string[] {
  return NOMS[n - 1] ?? Array.from({ length: n }, (_, i) => String(i + 1));
}

/** La matrice identité de `n` canaux (armée). */
export function identite(n: number): ReglageReaffectation {
  return {
    enabled: true,
    inputs: n,
    outputs: n,
    gains_db: Array.from({ length: n }, (_, o) => Array.from({ length: n }, (_, i) => (i === o ? 0 : null))),
    normalize: true,
    preset: 'identity',
  };
}

/** Changer la taille de la grille en gardant les cases qui existent encore. */
export function redimensionner(r: ReglageReaffectation, inputs: number, outputs: number): ReglageReaffectation {
  const n = Math.min(Math.max(1, Math.trunc(inputs)), CANAUX_MAX);
  const m = Math.min(Math.max(1, Math.trunc(outputs)), CANAUX_MAX);
  return {
    ...r,
    inputs: n,
    outputs: m,
    gains_db: Array.from({ length: m }, (_, o) => Array.from({ length: n }, (_, i) => r.gains_db[o]?.[i] ?? null)),
    preset: null,
  };
}

/**
 * Lire une case saisie : vide (ou « − ») → muet ; un nombre (virgule
 * acceptée) dans [−60, +12] dB → ce gain ; sinon `undefined` (refusé, la
 * case garde sa valeur).
 */
export function lireGain(saisie: string): GainDb | undefined {
  const s = saisie.trim().replace(',', '.').replace('−', '-');
  if (s === '' || s === '-') return null;
  const v = Number(s);
  if (!Number.isFinite(v) || v < GAIN_MIN_DB || v > GAIN_MAX_DB) return undefined;
  return v;
}

/** Afficher une case : vide pour muet, un dB à deux décimales au plus. */
export function afficherGain(g: GainDb): string {
  if (g === null) return '';
  return String(Math.round(g * 100) / 100);
}

/** Poser une case, en rendant un NOUVEAU réglage (la grille est immuable). */
export function avecGain(r: ReglageReaffectation, sortie: number, entree: number, g: GainDb): ReglageReaffectation {
  return {
    ...r,
    gains_db: r.gains_db.map((ligne, o) => (o === sortie ? ligne.map((v, i) => (i === entree ? g : v)) : ligne)),
    preset: null,
  };
}

/** La forme est-elle celle que le serveur acceptera ? */
export function formeValide(r: ReglageReaffectation): boolean {
  return (
    r.inputs >= 1 && r.inputs <= CANAUX_MAX && r.outputs >= 1 && r.outputs <= CANAUX_MAX &&
    r.gains_db.length === r.outputs &&
    r.gains_db.every((l) => l.length === r.inputs && l.every((g) => g === null || (Number.isFinite(g) && g >= GAIN_MIN_DB && g <= GAIN_MAX_DB)))
  );
}

/** Les clés de traduction des préréglages connus (littérales, pour les gardes i18n). */
export const LIBELLES_PREREGLAGES: Record<string, string> = {
  quad_to_stereo: 'v2.cr.preset_quad_to_stereo',
  quad_to_5_1: 'v2.cr.preset_quad_to_5_1',
  quad_to_7_1: 'v2.cr.preset_quad_to_7_1',
  '5_1_to_stereo_itu': 'v2.cr.preset_5_1_to_stereo_itu',
  swap_lr: 'v2.cr.preset_swap_lr',
  mono: 'v2.cr.preset_mono',
  identity: 'v2.cr.preset_identity',
};
