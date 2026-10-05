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
