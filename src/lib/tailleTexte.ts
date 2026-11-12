/**
 * « Taille du texte » — simplification de l'interface, rc12 (go de Bertrand du
 * 12/11/2026 ; demande de testeurs : « chữ nhỏ li ti », des textes minuscules).
 *
 * Le client n'avait PAS d'échelle typographique : ~2 400 tailles écrites en
 * dur (`font-size: 13px`, `font: 600 12px …`). Chacune est désormais
 * multipliée par un SEUL jeton, `--v2-txt-echelle` (défini dans
 * `styles/tune-v2.css`, repli `1` partout) :
 *
 *     font-size: calc(13px * var(--v2-txt-echelle, 1));
 *
 * À « Normale », le calcul rend la valeur d'origine au pixel près : personne
 * ne voit son affichage changer sans l'avoir demandé. Seul le TEXTE grandit ;
 * marges, pochettes et grilles gardent leurs dimensions (ce n'est pas un zoom).
 *
 * Le choix est posé en attribut `data-v2-taille-texte` sur <html>, comme le
 * thème (`v2Theme`) et l'ascenseur large (web#2798).
 */
export const TAILLES_TEXTE = ['petite', 'normale', 'grande'] as const;
export type TailleTexte = (typeof TAILLES_TEXTE)[number];

export const TAILLE_TEXTE_DEFAUT: TailleTexte = 'normale';

/** Le multiplicateur de chaque cran — le même que la feuille `tune-v2.css`. */
export const ECHELLE_TEXTE: Record<TailleTexte, number> = {
  petite: 0.9,
  normale: 1,
  grande: 1.15,
};

/** Clés i18n des libellés du sélecteur. */
export const LIBELLE_TAILLE_TEXTE: Record<TailleTexte, string> = {
  petite: 'settings.textSizeSmall',
  normale: 'settings.textSizeNormal',
  grande: 'settings.textSizeLarge',
};

export function estTailleTexte(v: unknown): v is TailleTexte {
  return typeof v === 'string' && (TAILLES_TEXTE as readonly string[]).includes(v);
}

/** Pose le cran sur <html>. Une valeur inconnue retombe sur « Normale ». */
export function appliquerTailleTexte(taille: unknown): void {
  if (typeof document === 'undefined') return;
  const t = estTailleTexte(taille) ? taille : TAILLE_TEXTE_DEFAUT;
  document.documentElement.setAttribute('data-v2-taille-texte', t);
}
