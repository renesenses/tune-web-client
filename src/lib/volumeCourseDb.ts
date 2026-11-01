import { analyserDb } from './volumeDb';
import { confort, securite, type LimitesVolume } from './limitesVolume';

/**
 * tune-server-rust#7517 (fil 2554, alec_eiffel) — le curseur de volume et les
 * limites « confort » / « sécurité » en dB pour les sorties qui raisonnent en
 * dB (amplis, DAC, Devialet AIR).
 *
 * Le SERVEUR dit quelles sorties ont une course en dB : il publie
 * `device_volume_range` (`min_db`, `max_db`, `step_db`, …) et
 * `device_volume_db` sur la zone, et les limites en dB d'appareil
 * (`volume_limit_*_device_db`) — `null` pour une sortie sans course connue
 * (#6918, aujourd'hui la seule Devialet AIR). Le client ne devine aucune
 * plage : sans `device_volume_range`, le curseur reste en pour-cent.
 *
 * La course est LINÉAIRE en dB (`db = min + volume × (max − min)`, arrondi au
 * pas) : le curseur en dB est donc le même réglage que le curseur 0..1, avec
 * une autre graduation. Ce module ne convertit que cela ; l'envoi, les
 * limites et leur plafond restent ceux du reste du client, en fraction.
 */

export interface CourseDb {
  min_db: number;
  max_db: number;
  step_db: number;
}

export type ZoneAvecCourseDb = LimitesVolume & {
  device_volume_range?: Partial<CourseDb> | null;
  device_volume_db?: number | null;
  volume_limit_safety_device_db?: number | null;
  volume_limit_comfort_device_db?: number | null;
};

/** La course annoncée par la zone, ou null (sortie sans course en dB, serveur
 *  antérieur, valeurs incohérentes). */
export function courseDb(zone: ZoneAvecCourseDb | null | undefined): CourseDb | null {
  if (!zone || zone.output_type === 'browser') return null;
  const r = zone.device_volume_range;
  if (!r) return null;
  const { min_db, max_db, step_db } = r;
  if (![min_db, max_db, step_db].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  if ((min_db as number) >= (max_db as number) || (step_db as number) <= 0) return null;
  return { min_db: min_db as number, max_db: max_db as number, step_db: step_db as number };
}

/** Position du curseur (0..1) d'un niveau en dB, borné à la course. */
export function fractionDepuisDb(c: CourseDb, db: number): number {
  if (Number.isNaN(db)) return 0;
  return Math.max(0, Math.min(1, (db - c.min_db) / (c.max_db - c.min_db)));
}

/** Le niveau en dB d'une position du curseur, arrondi au pas de la course. */
export function dbDepuisFraction(c: CourseDb, fraction: number): number {
  const f = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const brut = c.min_db + f * (c.max_db - c.min_db);
  const arrondi = c.min_db + Math.round((brut - c.min_db) / c.step_db) * c.step_db;
  return Math.max(c.min_db, Math.min(c.max_db, Math.round(arrondi * 1000) / 1000));
}

/** « −42,5 dB » : un dixième de dB, signe moins typographique non utilisé
 *  (relisible par `analyserDb`). */
export function formaterDbAppareil(db: number): string {
  const arrondi = Number(db.toFixed(1));
  return `${(arrondi === 0 ? 0 : arrondi).toFixed(1)} dB`;
}

/** Les graduations : un trait tous les `espacement` dB ronds dans la course. */
export function graduations(c: CourseDb, espacement = 10): { db: number; pos: number }[] {
  const r: { db: number; pos: number }[] = [];
  for (let db = Math.ceil(c.min_db / espacement) * espacement; db <= c.max_db + 1e-9; db += espacement) {
    r.push({ db, pos: fractionDepuisDb(c, db) });
  }
  return r;
}

export interface ZonesDeLimites {
  /** Fin de la zone verte (position 0..1), ou null. */
  confort: number | null;
  /** Début de la zone rouge (position 0..1), ou null. */
  securite: number | null;
}

/** Les limites comme elles AGISSENT (le confort jamais au-dessus de la
 *  sécurité), en position du curseur. Les limites sont des gains ; sur une
 *  course linéaire en dB le gain est la position. */
export function zonesDeLimites(zone: LimitesVolume | null | undefined): ZonesDeLimites {
  return { confort: confort(zone), securite: securite(zone) };
}

const VERT = 'var(--tune-success, #3fb950)';
const ORANGE = 'var(--tune-warning, #d29922)';
const ROUGE = 'var(--tune-error, #f85149)';

/** Le fond du curseur : vert sous le confort, orange entre confort et
 *  sécurité, rouge au-delà de la sécurité. Sans aucune limite : `null` (le
 *  fond habituel). Sans sécurité, pas de rouge ; sans confort, pas de vert
 *  séparé (tout sous la sécurité est vert). */
export function fondDesZones(z: ZonesDeLimites): string | null {
  const { confort: c, securite: s } = z;
  if (c === null && s === null) return null;
  const pct = (x: number) => `${Math.round(x * 10000) / 100}%`;
  const arrets: string[] = [];
  const vertJusqua = c ?? s;
  arrets.push(`${VERT} 0%`, `${VERT} ${pct(vertJusqua as number)}`);
  if (c !== null && s !== null && c < s) {
    arrets.push(`${ORANGE} ${pct(c)}`, `${ORANGE} ${pct(s)}`);
  } else if (c !== null && s === null) {
    arrets.push(`${ORANGE} ${pct(c)}`, `${ORANGE} 100%`);
  }
  if (s !== null) arrets.push(`${ROUGE} ${pct(s)}`, `${ROUGE} 100%`);
  return `linear-gradient(to right, ${arrets.join(', ')})`;
}

export type SaisieLimiteDb = { fraction: number | null; db: number | null } | { refus: 'illisible' | 'hors-course' };

/** Une limite saisie en dB d'appareil. Vide = pas de limite. Hors de la
 *  course (ou positive, ou illisible) = refus, comme le serveur. */
export function limiteDepuisDb(texte: string, c: CourseDb): SaisieLimiteDb {
  if (texte.trim() === '') return { fraction: null, db: null };
  const lu = analyserDb(texte);
  if ('refus' in lu) return { refus: lu.refus === 'positif' ? 'hors-course' : 'illisible' };
  if (lu.db < c.min_db - 1e-9 || lu.db > c.max_db + 1e-9) return { refus: 'hors-course' };
  return { fraction: fractionDepuisDb(c, lu.db), db: lu.db };
}

/** Le texte d'une limite en dB d'appareil pour un champ ; vide si aucune. */
export function texteLimiteDb(db: number | null | undefined): string {
  return typeof db === 'number' && Number.isFinite(db) ? db.toFixed(1) : '';
}

/** Un confort au-dessus de la sécurité est refusé (les deux fractions). */
export function confortAuDessusDeLaSecurite(c: number | null, s: number | null): boolean {
  return c !== null && s !== null && c > s + 1e-9;
}
