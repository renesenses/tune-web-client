/**
 * tune-server-rust#5593 — le périmètre des analyses de fond (ReplayGain,
 * plage dynamique, empreintes, analyse acoustique), étape 1 du chantier.
 *
 * - `background_analysis_excluded_roots` : les DOSSIERS exclus. Le serveur
 *   compare chaque entrée comme un préfixe de chemin borné par le séparateur,
 *   les deux séparateurs (`\` et `/`) confondus : une racine de bibliothèque
 *   ou n'importe quel sous-dossier. Les cases de la liste des dossiers
 *   écrivent les racines ; le champ « Dossiers exclus » écrit les
 *   sous-dossiers, dans la MÊME liste.
 * - `background_analysis_excluded_genres` : les genres écartés de TOUTES les
 *   passes. Une piste sans genre n'est jamais écartée.
 *
 * Le serveur refuse toute autre forme qu'un tableau de chaînes.
 */
export const CLE_DOSSIERS_EXCLUS = 'background_analysis_excluded_roots';
export const CLE_GENRES_EXCLUS = 'background_analysis_excluded_genres';

/** Un chemin comparable : séparateurs `/`, sans séparateur final (sauf `/`). */
export function cheminComparable(chemin: string): string {
  const c = chemin.trim().replace(/\\/g, '/');
  const sans = c.replace(/\/+$/, '');
  return sans === '' && c.startsWith('/') ? '/' : sans;
}

/** `chemin` est `racine` elle-même, ou se trouve dessous. Même règle que le
 *  serveur : préfixe borné par le séparateur, la casse compte. */
export function estSous(chemin: string, racine: string): boolean {
  const c = cheminComparable(chemin);
  const r = cheminComparable(racine);
  if (!r) return false;
  if (c === r) return true;
  return c.startsWith(r === '/' ? '/' : r + '/');
}

/** Les entrées exclues qui ne sont PAS une racine déclarée : les sous-dossiers
 *  (et, au pire, une ancienne racine retirée de la bibliothèque). */
export function sousDossiersExclus(exclus: string[], racines: string[]): string[] {
  const r = new Set(racines.map(cheminComparable));
  return exclus.filter((e) => !r.has(cheminComparable(e)));
}

export type RefusDossier = 'vide' | 'horsRacine' | 'racine' | 'deja';

/**
 * Ajoute un sous-dossier à la liste des exclus. Refusé s'il est vide, s'il
 * n'est sous aucune racine déclarée (il ne correspondrait à aucune piste :
 * la casse compte), s'il EST une racine (la case de la racine le fait) ou s'il
 * est déjà couvert par une entrée exclue.
 */
export function ajouterDossierExclu(
  exclus: string[],
  saisie: string,
  racines: string[],
): { liste: string[] } | { refus: RefusDossier } {
  const brut = saisie.trim();
  if (!brut || !cheminComparable(brut)) return { refus: 'vide' };
  if (racines.some((r) => cheminComparable(r) === cheminComparable(brut))) return { refus: 'racine' };
  if (!racines.some((r) => estSous(brut, r))) return { refus: 'horsRacine' };
  if (exclus.some((e) => estSous(brut, e))) return { refus: 'deja' };
  return { liste: [...exclus, brut] };
}

/** Retire une entrée exclue, telle qu'écrite. */
export function retirerDossierExclu(exclus: string[], entree: string): string[] {
  return exclus.filter((e) => e !== entree);
}
