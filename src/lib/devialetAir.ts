import type { CourseDb } from './volumeCourseDb';
import { volumeAppareilObserve } from './volumeAppareilObserve';

/**
 * tune-server-rust#8920 — retours d'un testeur Devialet Expert (rc12) sur une
 * zone Devialet AIR. Le SERVEUR tient les règles (volume fixe et « plein volume
 * en PURE » refusés, 192 kHz au plus, DSD en DoP ou PCM, pas de ±1 dB borné
 * par la sécurité) ; ce module ne fait que les DIRE à l'écran.
 */

// Lecture tolérante : une zone de l'API, ou un objet de test partiel.
type ZoneAir = Record<string, any>;

/** La zone pilote-t-elle une sortie Devialet AIR ? */
export function estAir(zone: { output_type?: string | null } | null | undefined): boolean {
  return zone?.output_type === 'devialet_air';
}

/** La marque proposée d'office pour une zone Devialet AIR. */
export const MARQUE_DEVIALET = 'Devialet';

/** Les modèles Devialet Expert qui parlent AIR (même liste que le catalogue
 *  du serveur, `device_catalog.json`). */
export const MODELES_DEVIALET: readonly string[] = [
  'D-Premier', 'D110', 'D170', 'D240', 'D120', 'D200', 'D250', 'D400', 'D800', 'D900', 'D1000',
  'D140 Pro', 'D220 Pro', 'D250 Pro', 'D440 Pro', 'D1000 Pro',
  'Astra',
];

/** La marque affichée à l'ouverture de l'éditeur : celle de la zone, sinon
 *  celle détectée, sinon « Devialet » pour une zone Devialet AIR. */
export function marqueInitiale(zone: ZoneAir | null | undefined): string {
  return zone?.brand ?? zone?.detected_manufacturer ?? (estAir(zone) ? MARQUE_DEVIALET : '');
}

/** AIR transporte 192 kHz au plus (décimation au-delà de 96 kHz). */
export const FREQUENCE_MAX_AIR = 192_000;

/** Les cadences proposées : sur Devialet AIR, rien au-dessus de 192 kHz
 *  (`0` = automatique, toujours gardé). */
export function frequencesProposees<T>(zone: ZoneAir | null | undefined, liste: readonly T[], valeur: (x: T) => number): T[] {
  return estAir(zone) ? liste.filter((x) => valeur(x) <= FREQUENCE_MAX_AIR) : [...liste];
}

/** Les modes DSD proposés : DoP ou PCM seulement sur Devialet AIR. */
export function modesDsdProposes(zone: ZoneAir | null | undefined, modes: readonly string[]): string[] {
  return estAir(zone) ? modes.filter((m) => m === 'dop' || m === 'pcm') : [...modes];
}

/** Ni volume fixe, ni « plein volume en PURE » sur Devialet AIR. */
export function volumeFixePropose(zone: ZoneAir | null | undefined): boolean {
  return !estAir(zone);
}

/** Durée pendant laquelle un geste local prime sur le relevé de l'ampli. */
export const GRACE_DU_GESTE_MS = 2500;

/**
 * Le niveau AFFICHÉ, en dB d'ampli : celui que l'ampli rapporte (télécommande
 * comprise, même au-delà des limites de Tune) — il fait foi —, sinon la
 * consigne lue sur la course. Juste après un geste local, la consigne : le
 * relevé de l'ampli arrive après lui.
 */
export function dbAffiche(
  zone: ZoneAir | null | undefined,
  course: CourseDb,
  consigneDb: number,
  dernierGeste = 0,
  maintenant = Date.now(),
): number {
  const o = volumeAppareilObserve(zone);
  if (!o || maintenant - dernierGeste < GRACE_DU_GESTE_MS) return consigneDb;
  return o.volume_db;
}

/** La position du curseur (en dB, bornée à la course) pour un niveau affiché. */
export function dbDuCurseur(course: CourseDb, db: number): number {
  return Math.max(course.min_db, Math.min(course.max_db, db));
}

/** Le bouton +1 dB est-il en butée ? À la sécurité (en dB d'ampli) ou au haut
 *  de la course — y compris quand l'ampli, monté à la télécommande, est
 *  déjà au-dessus : un + n'y commanderait rien (le serveur non plus). */
export function plusEnButeeAir(zone: ZoneAir | null | undefined, course: CourseDb, db: number): boolean {
  const s = zone?.volume_limit_safety_device_db;
  const haut = typeof s === 'number' && Number.isFinite(s) ? Math.min(s, course.max_db) : course.max_db;
  return db >= haut - 1e-6;
}

/** Le bouton −1 dB est-il en butée (bas de la course) ? */
export function moinsEnButeeAir(course: CourseDb, db: number): boolean {
  return db <= course.min_db + 1e-6;
}
