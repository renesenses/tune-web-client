/** L'aperçu d'import, réduit aux deux nombres dont la décision dépend. */
export interface ImportPreviewCounts {
  total_rows?: number;
  matched?: number;
}

/** L'import réel peut-il être lancé depuis cet aperçu ?
 *
 *  La condition portait sur `matched === 0`. Or sur une bibliothèque VIDE —
 *  c'est-à-dire le premier import Roon, l'usage même de la fonction — aucune
 *  ligne ne peut être reconnue : `matched` vaut 0, et le bouton « importer »
 *  restait grisé pour toujours. Celui qui avait le plus besoin d'importer
 *  était le seul à ne pas pouvoir le faire.
 *
 *  Ce qui décide, c'est qu'il y ait quelque chose à importer : `total_rows`.
 *  Un fichier dont rien ne correspond encore s'importe très bien — c'est même
 *  tout l'objet de l'opération.
 */
export function canConfirmImport(
  report: ImportPreviewCounts | null | undefined,
  importing = false,
): boolean {
  if (importing) return false;
  if (!report) return false;
  return (report.total_rows ?? 0) > 0;
}
