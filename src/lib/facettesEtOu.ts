/**
 * #2108 — opérateur « Et » / « Ou » entre les valeurs cochées d'une même
 * facette d'Oxygen.
 *
 * Bertrand, fil 1963 : « Réfléchir à la possibilité d'opérateurs logiques
 * "Et" et "Ou" (utile quand on cherche un compositeur ou un interprète en
 * musique classique) ».
 *
 * - Par défaut, les valeurs d'une facette se combinent en **Ou** (#2168) : la
 *   piste en porte au moins une.
 * - En **Et**, la piste doit les porter TOUTES. Le serveur le fait sur
 *   `?all_of=<facette>` (renesenses/tune-server-rust, `facet_filter::combiner`).
 *
 * Le « Et » n'est proposé que pour les facettes dont une piste peut porter
 * plusieurs valeurs à la fois : plusieurs genres, plusieurs compositeurs dans
 * le même champ, plusieurs listes de lecture… Sur l'année, le format ou
 * l'artiste de la piste, deux valeurs en « Et » ne rendraient jamais rien ; le
 * serveur ignore d'ailleurs `all_of` pour elles (`FACETTES_COMBINABLES_EN_ET`).
 */

/** Les facettes du rail (clés du rail) qui acceptent le « Et ». `source` est
 *  la clé de rail de `source_media`. Miroir de `FACETTES_COMBINABLES_EN_ET`
 *  côté serveur, restreint aux facettes que le rail affiche. */
export const FACETTES_COMBINABLES_EN_ET: ReadonlySet<string> = new Set([
  'genre', 'composer', 'label', 'country', 'mood', 'source',
  'playlist', 'favorite', 'untagged',
]);

/** Le choix « Et / Ou » a-t-il un sens pour cette facette, avec ce nombre de
 *  valeurs cochées ? Une seule valeur : les deux opérateurs disent la même
 *  chose, le choix ne s'affiche pas. */
export function operateurProposable(champ: string, nbCochees: number): boolean {
  return nbCochees >= 2 && FACETTES_COMBINABLES_EN_ET.has(champ);
}

/** Bascule « Ou » ↔ « Et » pour une facette. Rend une NOUVELLE liste. */
export function basculerOperateur(enEt: readonly string[], champ: string): string[] {
  return enEt.includes(champ) ? enEt.filter((c) => c !== champ) : [...enEt, champ];
}

/**
 * La valeur du paramètre `all_of` : les noms SERVEUR des facettes en « Et »
 * qui ont au moins deux valeurs cochées. Vide = aucun paramètre, c'est-à-dire
 * exactement la requête d'avant #2108.
 */
export function parametreEt(
  selections: Record<string, readonly string[]>,
  enEt: readonly string[],
  nomServeur: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const champ of enEt) {
    const cle = nomServeur[champ];
    if (!cle || !operateurProposable(champ, selections[champ]?.length ?? 0)) continue;
    if (!out.includes(cle)) out.push(cle);
  }
  return out;
}
