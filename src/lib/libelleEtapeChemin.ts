/**
 * rc14 (retour de Rémi, go de Bertrand du 26/11) — le TITRE d'une étape dans
 * la fenêtre du chemin du signal de la barre de lecture, quand le web le
 * connaît par le TYPE de l'étape plutôt que par le texte du serveur.
 *
 * L'étape de convolution s'intitulait « Room correction » : c'est le début de
 * la description que le serveur publie (`textes_signal.json`,
 * `correction_piece_*`). Or le moteur de convolution ne sert pas qu'à la
 * correction de pièce (casque, filtres, réponses impulsionnelles en tout
 * genre). Le titre devient « Convolution », clé web traduite, choisie d'après
 * le type de l'étape (`code`, `kind`) ; le texte du serveur n'est pas réécrit
 * ici (une PR serveur s'en charge) : il reste lisible, en détail, dessous.
 *
 * Une correction de pièce faite par l'ÉGALISEUR paramétrique (`kind: 'eq'`,
 * #7632) n'est pas une convolution : elle garde le texte du serveur.
 */
export interface EtapeTypee {
  code?: string | null;
  kind?: string | null;
}

/** La clé du titre de l'étape d'après son type, ou `null` (texte du serveur). */
export function cleDuTitreDEtape(etape: EtapeTypee | null | undefined): string | null {
  if (etape?.code === 'room_correction' && etape.kind !== 'eq') return 'signal.step.convolution';
  return null;
}
