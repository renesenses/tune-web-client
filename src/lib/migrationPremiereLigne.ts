/**
 * LA PREMIÈRE LIGNE ENTRE UNE FOIS DANS LES ACCUEILS DÉJÀ RANGÉS — arbitrage
 * de Bertrand du 27/09/2026.
 *
 * ## Le trou que cela ferme
 *
 * `DISPOSITION_DEFAUT` ne s'applique qu'aux profils qui n'ont JAMAIS rangé
 * leur accueil : une disposition enregistrée l'emporte toujours. Or la
 * première ligne y est entrée en tête le 27/09. Conséquence : **quiconque a
 * déplacé ou retiré un widget, ne serait-ce qu'une fois, ne verra jamais la
 * ligne d'en-tête** — le widget le plus visible du lot, invisible pour les
 * utilisateurs les plus engagés. C'est exactement l'inverse de ce qu'on veut.
 *
 * ## Ce que cette fonction fait, et ce qu'elle refuse de faire
 *
 * * disposition enregistrée sans la ligne, marqueur absent → on l'insère EN
 *   TÊTE et on écrit (disposition + marqueur, dans le même appel) ;
 * * ligne déjà présente → rien à faire, et surtout AUCUNE écriture ;
 * * marqueur posé → on ne touche plus jamais à ce profil ;
 * * rien d'enregistré → rien à migrer : ce profil suit déjà le défaut, qui
 *   porte la ligne. Ouvrir l'accueil ne doit rien écrire chez lui.
 *
 * ## 🔴 L'IDEMPOTENCE, et pourquoi le marqueur est indispensable
 *
 * Sans marqueur, la migration se REJOUERAIT contre l'utilisateur : celui qui
 * retire la ligne la retrouverait au chargement suivant. **Un widget qu'on ne
 * peut plus enlever serait un défaut pire que celui qu'on corrige.** C'est mot
 * pour mot la leçon de #1519 sur la ligne de chiffres, et ce module en reprend
 * la forme — un prédicat pur, testé, et un marqueur écrit dans le même appel
 * que ce qu'il protège.
 *
 * ## Pourquoi la page décide, et pas ce module
 *
 * La migration ne vaut que pour les écrans dont le DÉFAUT porte la ligne —
 * l'accueil. Les écrans éditoriaux Qobuz et Tidal instancient la même page
 * avec leur propre catalogue, où `premiere-ligne` n'existe même pas : leur y
 * insérer un identifiant inconnu laisserait un trou muet dans leur page. D'où
 * le passage du défaut en paramètre plutôt qu'une constante lue ici.
 */

/** L'identifiant de la ligne d'en-tête. Un seul endroit où il est écrit. */
export const ID_PREMIERE_LIGNE = 'premiere-ligne';

export interface MigrationDisposition {
  /** La disposition à afficher. Inchangée quand il n'y a rien à faire. */
  disposition: string[];
  /** Faut-il écrire cette disposition et son marqueur ? */
  aMigrer: boolean;
}

export function migrationPremiereLigne(
  enregistree: readonly string[] | null | undefined,
  marqueur: unknown,
  dispositionDefaut: readonly string[],
): MigrationDisposition {
  const actuelle = [...(enregistree ?? [])];
  // Rien d'enregistré : ce profil suit le défaut, qui porte déjà la ligne.
  if (!actuelle.length) return { disposition: actuelle, aMigrer: false };
  // Un écran dont le défaut ne porte pas la ligne n'est pas concerné.
  if (!dispositionDefaut.includes(ID_PREMIERE_LIGNE)) {
    return { disposition: actuelle, aMigrer: false };
  }
  // Déjà migré : on ne revient jamais sur ce profil, quoi qu'il range ensuite.
  if (marqueur === true) return { disposition: actuelle, aMigrer: false };
  // Déjà présente — posée à la main, ou par une migration d'une autre session.
  if (actuelle.includes(ID_PREMIERE_LIGNE)) {
    return { disposition: actuelle, aMigrer: false };
  }
  return { disposition: [ID_PREMIERE_LIGNE, ...actuelle], aMigrer: true };
}
