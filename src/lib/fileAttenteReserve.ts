/**
 * Largeur à réserver, À DROITE du contenu de « Lecture en cours », pour le
 * panneau File d'attente — renesenses/tune-server-rust#3676.
 *
 * Le défaut corrigé : la feuille rétrécissait bien le bloc lecteur quand la
 * file s'ouvrait (`max-width: calc(100% - 420px)`), mais `.np-scroll` centre
 * son contenu (`justify-content: center`). Rétrécir un bloc CENTRÉ ne le
 * décale pas : les 420 px libérés se répartissaient 210 px de chaque côté,
 * pendant que le panneau, lui, est ancré à droite. Le bloc restait donc
 * recouvert — c'est ce que Pierre M décrit (fil forum 911, 03/07/2026) et le
 * remède qu'il propose : « on peut la pousser vers la gauche ».
 *
 * La réserve est désormais un vrai retrait à droite, et elle vaut la largeur
 * EFFECTIVE du panneau — celle que l'utilisateur a pu choisir en tirant le
 * bord, et non la constante 420 px qui ne suivait rien.
 */

/** États du panneau, tels que `NowPlaying.svelte` les nomme. */
export type EtatFileAttente = 'collapsed' | 'peek' | 'expanded';

/**
 * Largeurs déclarées par `.queue-sheet.wide-layout` et
 * `.queue-sheet.wide-layout.expanded` dans `NowPlaying.svelte`.
 * `fileAttenteReserve.test.ts` relit la feuille et échoue si elles dérivent.
 */
export const FILE_ATTENTE_LARGEUR_PAR_DEFAUT = 380;
export const FILE_ATTENTE_LARGEUR_DEPLIEE = 420;

/**
 * Largeur en pixels à retirer à droite du contenu, ou 0 quand rien n'est
 * ancré à droite : file fermée, ou disposition étroite où le panneau est une
 * feuille ancrée EN BAS et ne recouvre donc jamais latéralement.
 *
 * @param large            `isWide` — le panneau est une colonne de droite.
 * @param etat             état courant du panneau.
 * @param largeurChoisie   largeur tirée par l'utilisateur (`sheetCustomWidth`),
 *                         persistée dans `tune.queueSheetWidth`, ou `null`.
 */
export function largeurReserveeFileAttente(
  large: boolean,
  etat: EtatFileAttente,
  largeurChoisie: number | null,
): number {
  if (!large || etat === 'collapsed') return 0;
  if (largeurChoisie != null) return largeurChoisie;
  return etat === 'expanded' ? FILE_ATTENTE_LARGEUR_DEPLIEE : FILE_ATTENTE_LARGEUR_PAR_DEFAUT;
}
