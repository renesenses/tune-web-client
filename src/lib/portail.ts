/**
 * Déplace un élément à la racine du document.
 *
 * ## Pourquoi c'est nécessaire
 *
 * Une surcouche en `position: fixed` se place normalement par rapport à la
 * FENÊTRE. Normalement — car un ancêtre portant `transform`, `filter`,
 * `perspective`, `will-change` ou `contain` devient à son tour le bloc
 * conteneur des descendants fixés. La surcouche se retrouve alors enfermée
 * dans cet ancêtre, à sa taille et sous ses règles de rognage.
 *
 * Vécu le 02/09/2026 : le panneau d'étiquettes s'affichait à l'intérieur de la
 * vignette d'album, rogné aux trois quarts. DEUX causes se cumulaient, et
 * corriger l'une seule n'aurait rien donné :
 *
 *  - `.pa` porte `overflow: hidden` — indispensable, c'est lui qui arrondit la
 *    pochette et qui contient la mosaïque ;
 *  - `.card` a reçu `content-visibility: auto` pour ne pas rendre les vignettes
 *    hors écran. Or cette propriété implique `contain: layout style paint`,
 *    donc crée précisément ce bloc conteneur.
 *
 * Déplacer le nœud à la racine du document règle les deux d'un coup, et ne
 * dépend d'aucune des deux : n'importe quel ancêtre futur pourrait recréer le
 * problème sans que personne fasse le rapprochement.
 *
 * ## Ce que cela ne change pas
 *
 * Le nœud change de place dans le DOM, pas dans le composant : ses événements
 * Svelte, son état et sa destruction restent gérés là où il est déclaré. On le
 * remet où il faut au démontage, sinon il survivrait à l'écran qui l'a ouvert.
 */
export function portail(node: HTMLElement) {
  const cible = document.body;
  const origine = node.parentNode;
  cible.appendChild(node);
  return {
    destroy() {
      // Le composant a pu être détruit avant nous : le nœud n'a alors plus de
      // parent, et `removeChild` lèverait.
      if (node.parentNode === cible) cible.removeChild(node);
      else if (origine && node.parentNode === origine) origine.removeChild(node);
    },
  };
}
