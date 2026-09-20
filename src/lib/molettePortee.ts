/**
 * Porter la molette d'une bande INERTE au défileur du contenu — #1327, point 1.
 *
 * Gros Bidon (Didier), fil 1858, 20/09/2026, écran Streaming Qobuz, Windows :
 *
 * > « 1. Sur l'écran du service de streaming Qobuz les actions de la souris ne
 * > sont pas très ergonomiques. Par exemple si la souris est à la hauteur de
 * > la zone du titre Qobuz, la molette de la souris n'a aucun effet. »
 *
 * ## Pourquoi elle n'a aucun effet
 *
 * Ces écrans sont une COLONNE en `height:100%` dont le parent est en
 * `overflow:hidden` : l'en-tête, les rangées d'onglets et le contenu sont
 * FRÈRES, et un seul des quatre défile. `StreamingV2.svelte` :
 *
 * ```
 * .v2-str{display:flex; flex-direction:column; height:100%; overflow:hidden}
 *   <header class="v2-top">   ← ~85 px, aucun défilement
 *   <nav class="svcs">        ← la rangée de services
 *   <nav class="subs">        ← Éditorial / Playlists / Favoris
 *   .scroll{flex:1; overflow-y:auto}   ← le SEUL défileur
 * ```
 *
 * Une molette posée sur les trois premiers n'a donc rien à faire défiler :
 * l'événement remonte jusqu'à un ancêtre en `overflow:hidden`, et s'y perd.
 * `PageWidgets.svelte` a exactement la même colonne, et c'est la sienne que
 * montre la capture de Didier — l'en-tête « Éditorial / **Qobuz** ».
 *
 * Ce n'est pas la confiscation de ses points 2 à 4 (celle-là venait de
 * `defilementHorizontal`, corrigée par #1380) : ici, il n'y a jamais rien eu à
 * confisquer. Les deux se lisent pareil à l'usage — « la molette ne fait rien
 * » — et c'est pourquoi le ticket les nomme ensemble.
 *
 * ## Ce que fait cette action, et surtout ce qu'elle NE fait pas
 *
 * 🔴 **Elle ne prend l'événement que si la cible peut RÉELLEMENT avancer.**
 * C'est la même règle que `defilementHorizontal` s'est donnée en tête de
 * fichier — on ne confisque jamais un geste à qui pourrait en faire quelque
 * chose. Ici la précaution vaut surtout pour l'ancêtre : `preventDefault()` sur
 * une bande dont le contenu est déjà en butée empêcherait le chaînage vers un
 * défileur plus haut.
 *
 * 🔴 **Un geste déjà horizontal (`deltaX`) lui échappe**, et **`Ctrl` +
 * molette aussi** — c'est le zoom du navigateur, il ne se détourne pas.
 *
 * 🔴 **Un défileur INTERNE à la bande garde son geste.** Rien n'en porte
 * aujourd'hui, mais une bande d'en-tête est exactement l'endroit où l'on pose
 * un menu ou une liste déroulante plus tard ; la garde coûte une boucle sur
 * trois éléments et évite d'avoir à se souvenir de celle-ci ce jour-là.
 */
import { peutDefilerVerticalement } from './defilementHorizontal';

/**
 * De combien porter la molette à `cible`, ou `0` pour « laisser passer ».
 *
 * Séparée de l'action pour être jugée sans DOM : c'est la RÈGLE, l'action n'en
 * est que le branchement.
 */
export function deplacementPorte(
  cible: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'> | null | undefined,
  e: Pick<WheelEvent, 'deltaX' | 'deltaY'> & { ctrlKey?: boolean },
): number {
  if (!cible) return 0;
  if (e.ctrlKey) return 0;
  if (e.deltaX !== 0) return 0;
  const d = e.deltaY;
  if (!d) return 0;
  return peutDefilerVerticalement(cible, d) ? d : 0;
}

/**
 * Un défileur vertical existe-t-il ENTRE `depuis` et `borne`, qui puisse
 * encore avancer de `delta` ?
 *
 * `borne` exclue : c'est la bande elle-même, dont on sait qu'elle ne défile
 * pas — c'est tout le sujet.
 */
export function unDefileurInterne(
  depuis: EventTarget | null,
  borne: Element,
  delta: number,
): boolean {
  let p = depuis instanceof Element ? depuis : null;
  for (; p && p !== borne; p = p.parentElement) {
    if (peutDefilerVerticalement(p, delta)) return true;
  }
  return false;
}

/**
 * L'action Svelte : `use:molettePortee={() => leDefileur}` sur la bande inerte.
 *
 * Le paramètre est une FONCTION et non l'élément : la référence est liée par
 * `bind:this` et vaut `null` au premier rendu, donc la lire à chaque événement
 * est la seule façon de ne pas figer un `null`.
 */
export function molettePortee(el: HTMLElement, cible: () => HTMLElement | null) {
  let ou = cible;
  const molette = (e: WheelEvent) => {
    if (unDefileurInterne(e.target, el, e.deltaY)) return;
    const c = ou();
    const d = deplacementPorte(c, e);
    if (!d || !c) return;
    // `passive: false` ci-dessous : sans lui le navigateur refuse
    // `preventDefault()`, et un ancêtre défilant prendrait l'événement EN PLUS.
    e.preventDefault();
    c.scrollBy({ top: d, behavior: 'auto' });
  };
  el.addEventListener('wheel', molette, { passive: false });
  return {
    update(neuf: () => HTMLElement | null) { ou = neuf; },
    destroy() { el.removeEventListener('wheel', molette); },
  };
}
