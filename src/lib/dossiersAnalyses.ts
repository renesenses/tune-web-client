/**
 * tune-server-rust#5593 (Tades, fil 2173 : « circonscrire l'analyse à un
 * répertoire ») — limiter les analyses de fond (ReplayGain, plage dynamique,
 * empreintes, ambiances) à certains dossiers. Le serveur publie
 * `background_analysis_included_dirs`, un tableau vide par défaut (toute la
 * bibliothèque) ; il refuse toute autre forme. N'importe quel dossier, pas
 * seulement une racine ; une racine exclue l'emporte.
 */
export const CLE_DOSSIERS_INCLUS = 'background_analysis_included_dirs';

/** La liste publiée, ou `null` si le serveur ne connaît pas le réglage. */
export function dossiersDepuisConfig(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : null;
}

/** Une saisie, UN dossier par ligne (un nom de dossier peut porter une
 *  virgule) → la liste, rognée, sans vide ni doublon exact. */
export function lireSaisieDeDossiers(texte: string): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const brut of texte.split(/\r?\n/)) {
    const d = brut.trim();
    if (!d || vus.has(d)) continue;
    vus.add(d);
    sortie.push(d);
  }
  return sortie;
}

export function afficherDossiers(dossiers: string[]): string {
  return dossiers.join('\n');
}
