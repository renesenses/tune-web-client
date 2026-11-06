/**
 * Crosstalk — le greffon audio natif PREMIUM (identifiant `crosstalk`),
 * traitement pour ENCEINTES, jamais au casque.
 *
 * Comme pour Crossfeed Pro, ce client n'en connaît QUE l'interface : les noms
 * des réglages, leurs bornes, leurs défauts et les libellés que le greffon
 * publie. Le traitement vit dans le greffon (dépôt privé), pas ici.
 *
 * Routes de l'hôte (génériques des greffons natifs tiers) :
 *   GET|PUT  /audio-plugins/crosstalk/zones/{zone}   réglage de la zone
 *   GET|POST /audio-plugins/crosstalk/profiles        profils nommés
 *   DELETE   /audio-plugins/crosstalk/profiles/{id}
 *
 * L'hôte ne publie pas le schéma : bornes et défauts sont recopiés ici depuis
 * le schéma de réglages déclaré par le greffon. Un réglage hors bornes est de
 * toute façon refusé par le greffon (400 `invalid_plugin_settings`).
 *
 * EXCLUSION (web#2580, tune-server-rust#7616) : crossfeed (casque) et
 * crosstalk (enceintes) ne se cumulent jamais sur une zone ; `crosstalk`
 * l'emporte. Tant que la route ne publie pas « la voie en service »
 * (tune-server-rust#7627), le client DÉDUIT l'état du réglage de zone de
 * `crosstalk` (`crosstalkTraite`).
 */
import type { Borne } from './crossfeedPro';

export const CROSSTALK_ID = 'crosstalk';

export interface ReglagesCrosstalk {
  enabled: boolean;
  separation_db: number;
  angle_deg: number;
  distance_m: number;
  band_low_hz: number;
  band_high_hz: number;
  gain_ceiling_db: number;
  /** Un champ inconnu (greffon plus récent) est gardé tel quel. */
  [autre: string]: unknown;
}

export type CurseurCrosstalk =
  | 'separation_db'
  | 'angle_deg'
  | 'distance_m'
  | 'band_low_hz'
  | 'band_high_hz'
  | 'gain_ceiling_db';

/** L'ordre d'affichage des six réglages. */
export const CURSEURS_CROSSTALK: readonly CurseurCrosstalk[] = [
  'separation_db',
  'angle_deg',
  'distance_m',
  'band_low_hz',
  'band_high_hz',
  'gain_ceiling_db',
];

/** Bornes du schéma de réglages du greffon ; le pas est un choix d'interface. */
export const BORNES_CROSSTALK: Record<CurseurCrosstalk, Borne> = {
  separation_db: { min: 1, max: 12, pas: 0.5 },
  angle_deg: { min: 25, max: 70, pas: 0.1 },
  distance_m: { min: 1, max: 4, pas: 0.05 },
  band_low_hz: { min: 150, max: 1000, pas: 10 },
  band_high_hz: { min: 2000, max: 10000, pas: 100 },
  gain_ceiling_db: { min: 3, max: 12, pas: 0.5 },
};

/** Défauts du schéma : éteint. */
export const DEFAUTS_CROSSTALK: ReglagesCrosstalk = {
  enabled: false,
  separation_db: 6,
  angle_deg: 30,
  distance_m: 2.5,
  band_low_hz: 250,
  band_high_hz: 5000,
  gain_ceiling_db: 6,
};

/** Le libellé et la note courte de chaque réglage (textes du greffon). */
export const LIBELLES_CROSSTALK: Record<CurseurCrosstalk, { cle: string; note: string; unite: string }> = {
  separation_db: { cle: 'v2.xtc.separation', note: 'v2.xtc.separationNote', unite: 'dB' },
  angle_deg: { cle: 'v2.xtc.angle', note: 'v2.xtc.geometryNote', unite: '°' },
  distance_m: { cle: 'v2.xtc.distance', note: 'v2.xtc.geometryNote', unite: 'm' },
  band_low_hz: { cle: 'v2.xtc.bandLow', note: 'v2.xtc.bandNote', unite: 'Hz' },
  band_high_hz: { cle: 'v2.xtc.bandHigh', note: 'v2.xtc.bandNote', unite: 'Hz' },
  gain_ceiling_db: { cle: 'v2.xtc.gainCeiling', note: 'v2.xtc.gainCeilingNote', unite: 'dB' },
};

/** La valeur affichée d'un réglage, avec son repère d'unité (jamais traduit). */
export function valeurCrosstalk(cle: CurseurCrosstalk, v: number): string {
  const { unite } = LIBELLES_CROSSTALK[cle];
  const chiffres = cle === 'band_low_hz' || cle === 'band_high_hz' ? 0 : cle === 'distance_m' ? 2 : 1;
  return `${v.toFixed(chiffres)}${unite === '°' ? '°' : ` ${unite}`}`;
}

/** Les profils LIVRÉS par le greffon et leur libellé traduit. */
export const PROFILS_LIVRES_CROSSTALK: Record<string, string> = {
  doux: 'v2.xtc.profileDoux',
  installation_thierry: 'v2.xtc.profileInstallationThierry',
  stereo_60: 'v2.xtc.profileStereo60',
  prudent: 'v2.xtc.profilePrudent',
};

/** Le libellé d'un profil : traduit pour un profil livré, son nom sinon. */
export function libelleProfilCrosstalk(p: { id: string; name: string }): { cle: string | null; nom: string } {
  return { cle: PROFILS_LIVRES_CROSSTALK[p.id] ?? null, nom: p.name };
}

function borner(v: number, b: Borne): number {
  return Math.min(b.max, Math.max(b.min, v));
}

/**
 * Ce que l'hôte a rendu (`settings`, `null` tant que la zone n'a rien
 * enregistré), complété par les défauts et borné. Un champ illisible retombe
 * sur son défaut ; un champ inconnu est gardé.
 */
export function reglagesCrosstalk(brut: unknown): ReglagesCrosstalk {
  const src = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  const r: ReglagesCrosstalk = { ...src, ...DEFAUTS_CROSSTALK };
  if (typeof src.enabled === 'boolean') r.enabled = src.enabled;
  for (const cle of CURSEURS_CROSSTALK) {
    const v = src[cle];
    if (typeof v === 'number' && Number.isFinite(v)) r[cle] = v;
    r[cle] = borner(r[cle], BORNES_CROSSTALK[cle]);
  }
  return r;
}

/** Le profil nommé qui correspond aux réglages, champ par champ. */
export function profilCrosstalkActif(
  r: ReglagesCrosstalk,
  profils: { id: string; settings: Record<string, unknown> }[],
): string | null {
  for (const p of profils) {
    const s = reglagesCrosstalk(p.settings);
    if (CURSEURS_CROSSTALK.every((c) => Math.abs(s[c] - r[c]) < 1e-4)) return p.id;
  }
  return null;
}

/**
 * Crosstalk TRAITE-t-il la zone ? Le greffon est actif (installé, activé,
 * chargé) ET sa case est cochée sur cette zone. Le crossfeed intégré et
 * Crossfeed Pro de la zone sont alors ÉCARTÉS (tune-server-rust#7616).
 */
export function crosstalkTraite(
  reponse: { active?: unknown; settings?: unknown } | null | undefined,
): boolean {
  if (!reponse || typeof reponse !== 'object' || reponse.active !== true) return false;
  const s = reponse.settings as { enabled?: unknown } | null | undefined;
  return !!s && typeof s === 'object' && s.enabled === true;
}

/* ── Courbe séparation / coloration ─────────────────────────────────────────
 * Le greffon la CALCULE pour la géométrie et la bande réglées ; l'hôte la
 * relaie (`POST /audio-plugins/crosstalk/diagnostics`, bloc `curve` des
 * diagnostics). Ce client ne fait que la lire et la dessiner : séparation en
 * abscisse (3 → 12 dB), coloration aux enceintes en ordonnée (latéral et
 * centre), le réglage en cours marqué dessus, en pointillé ce que le plafond
 * de gain ne permet pas.
 */

export interface PointCourbeCrosstalk {
  /** Séparation visée (le réglage `separation_db`). */
  cible: number;
  /** Séparation obtenue. */
  separation: number;
  /** Coloration maximale aux enceintes, son latéral (Side). */
  side: number;
  /** Coloration maximale aux enceintes, centre. */
  centre: number;
  /** Plafond de gain que ce point demande. */
  plafondNecessaire: number;
  /** Atteignable sous le plafond de gain de la zone. */
  atteignable: boolean;
}

export interface CourbeCrosstalk {
  points: PointCourbeCrosstalk[];
  /** Le réglage en cours ; `plafonne` s'il n'atteint pas la séparation visée. */
  courant: (Omit<PointCourbeCrosstalk, 'atteignable'> & { plafonne: boolean }) | null;
}

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function lirePoint(p: unknown): Omit<PointCourbeCrosstalk, 'atteignable'> | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (!fini(o.target_db) || !fini(o.separation_db) || !fini(o.side_max_db) || !fini(o.centre_max_db)) return null;
  return {
    cible: o.target_db,
    separation: o.separation_db,
    side: o.side_max_db,
    centre: o.centre_max_db,
    plafondNecessaire: fini(o.ceiling_needed_db) ? o.ceiling_needed_db : 0,
  };
}

/**
 * La courbe lue dans les diagnostics du greffon (`diagnostics.curve`), ou
 * `null` si elle manque ou ne se lit pas (greffon ou serveur plus ancien) :
 * l'écran n'affiche alors rien.
 */
export function courbeCrosstalk(diagnostics: unknown): CourbeCrosstalk | null {
  const curve = diagnostics && typeof diagnostics === 'object'
    ? (diagnostics as Record<string, unknown>).curve
    : null;
  if (!curve || typeof curve !== 'object') return null;
  const c = curve as Record<string, unknown>;
  if (!Array.isArray(c.points)) return null;
  const points: PointCourbeCrosstalk[] = [];
  for (const brut of c.points) {
    const p = lirePoint(brut);
    if (!p) continue;
    points.push({ ...p, atteignable: (brut as Record<string, unknown>).reachable !== false });
  }
  points.sort((a, b) => a.cible - b.cible);
  if (points.length < 2) return null;
  const courant = lirePoint(c.current);
  return {
    points,
    courant: courant
      ? { ...courant, plafonne: (c.current as Record<string, unknown>).capped === true }
      : null,
  };
}

/** Ce qui change la courbe : la géométrie, la bande, la séparation et le plafond. */
export function cleCourbeCrosstalk(r: ReglagesCrosstalk): string {
  return CURSEURS_CROSSTALK.map((c) => r[c]).join('|');
}

/** Les dimensions du tracé (unités du `viewBox`). */
export const TRACE_CROSSTALK = { largeur: 520, hauteur: 220, gauche: 40, droite: 12, haut: 12, bas: 34 } as const;

export interface TraceCourbeCrosstalk {
  x: (db: number) => number;
  y: (db: number) => number;
  /** Graduations de l'ordonnée (dB), de 0 au haut de l'axe. */
  graduationsY: number[];
  /** Graduations de l'abscisse (dB). */
  graduationsX: number[];
  /** Polylignes SVG : la courbe entière (pointillé) et sa partie atteignable (trait plein). */
  side: { entiere: string; atteignable: string };
  centre: { entiere: string; atteignable: string };
  /** Le point du réglage en cours, s'il est connu. */
  courant: { x: number; ySide: number; yCentre: number } | null;
}

/** Les coordonnées du tracé : séparation 1 → 12 dB, coloration de 0 au-dessus du maximum. */
export function traceCourbeCrosstalk(c: CourbeCrosstalk): TraceCourbeCrosstalk {
  const T = TRACE_CROSSTALK;
  const { min: xMin, max: xMax } = BORNES_CROSSTALK.separation_db;
  const plusHaut = Math.max(...c.points.map((p) => Math.max(p.side, p.centre)), c.courant ? Math.max(c.courant.side, c.courant.centre) : 0);
  const pasY = plusHaut > 8 ? 2 : 1;
  const yMax = Math.max(3, Math.ceil(plusHaut / pasY) * pasY);
  const yMin = Math.min(0, Math.floor(Math.min(...c.points.map((p) => Math.min(p.side, p.centre)))));
  const larg = T.largeur - T.gauche - T.droite;
  const haut = T.hauteur - T.haut - T.bas;
  const x = (v: number) => T.gauche + ((Math.min(xMax, Math.max(xMin, v)) - xMin) / (xMax - xMin)) * larg;
  const y = (v: number) => T.haut + (1 - (v - yMin) / (yMax - yMin)) * haut;
  const r = (v: number) => Math.round(v * 10) / 10;
  const ligne = (pts: PointCourbeCrosstalk[], f: (p: PointCourbeCrosstalk) => number) =>
    pts.map((p) => `${r(x(p.separation))},${r(y(f(p)))}`).join(' ');
  const atteignables = c.points.filter((p) => p.atteignable);
  const graduationsY: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += pasY) graduationsY.push(v);
  return {
    x, y, graduationsY,
    graduationsX: [1, 3, 6, 9, 12],
    side: { entiere: ligne(c.points, (p) => p.side), atteignable: ligne(atteignables, (p) => p.side) },
    centre: { entiere: ligne(c.points, (p) => p.centre), atteignable: ligne(atteignables, (p) => p.centre) },
    courant: c.courant
      ? { x: r(x(c.courant.separation)), ySide: r(y(c.courant.side)), yCentre: r(y(c.courant.centre)) }
      : null,
  };
}

/** Un décibel signé, une décimale : « +1.7 ». */
export function dbSigne(v: number): string {
  const s = (Math.round(v * 10) / 10).toFixed(1);
  return v >= 0 && !s.startsWith('-') ? `+${s}` : s.replace('-0.0', '0.0');
}

/* ── Réponse en fréquence aux enceintes ─────────────────────────────────────
 * Pour le réglage choisi, le gain envoyé aux enceintes, son latéral et
 * centre, de 20 Hz à 20 kHz : bloc `speaker_response` des diagnostics,
 * mesuré par le greffon. Ce client ne fait que le dessiner (échelle log),
 * bande traitée visible.
 */

export interface ReponseCrosstalk {
  hz: number[];
  side: number[];
  centre: number[];
  bandeBasse: number;
  bandeHaute: number;
  picSide: number;
  picSideHz: number;
  centreMin: number;
  centreMax: number;
}

/** La réponse lue dans les diagnostics, ou `null` si elle manque ou ne se lit pas. */
export function reponseCrosstalk(diagnostics: unknown): ReponseCrosstalk | null {
  const brut = diagnostics && typeof diagnostics === 'object'
    ? (diagnostics as Record<string, unknown>).speaker_response
    : null;
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) && v.every(fini) ? (v as number[]) : null);
  const hz = liste(o.hz), side = liste(o.side_db), centre = liste(o.centre_db);
  if (!hz || !side || !centre || hz.length < 2 || side.length !== hz.length || centre.length !== hz.length) return null;
  if (hz.some((f, i) => f <= 0 || (i > 0 && f <= hz[i - 1]))) return null;
  const n = (v: unknown, d: number) => (fini(v) ? v : d);
  let iPic = 0;
  side.forEach((v, i) => { if (v > side[iPic]) iPic = i; });
  return {
    hz, side, centre,
    bandeBasse: n(o.band_low_hz, BORNES_CROSSTALK.band_low_hz.min),
    bandeHaute: n(o.band_high_hz, BORNES_CROSSTALK.band_high_hz.max),
    picSide: n(o.side_peak_db, side[iPic]),
    picSideHz: n(o.side_peak_hz, hz[iPic]),
    centreMin: n(o.centre_min_db, Math.min(...centre)),
    centreMax: n(o.centre_max_db, Math.max(...centre)),
  };
}

export interface TraceReponseCrosstalk {
  x: (hz: number) => number;
  y: (db: number) => number;
  graduationsX: { hz: number; texte: string }[];
  graduationsY: number[];
  side: string;
  centre: string;
  /** La bande traitée, en abscisses. */
  bande: { x1: number; x2: number };
}

/** Les coordonnées du tracé : 20 Hz → 20 kHz en log, gain symétrique autour de 0 dB. */
export function traceReponseCrosstalk(rep: ReponseCrosstalk): TraceReponseCrosstalk {
  const T = TRACE_CROSSTALK;
  const [f0, f1] = [20, 20000];
  const plusFort = Math.max(1, ...rep.side.map(Math.abs), ...rep.centre.map(Math.abs));
  const pas = plusFort > 6 ? 2 : 1;
  const lim = Math.ceil(plusFort / pas) * pas;
  const larg = T.largeur - T.gauche - T.droite;
  const haut = T.hauteur - T.haut - T.bas;
  const x = (f: number) => T.gauche + (Math.log10(Math.min(f1, Math.max(f0, f)) / f0) / Math.log10(f1 / f0)) * larg;
  const y = (v: number) => T.haut + (1 - (v + lim) / (2 * lim)) * haut;
  const r = (v: number) => Math.round(v * 10) / 10;
  const ligne = (v: number[]) => rep.hz.map((f, i) => `${r(x(f))},${r(y(v[i]))}`).join(' ');
  const graduationsY: number[] = [];
  for (let v = -lim; v <= lim + 1e-9; v += pas) graduationsY.push(v);
  return {
    x, y, graduationsY,
    graduationsX: [20, 100, 1000, 10000, 20000].map((hz) => ({ hz, texte: hz >= 1000 ? `${hz / 1000}k` : String(hz) })),
    side: ligne(rep.side),
    centre: ligne(rep.centre),
    bande: { x1: r(x(rep.bandeBasse)), x2: r(x(rep.bandeHaute)) },
  };
}
