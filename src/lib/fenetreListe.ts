/**
 * La FENÊTRE d'une longue liste : quelles lignes construire, et combien de
 * vide mettre de part et d'autre.
 *
 * ## Pourquoi
 *
 * `QueueV2.svelte` rendait toutes les lignes restantes de la file. Sur la
 * playlist Qobuz de 1454 titres d'Alex Campbell (20/09/2026), cela fait 1453
 * lignes — chacune avec sa pochette, sa ligne technique et sa barre d'actions
 * — construites d'un seul tenant : 3,7 s de fil principal bloqué à chaque
 * rendu, mesuré. Refs #1126.
 *
 * Le confinement CSS (`content-visibility: auto`) que porte l'ancien écran
 * évite le LAYOUT des lignes hors champ, mais pas leur CONSTRUCTION : les 1453
 * composants existent quand même. Ici on ne construit que ce qui peut être vu,
 * et on remplace le reste par deux cales de hauteur.
 *
 * ## Ce que la fenêtre ne doit PAS faire
 *
 * Amputer la liste. Une fenêtre qui ne suit pas le défilement est un plafond
 * déguisé : la fin de la file deviendrait inatteignable, ce qui est le défaut
 * qu'on corrige, en pire — il ne se voit pas. Les cales portent donc la
 * hauteur EXACTE de ce qui n'est pas construit, pour que la barre de
 * défilement et les distances restent celles de la liste entière.
 */

/** Ce qu'il faut construire, et le vide à laisser autour. */
export interface FenetreListe {
  /** Index de la première ligne à construire (inclus). */
  debut: number;
  /** Index de fin, exclu. */
  fin: number;
  /** Hauteur de la cale AVANT, en pixels. */
  avant: number;
  /** Hauteur de la cale APRÈS, en pixels. */
  apres: number;
}

/**
 * Lignes construites de part et d'autre de la zone visible.
 *
 * Assez pour qu'un coup de molette ou une flèche du clavier ne découvre jamais
 * de vide avant que le prochain calcul soit passé, et assez peu pour que le
 * total reste de l'ordre de la dizaine de lignes.
 */
export const MARGE_LIGNES = 12;

/**
 * Hauteur de vue supposée tant que le conteneur n'a pas été mesuré.
 *
 * Le premier rendu a lieu avant que l'élément soit dans le document : son
 * `clientHeight` vaut alors zéro. Rendre la liste entière « en attendant »
 * annulerait tout le bénéfice — c'est précisément ce premier rendu qui coûte
 * 3,7 s. On suppose donc un grand écran, ce qui donne une fenêtre généreuse,
 * corrigée dès la première mesure réelle.
 */
export const HAUTEUR_VUE_PAR_DEFAUT = 1000;

/**
 * @param total        Nombre total de lignes de la liste.
 * @param hauteurLigne Hauteur d'une ligne, en pixels.
 * @param decalage     Défilement DÉJÀ ramené au haut de la liste (`scrollTop`
 *                     moins la position de la liste dans le conteneur). Un
 *                     décalage négatif veut dire que la liste n'a pas encore
 *                     été atteinte : on part du début.
 * @param hauteurVue   Hauteur visible du conteneur. `0` ou moins → la valeur
 *                     par défaut ci-dessus.
 */
export function fenetreListe(
  total: number,
  hauteurLigne: number,
  decalage: number,
  hauteurVue: number,
): FenetreListe {
  if (!Number.isFinite(total) || total <= 0) return { debut: 0, fin: 0, avant: 0, apres: 0 };
  // Une hauteur de ligne absurde rendrait la fenêtre fausse dans les deux
  // sens. Sans mesure exploitable, on rend tout : trop lent vaut mieux que
  // faux.
  if (!Number.isFinite(hauteurLigne) || hauteurLigne <= 0) {
    return { debut: 0, fin: total, avant: 0, apres: 0 };
  }
  const vue = Number.isFinite(hauteurVue) && hauteurVue > 0 ? hauteurVue : HAUTEUR_VUE_PAR_DEFAUT;
  const haut = Number.isFinite(decalage) && decalage > 0 ? decalage : 0;

  const premiereVisible = Math.floor(haut / hauteurLigne);
  const nombreVisible = Math.ceil(vue / hauteurLigne);

  const debut = Math.max(0, Math.min(premiereVisible - MARGE_LIGNES, total - 1));
  const fin = Math.min(total, debut + nombreVisible + 2 * MARGE_LIGNES);

  return {
    debut,
    fin,
    avant: debut * hauteurLigne,
    apres: (total - fin) * hauteurLigne,
  };
}
