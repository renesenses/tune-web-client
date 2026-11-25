/**
 * rc14 — le greffon TESS « Casque » (`equalizer-headphone`) tiré d'OPRA.
 *
 * C'est le SERVEUR qui cherche dans la base OPRA, lit la correction choisie
 * et calcule les bandes, le préampli automatique et la courbe
 * (`GET /tess/headphone/search`, `GET /tess/headphone/profile`). Le panneau
 * ne fabrique aucune bande : il pose les `settings` que l'aperçu du serveur
 * rend (référence OPRA comprise) et l'écran TESS les envoie avec la chaîne
 * par `PUT /zones/{id}/tess`, comme pour tout greffon.
 *
 * Fonctions PURES seulement (testées sans écran).
 */
import type { CasqueOpraApercu } from './api';

type Reglages = Record<string, unknown>;

/** La référence OPRA que le maillon garde (`settings.opra`). */
export interface ReferenceOpra {
  id: string;
  product_id: string;
  vendor: string;
  product: string;
  author: string;
  details: string;
  license: string;
  level: number;
  bands_digest: string;
}

/** La source et sa licence (attribution), si le serveur ne les a pas dites. */
export const SOURCE_OPRA = 'OPRA';
export const LICENCE_OPRA = 'CC BY-SA 4.0';

/** Le niveau d'effet : 0 à 100 %, par pas de 5. */
export const NIVEAU_MIN = 0;
export const NIVEAU_MAX = 100;
export const NIVEAU_PAS = 5;

/** La référence OPRA des réglages, ou `null` (aucune, ou illisible). */
export function referenceOpra(reglages: Reglages | null | undefined): ReferenceOpra | null {
  const r = reglages?.opra as Partial<ReferenceOpra> | undefined;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    product_id: typeof r.product_id === 'string' ? r.product_id : '',
    vendor: typeof r.vendor === 'string' ? r.vendor : '',
    product: typeof r.product === 'string' ? r.product : '',
    author: typeof r.author === 'string' ? r.author : '',
    details: typeof r.details === 'string' ? r.details : '',
    license: typeof r.license === 'string' ? r.license : '',
    level: bornerNiveau(typeof r.level === 'number' ? r.level : NIVEAU_MAX),
    bands_digest: typeof r.bands_digest === 'string' ? r.bands_digest : '',
  };
}

/** Des bandes sans référence OPRA : importées à la main ou venues d'ailleurs. */
export function aDesBandesLibres(reglages: Reglages | null | undefined): boolean {
  const b = reglages?.bands;
  return Array.isArray(b) && b.length > 0 && referenceOpra(reglages) === null;
}

export function bornerNiveau(n: number): number {
  if (!Number.isFinite(n)) return NIVEAU_MAX;
  return Math.min(NIVEAU_MAX, Math.max(NIVEAU_MIN, Math.round(n)));
}

/**
 * Les réglages à envoyer pour appliquer un aperçu : ceux du serveur
 * (bandes, référence, réserve) par-dessus les réglages actuels, dont un
 * champ inconnu de ce client survit (contrat § 0).
 */
export function reglagesDepuisApercu(actuels: Reglages | null | undefined, apercu: CasqueOpraApercu): Reglages {
  const r: Reglages = { ...(actuels ?? {}), ...apercu.settings };
  delete r.enabled;
  return r;
}

/** « Sennheiser HD650 ». */
export function nomDuCasque(vendor: string, name: string): string {
  const v = vendor.trim();
  const n = name.trim();
  if (!v) return n;
  // OPRA nomme parfois le modèle avec sa marque (« Sony WH-1000XM4 »).
  return n.toLowerCase().startsWith(v.toLowerCase()) ? n : `${v} ${n}`;
}

/** « oratory1990 · Harman Target ». */
export function libelleVariante(author: string, details: string): string {
  return [author.trim(), details.trim()].filter(Boolean).join(' · ');
}

/** « −7,2 dB » : signe moins typographique, une décimale. */
export function formatDb(db: number, langue = 'fr'): string {
  const v = Math.round(db * 10) / 10;
  const n = Math.abs(v).toLocaleString(langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${n} dB`;
}

/** La plage verticale de la courbe, en dB. */
export interface PlageCourbe { bas: number; haut: number }

/**
 * La plage verticale de la courbe, ASYMÉTRIQUE comme le reste de TESS
 * (`ParametricEq`) : au moins −6 / +6 dB, chaque bord suit la courbe par
 * paliers de 3 dB, sans dépasser les bornes du moteur (−30 / +20 dB).
 */
export function plageCourbe(gains: number[]): PlageCourbe {
  let lo = 0;
  let hi = 0;
  for (const g of gains) {
    if (!Number.isFinite(g)) continue;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  return {
    bas: Math.max(-30, Math.min(-6, Math.floor(lo / 3) * 3)),
    haut: Math.min(20, Math.max(6, Math.ceil(hi / 3) * 3)),
  };
}

/** L'ordonnée d'un gain dans un cadre de hauteur `h`. */
export function yDuGain(g: number, h: number, plage: PlageCourbe): number {
  const v = Math.max(plage.bas, Math.min(plage.haut, g));
  return ((plage.haut - v) / (plage.haut - plage.bas)) * h;
}

/**
 * Le tracé SVG de la courbe (`d` d'un `<path>`) dans un cadre `l × h` :
 * fréquence en échelle log (20 Hz à 20 kHz), gain linéaire de `plage.bas`
 * (en bas) à `plage.haut` (en haut).
 */
export function traceCourbe(hz: number[], db: number[], l: number, h: number, plage: PlageCourbe): string {
  const n = Math.min(hz.length, db.length);
  if (n < 2 || plage.haut <= plage.bas) return '';
  const lmin = Math.log10(20);
  const lmax = Math.log10(20000);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = hz[i];
    const g = db[i];
    if (!(f > 0) || !Number.isFinite(g)) continue;
    const x = ((Math.log10(f) - lmin) / (lmax - lmin)) * l;
    const y = yDuGain(g, h, plage);
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

/** La clé du message d'une erreur du serveur (OPRA injoignable, etc.). */
export function cleErreurOpra(err: unknown): string {
  const e = err as { status?: number; code?: string } | null;
  switch (e?.code) {
    case 'opra_unreachable': return 'tess.headphone.error.offline';
    case 'opra_profile_unknown': return 'tess.headphone.error.unknown';
    case 'opra_profile_unsupported': return 'tess.headphone.error.unsupported';
    case 'opra_database_unreadable': return 'tess.headphone.error.unreadable';
  }
  if (e?.status === 503) return 'tess.headphone.error.offline';
  // Un serveur sans la route (rc13) : le greffon n'y est pas encore.
  if (e?.status === 404 || e?.status === 405) return 'tess.headphone.error.notSupported';
  return 'tess.headphone.error.generic';
}
