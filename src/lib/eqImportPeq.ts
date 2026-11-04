/**
 * web#1647 — import d'un fichier PEQ dans l'Égaliseur (Levente Toth, fil 1974 :
 * « load predefined PEQ (txt) files, instead of setting 10-15 bands manually »).
 *
 * Le serveur sait le faire depuis v0.9.142 (`POST /eq/import/autoeq`,
 * tune-server-rust#1405) ; l'interface n'avait aucune porte d'entrée. Ce
 * module garde ce que l'écran en tire, hors du composant, pour être testé :
 *   - le NOM du préréglage, qu'AutoEq met dans le nom du fichier et pas dedans ;
 *   - le BILAN, dit à l'écran et non avalé : bandes retenues, lignes écartées,
 *     préampli du fichier non appliqué en plus de la réserve de Tune.
 */
import type { EqAutoEqImport } from './api';

/** Taille au-delà de laquelle on ne lit même pas le fichier : un profil
 *  ParametricEQ fait quelques centaines d'octets, le serveur refuse au-delà
 *  de sa propre borne. Lire un fichier de 2 Go dans l'onglet n'aide personne. */
export const TAILLE_MAX_FICHIER_PEQ = 64 * 1024;

/**
 * « Sennheiser HD 600 ParametricEQ.txt » → « Sennheiser HD 600 ».
 * Le suffixe ` ParametricEQ` est celui des exports AutoEq ; un autre nom garde
 * tout sauf l'extension. Jamais vide : `undefined` laisse le serveur nommer.
 */
export function nomDuFichierPeq(nomFichier: string): string | undefined {
  const sansChemin = nomFichier.split(/[\\/]/).pop() ?? '';
  const sansExtension = sansChemin.replace(/\.[^.]*$/, '');
  const nom = sansExtension.replace(/[\s_-]*ParametricEQ$/i, '').trim();
  return nom || undefined;
}

export interface BilanImportPeq {
  nom: string;
  bandes: number;
  /** « 3, 7 (PK) » : les lignes écartées, avec leur type quand le fichier le
   *  donne. Vide quand rien n'a été écarté. */
  lignesIgnorees: string;
  /** Le préampli demandé par le fichier, et la réserve réellement tenue par
   *  Tune. `null` quand le serveur ne les rend pas. */
  preampDb: number | null;
  reserveDb: number | null;
  /** Le fichier demande plus de marge que ses gains n'en justifient : le
   *  préréglage est importé mais n'est PAS activé d'office. */
  alerte: boolean;
}

export function bilanImportPeq(r: EqAutoEqImport): BilanImportPeq {
  const ignores = r.ignored_filters ?? [];
  const lignesIgnorees = ignores
    .map((f) => (f.filter_type ? `${f.line} (${f.filter_type})` : String(f.line)))
    .join(', ');
  return {
    nom: r.preset?.name ?? '',
    bandes: r.band_count ?? r.preset?.bands?.length ?? 0,
    lignesIgnorees,
    preampDb: typeof r.preamp_db === 'number' ? r.preamp_db : null,
    reserveDb: typeof r.reserved_headroom_db === 'number' ? r.reserved_headroom_db : null,
    alerte: r.preamp_covered_by_headroom === false || !!r.warning,
  };
}

/** Un nombre de dB lisible, à une décimale. */
export function db(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1);
}

/**
 * tune-server-rust#6385 — les refus NOMMÉS de l'import : le serveur rend un
 * `code` stable et l'endroit fautif (`line` pour un texte AutoEq ou Equalizer
 * APO, `band` pour un profil OPRA). L'écran les dit dans sa langue au lieu de
 * montrer la phrase française du serveur.
 */
export const CODES_ERREUR_IMPORT = [
  'unrecognized_line',
  'unknown_filter_type',
  'missing_field',
  'invalid_number',
  'value_out_of_range',
  'missing_on_off',
  'unsupported_channel',
  'per_channel_preamp',
  'no_active_filter',
  'too_many_bands',
  'profile_too_large',
  'invalid_json',
  'unsupported_eq_type',
  'unsupported_slope',
] as const;
export type CodeErreurImport = (typeof CODES_ERREUR_IMPORT)[number];

/** Les phrases traduites, résolues par l'écran avant l'attente. */
export interface TextesErreurImport {
  causes: Record<CodeErreurImport, string>;
  /** « Ligne {line} : {cause} » */
  aLaLigne: string;
  /** « Bande {band} : {cause} » */
  aLaBande: string;
}

/**
 * La phrase à montrer pour un refus de l'import, ou `null` si le refus n'est
 * pas un refus nommé (réseau, serveur ancien…) : l'appelant garde alors son
 * message générique.
 */
export function messageErreurImport(err: unknown, textes: TextesErreurImport): string | null {
  const e = err as { code?: string; corps?: unknown } | null;
  const code = e?.code as CodeErreurImport | undefined;
  if (!code || !(CODES_ERREUR_IMPORT as readonly string[]).includes(code)) return null;
  const corps = (e?.corps ?? {}) as Record<string, unknown>;
  const cause = textes.causes[code]
    .replace('{count}', String(corps.band_count ?? ''))
    .replace('{max}', String(corps.max_bands ?? ''));
  if (typeof corps.line === 'number') {
    return textes.aLaLigne.replace('{line}', String(corps.line)).replace('{cause}', cause);
  }
  if (typeof corps.band === 'number') {
    return textes.aLaBande.replace('{band}', String(corps.band)).replace('{cause}', cause);
  }
  return cause;
}

/** Une ligne de l'aperçu : ce que l'égaliseur recevra, bande par bande. */
export interface LigneApercu {
  type: string;
  freq: string;
  gain: string;
  q: string;
  /** 0 gauche, 1 droite, `null` les deux. */
  canal: number | null;
}

export function lignesApercu(bandes: { freq: number; gain: number; q?: number; type?: string; channel?: number | null }[]): LigneApercu[] {
  return bandes.map((b) => ({
    type: b.type ?? 'peak',
    freq: b.freq >= 1000 ? `${Math.round(b.freq * 10) / 10}` : `${Math.round(b.freq * 100) / 100}`,
    gain: db(b.gain),
    q: typeof b.q === 'number' ? (Math.round(b.q * 1000) / 1000).toString() : '—',
    canal: typeof b.channel === 'number' ? b.channel : null,
  }));
}
