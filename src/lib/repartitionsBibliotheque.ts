/**
 * LES RÉPARTITIONS DE LA BIBLIOTHÈQUE — web#2653, partie serveur
 * tune-server-rust#7849 (PR tune-server-rust#7874).
 *
 * `GET /library/stats` porte une clé ADDITIVE `distributions` :
 *
 * ```json
 * { "by_codec":       [{ "value": "flac", "tracks": 812 }, …, { "value": null, "tracks": 3 }],
 *   "by_sample_rate": [{ "value": 44100, "tracks": 700 }, …],
 *   "by_decade":      [{ "value": 1990, "tracks": 120 }, …],
 *   "by_credit_role": [{ "value": "composer", "tracks": 90, "people": 41 }, …] }
 * ```
 *
 * `value: null` est l'INCONNU, que le serveur range déjà en dernier. On le
 * remet en dernier quand même : l'écran ne doit pas dépendre d'un ordre qu'un
 * autre serveur pourrait ne pas tenir.
 *
 * Un serveur plus ancien n'envoie pas la clé, et une lecture qui échoue côté
 * serveur la rend `null` : dans les deux cas `lireRepartitions` rend `null`,
 * et l'écran dit « non disponible » au lieu de planter.
 *
 * Tout est PUR ici (aucun Svelte, aucun réseau) : les témoins le lisent en
 * Node.
 */

import { formatCanonique } from './typeDeFichier';

export type CleRepartition = 'by_codec' | 'by_sample_rate' | 'by_decade' | 'by_credit_role';

export const CLES_REPARTITION: CleRepartition[] = ['by_codec', 'by_sample_rate', 'by_decade', 'by_credit_role'];

/** Une entrée telle que le serveur l'envoie. */
export interface EntreeRepartition {
  value: string | number | null;
  tracks: number;
  /** `by_credit_role` seulement : personnes distinctes. */
  people?: number;
}

export type Repartitions = Record<CleRepartition, EntreeRepartition[]>;

/** Ce que la Bibliothèque sait filtrer depuis un autre écran. */
export type FiltreBibliotheque = { format: string } | { frequence: number };

/** Une barre prête à dessiner. */
export interface LigneRepartition {
  label: string;
  /** Inconnu : `value: null` côté serveur. */
  inconnu: boolean;
  tracks: number;
  /** Part des pistes de CETTE répartition, de 0 à 100. */
  pourcentage: number;
  /** Pourcentage écrit dans la langue de l'écran (« 12,5 % »). */
  pourcentageTexte: string;
  /** Nombre de pistes écrit dans la langue de l'écran. */
  tracksTexte: string;
  people?: number;
  peopleTexte?: string;
  /** Le filtre de la Bibliothèque qu'ouvre un clic, ou `null`. */
  filtre: FiltreBibliotheque | null;
}

function entier(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function liste(brut: unknown): EntreeRepartition[] {
  if (!Array.isArray(brut)) return [];
  const out: EntreeRepartition[] = [];
  for (const e of brut) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const v = o.value;
    const value = v === null || v === undefined || v === '' ? null : typeof v === 'number' || typeof v === 'string' ? v : null;
    const entree: EntreeRepartition = { value, tracks: entier(o.tracks) };
    if (o.people !== undefined && o.people !== null) entree.people = entier(o.people);
    out.push(entree);
  }
  // L'inconnu en dernier, l'ordre du serveur conservé pour le reste.
  return [...out.filter((e) => e.value !== null), ...out.filter((e) => e.value === null)];
}

/**
 * Recette 14/11 — le codec d'une case Format : la MÊME clé que le filtre de
 * la Bibliothèque (`formatCanonique`). « mpeg » rejoint « mp3 », « dsf »
 * rejoint « dsd », et un « mp4 » / « m4a » sans profondeur connue devient
 * « m4a » (codec non lu) — le serveur qui suit la règle a déjà rangé en
 * « alac » ceux qui en ont une.
 */
function codecDe(value: string): string {
  return (formatCanonique(value) ?? value).toLowerCase();
}

/** Les cases Format fusionnées par codec, de la plus fournie à la plus rare. */
function parCodec(entrees: EntreeRepartition[]): EntreeRepartition[] {
  const m = new Map<string, number>();
  const inconnues: EntreeRepartition[] = [];
  for (const e of entrees) {
    if (e.value === null) { inconnues.push(e); continue; }
    const c = codecDe(String(e.value));
    m.set(c, (m.get(c) ?? 0) + e.tracks);
  }
  const connues = [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, tracks]) => ({ value, tracks }));
  return [...connues, ...inconnues];
}

/**
 * Les répartitions d'une réponse de `/library/stats`, ou `null` quand le
 * serveur ne les sert pas (clé absente, `null`, ou d'une autre forme).
 */
export function lireRepartitions(stats: unknown): Repartitions | null {
  if (!stats || typeof stats !== 'object') return null;
  const d = (stats as Record<string, unknown>).distributions;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const o = d as Record<string, unknown>;
  return {
    by_codec: parCodec(liste(o.by_codec)),
    by_sample_rate: liste(o.by_sample_rate),
    by_decade: liste(o.by_decade),
    by_credit_role: liste(o.by_credit_role),
  };
}

function formatNombre(n: number, langue: string, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(langue, options).format(n);
  } catch {
    return String(n);
  }
}

/** Les fréquences DSD nommées comme le fait le reste du client. */
const DSD: Record<number, string> = {
  2822400: 'DSD64', 3072000: 'DSD64', 5644800: 'DSD128', 6144000: 'DSD128',
  11289600: 'DSD256', 12288000: 'DSD256', 22579200: 'DSD512', 24576000: 'DSD512',
};

/** Une fréquence en kHz, à la langue de l'écran (« 44,1 kHz »). */
export function libelleFrequence(hz: number, langue: string): string {
  const khz = formatNombre(hz / 1000, langue, { maximumFractionDigits: 1 });
  return DSD[hz] ? `${DSD[hz]} · ${khz} kHz` : `${khz} kHz`;
}

/** Une décennie (« 1990s », « 1990er »…), selon le gabarit traduit. */
export function libelleDecennie(annee: number, gabarit: string): string {
  return gabarit.replace('{decade}', String(annee));
}

export interface Traducteur {
  /** Le libellé de l'inconnu, traduit. */
  inconnu: string;
  /** Gabarit d'une décennie, `{decade}` remplacé par l'année (« Années {decade} »). */
  decennie: string;
  /** Le nom d'un rôle de crédit (`composer` → « Compositeur »). */
  role: (role: string) => string;
}

/** Le filtre de la Bibliothèque qu'ouvre une barre, quand il existe. */
export function filtreDe(cle: CleRepartition, value: string | number | null): FiltreBibliotheque | null {
  if (value === null) return null;
  switch (cle) {
    case 'by_codec': {
      // La Bibliothèque compare le CODEC de l'album (`formatCanonique`), en
      // MAJUSCULES : la barre « MP3 » ouvre aussi les albums « MPEG ».
      const f = codecDe(String(value).trim()).toUpperCase();
      return f ? { format: f } : null;
    }
    case 'by_sample_rate': {
      const hz = Number(value);
      return Number.isFinite(hz) && hz > 0 ? { frequence: hz } : null;
    }
    // Pas de filtre par DÉCENNIE dans la Bibliothèque : le filtre Année ne
    // prend qu'une année. Une barre de décennie n'est donc pas cliquable,
    // comme le demande l'issue (« quand un filtre existe déjà »).
    case 'by_decade':
    case 'by_credit_role':
      return null;
  }
}

/** Les barres d'une répartition, pourcentages et libellés compris. */
export function lignesRepartition(
  cle: CleRepartition,
  entrees: EntreeRepartition[],
  langue: string,
  tr: Traducteur,
): LigneRepartition[] {
  const total = entrees.reduce((s, e) => s + e.tracks, 0);
  return entrees.map((e) => {
    const inconnu = e.value === null;
    let label: string;
    if (inconnu) label = tr.inconnu;
    else if (cle === 'by_codec') label = String(e.value).toUpperCase();
    else if (cle === 'by_sample_rate') label = libelleFrequence(Number(e.value), langue);
    else if (cle === 'by_decade') label = libelleDecennie(Number(e.value), tr.decennie);
    else label = tr.role(String(e.value));
    const pourcentage = total > 0 ? (e.tracks / total) * 100 : 0;
    const ligne: LigneRepartition = {
      label,
      inconnu,
      tracks: e.tracks,
      pourcentage,
      pourcentageTexte: formatNombre(pourcentage / 100, langue, { style: 'percent', maximumFractionDigits: 1 }),
      tracksTexte: formatNombre(e.tracks, langue),
      filtre: filtreDe(cle, e.value),
    };
    if (e.people !== undefined) {
      ligne.people = e.people;
      ligne.peopleTexte = formatNombre(e.people, langue);
    }
    return ligne;
  });
}
