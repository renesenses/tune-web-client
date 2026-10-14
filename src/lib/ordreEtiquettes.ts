/**
 * L'ORDRE des étiquettes — web#2166, tune-server-rust#6257.
 *
 * Le serveur range les étiquettes dans l'ordre choisi sur la page Étiquettes
 * (`PUT /tags/order`) et rend toutes ses listes dans cet ordre. Le client ne
 * re-trie donc JAMAIS par nom : un `.sort(localeCompare)` défairait l'ordre
 * choisi. Ce module porte les deux gestes purs dont les écrans ont besoin.
 */

/** `liste` avec l'élément d'indice `de` déplacé à l'indice `vers` (bornés). */
export function deplacer<T>(liste: readonly T[], de: number, vers: number): T[] {
  const copie = liste.slice();
  if (de < 0 || de >= copie.length) return copie;
  const cible = Math.max(0, Math.min(copie.length - 1, vers));
  if (cible === de) return copie;
  const [el] = copie.splice(de, 1);
  copie.splice(cible, 0, el);
  return copie;
}

/**
 * Le déplacement demandé par une touche, ou `null` si la touche ne déplace
 * pas. Alt + flèche gauche/haut avance d'un rang vers le début, Alt + flèche
 * droite/bas vers la fin ; Alt + Début et Alt + Fin vont aux extrémités.
 * Sans Alt, les flèches gardent leur rôle habituel.
 */
export function rangVise(
  touche: { key: string; altKey: boolean },
  indice: number,
  total: number,
): number | null {
  if (!touche.altKey) return null;
  switch (touche.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return indice > 0 ? indice - 1 : null;
    case 'ArrowRight':
    case 'ArrowDown':
      return indice < total - 1 ? indice + 1 : null;
    case 'Home':
      return indice > 0 ? 0 : null;
    case 'End':
      return indice < total - 1 ? total - 1 : null;
    default:
      return null;
  }
}

/**
 * `liste` rangée selon l'ordre de `reference` (comparaison par `id`) ; ce qui
 * n'y figure pas va à la fin, dans son ordre. Sert aux étiquettes POSÉES
 * d'un objet, complétées localement après une pose : elles reprennent l'ordre
 * de la liste complète au lieu de s'empiler au bout.
 */
export function selonOrdre<T extends { id: number | null }>(
  liste: readonly T[],
  reference: readonly { id: number | null }[],
): T[] {
  const rang = new Map<number | null, number>();
  reference.forEach((r, i) => { if (!rang.has(r.id)) rang.set(r.id, i); });
  const hors = reference.length;
  return liste
    .map((el, i) => ({ el, i, r: rang.get(el.id) ?? hors }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.el);
}
