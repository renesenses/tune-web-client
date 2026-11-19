/**
 * web#3258 — « Convertir » depuis la sélection multiple de la Bibliothèque.
 *
 * La barre de sélection pose ici les albums choisis puis ouvre le
 * Convertisseur ; `ConverterV2` les reprend à son montage comme sa propre
 * sélection. Le format, la fréquence, le suivi et le téléchargement restent
 * ceux de l'écran : `POST /converter/start` part de là, avec un album par
 * source, comme pour une sélection faite dans l'écran lui-même.
 */
let demande: number[] | null = null;

export function demanderConversion(albumIds: readonly number[]): void {
  demande = albumIds.length ? [...albumIds] : null;
}

/** Lue UNE fois : un second montage du Convertisseur repart à vide. */
export function consommerDemandeConversion(): number[] | null {
  const d = demande;
  demande = null;
  return d;
}
