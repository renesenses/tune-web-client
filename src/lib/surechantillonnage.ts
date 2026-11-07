/**
 * Suréchantillonnage — renesenses/tune-server-rust#7614.
 *
 * Le greffon PREMIUM de la sortie locale : un filtre polyphase porte la
 * cadence de la source vers la plus haute cadence que le DAC accepte, en
 * suivant sa famille (44,1 → 352,8 ; 48 → 384). Réglage par zone, désactivé
 * par défaut, contourné par PURE et par le DoP.
 *
 * Le serveur décide tout ce qui touche au son : les filtres que CETTE
 * machine tient en temps réel (test de la machine), la réserve de niveau de
 * chaque filtre (aucun écrêtage possible), la cadence ouverte. Ce module
 * porte les routes, la forme du réglage et les quelques décisions d'affichage
 * (quels filtres proposer, quel message de contrainte, quel libellé).
 *
 * Un changement de réglage ne s'applique qu'à la PISTE SUIVANTE : le serveur
 * le dit (`applies_at: "next_track"`), l'écran aussi.
 */
import { BASE, fetchJSON } from './api';

/** Les rapports proposés par l'étude (§ 7) ; `null` = maximum du DAC. */
export const RAPPORTS = [2, 4, 8, 16] as const;
export type Rapport = (typeof RAPPORTS)[number];

export interface ReglageSurechantillonnage {
  enabled: boolean;
  filter: string;
  max_rate_hz: number | null;
  max_ratio: Rapport | null;
}

export interface FiltreSurechantillonnage {
  id: string;
  minimum_phase: boolean;
  default: boolean;
  /** Réserve de niveau par rapport (`x2`, `x4`…), en dB, toujours ≤ 0. */
  headroom_db: Record<string, number>;
}

export interface MesureMachine {
  filter: string;
  from_hz: number;
  to_hz: number;
  realtime_factor: number;
  admitted: boolean;
}

export interface VerdictMachine {
  simd_path: string;
  margin: number;
  results: MesureMachine[];
  measured_at: number;
}

export interface CatalogueSurechantillonnage {
  premium: boolean;
  installed: boolean;
  machine_test: VerdictMachine | null;
  filters: FiltreSurechantillonnage[];
  ratios: number[];
  default_filter: string;
}

/** Pourquoi le réglage ne s'appliquerait pas (codes stables du serveur). */
export type Contrainte =
  | 'disabled'
  | 'premium_required'
  | 'plugin_not_installed'
  | 'pure'
  | 'machine_test_missing';

export interface EtatSurechantillonnage {
  zone_id: number;
  settings: ReglageSurechantillonnage;
  constraint: Contrainte | null;
  admitted_filters: string[] | null;
  applies_at: 'next_track';
}

const RACINE = () => `${BASE}/upsampler`;

export function getCatalogueSurechantillonnage(): Promise<CatalogueSurechantillonnage> {
  return fetchJSON<CatalogueSurechantillonnage>(`${RACINE()}/`);
}

export function getSurechantillonnageZone(zoneId: number): Promise<EtatSurechantillonnage> {
  return fetchJSON<EtatSurechantillonnage>(`${RACINE()}/zones/${zoneId}`);
}

export function setSurechantillonnageZone(
  zoneId: number,
  reglage: ReglageSurechantillonnage,
): Promise<EtatSurechantillonnage> {
  return fetchJSON<EtatSurechantillonnage>(`${RACINE()}/zones/${zoneId}`, {
    method: 'PUT',
    body: JSON.stringify(reglage),
  });
}

export function lancerLeTestDeLaMachine(): Promise<{ machine_test: VerdictMachine }> {
  return fetchJSON<{ machine_test: VerdictMachine }>(`${RACINE()}/machine-test`, { method: 'POST' });
}

/** Le réglage par défaut du serveur : désactivé, filtre polyvalent. */
export function reglageParDefaut(): ReglageSurechantillonnage {
  return { enabled: false, filter: 'polyvalent', max_rate_hz: null, max_ratio: null };
}

/**
 * Les filtres à proposer : ceux que la machine tient (le test la mesure),
 * plus le filtre déjà choisi pour qu'il ne disparaisse pas de la liste.
 * Sans verdict (`null`), tous : le premier enregistrement lance la mesure.
 */
export function filtresProposes(
  catalogue: FiltreSurechantillonnage[],
  admis: string[] | null,
  choisi: string,
): FiltreSurechantillonnage[] {
  if (admis == null) return catalogue;
  return catalogue.filter((f) => admis.includes(f.id) || f.id === choisi);
}

/** Un filtre que la machine ne tient pas ne s'appliquera pas. */
export function filtreNonAdmis(admis: string[] | null, choisi: string): boolean {
  return admis != null && !admis.includes(choisi);
}

/** La réserve affichée pour un filtre : la plus forte, en dB. */
export function reserveMaxDb(f: FiltreSurechantillonnage): number {
  const valeurs = Object.values(f.headroom_db);
  return valeurs.length ? Math.min(...valeurs) : 0;
}

/** « −1,23 dB », dans la langue de l'interface. */
export function libelleReserve(db: number, locale: string): string {
  const v = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(db);
  return `${v.replace('-', '−')} dB`;
}

/** Clef i18n du nom d'un filtre. */
export function cleFiltre(id: string): string {
  return `upsampling.filter.${id}`;
}

/** Clef i18n du message de contrainte, ou `null` quand rien ne bloque. */
export function cleContrainte(c: Contrainte | null): string | null {
  switch (c) {
    case 'premium_required': return 'upsampling.constraint.premium';
    case 'plugin_not_installed': return 'upsampling.constraint.notInstalled';
    case 'pure': return 'upsampling.constraint.pure';
    case 'machine_test_missing': return 'upsampling.constraint.machineTest';
    default: return null;
  }
}

/** Le verdict de la machine, résumé : filtres admis sur filtres mesurés. */
export function resumeMachine(v: VerdictMachine | null): { admis: number; total: number } | null {
  if (!v) return null;
  const filtres = new Set(v.results.map((r) => r.filter));
  const admis = new Set(v.results.filter((r) => r.admitted).map((r) => r.filter));
  return { admis: admis.size, total: filtres.size };
}
