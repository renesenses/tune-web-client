/**
 * Ce que la largeur de la fenêtre change dans la coquille du nouveau client.
 *
 * Bertrand, 07/09/2026 : « Affichage sur petit écran ».
 *
 * ## Le constat, mesuré
 *
 * `ShellV2`, `Sidebar` et `styles/tune-v2.css` ne contenaient **aucune** media
 * query — zéro, comptée. La barre latérale gardait donc ses 236 px quelle que
 * soit la fenêtre. Mesuré dans un cadre de 390 px sur le .18 le 07/09/2026 :
 *
 *     largeur de la fenêtre : 390 px
 *     barre latérale        : 236 px   (60 % de l'écran)
 *     reste pour la vue     : 154 px
 *     40 éléments débordant de leur conteneur
 *
 * « Zones d'écoute actives » tenait sur trois lignes, « Rien à montrer pour
 * l'instant. » sur quatre, et l'en-tête passait sous l'avatar.
 *
 * ## Trois paliers, et pourquoi ceux-là
 *
 * On ne réinvente aucune navigation : la barre latérale sait DÉJÀ se replier
 * en icônes (72 px, `.collapsed`). Les paliers ne font que décider quand.
 *
 *   large   (> 1100)  la barre latérale telle quelle — le repli reste le choix
 *                     de l'utilisateur, et il est mémorisé.
 *   étroit  (≤ 1100)  repli en ICÔNES d'office. 236 px sur une fenêtre de
 *                     1000 px, c'est un quart de l'écran pour des libellés
 *                     qu'on connaît par cœur.
 *   tiroir  (≤ 760)   la barre SORT DU FLUX. En dessous, aucune largeur ne se
 *                     partage : 72 px de rail sur 390 px en mangent encore un
 *                     cinquième, et la vue reste illisible.
 *
 * Le choix manuel n'est jamais écrasé : il ne s'applique qu'au palier « large »,
 * où il a un sens. Réduire la fenêtre puis l'agrandir rend son état à
 * l'utilisateur.
 */
import { readable, writable } from 'svelte/store';

export const SEUIL_ICONES = 1100;
export const SEUIL_TIROIR = 760;

export type FormatEcran = 'large' | 'etroit' | 'tiroir';

/** La règle, isolée pour être éprouvée sans monter la coquille. */
export function formatPour(largeur: number): FormatEcran {
  if (largeur <= SEUIL_TIROIR) return 'tiroir';
  if (largeur <= SEUIL_ICONES) return 'etroit';
  return 'large';
}

/**
 * Le format courant.
 *
 * `matchMedia` plutôt qu'un écouteur `resize` : le navigateur ne réveille alors
 * le client qu'aux DEUX franchissements de seuil, pas à chaque pixel d'un
 * redimensionnement à la souris.
 *
 * 🔴 Mais `matchMedia` peut MANQUER là où `window` existe. Tester
 * `typeof window === 'undefined'` ne suffit pas : un environnement de test qui
 * monte un composant, ou une vieille webview, offre un `window` sans
 * `matchMedia` — et l'appel jette, ce qui fait tomber le montage entier du
 * composant, pas seulement la mesure de largeur.
 *
 * Constaté le 08/09/2026 en fusionnant `main` : le test de la recherche
 * globale (#3629) monte `ShellV2` et échouait sur
 * « window.matchMedia is not a function », alors qu'il ne parle pas du tout de
 * largeur d'écran. Le repli sur `resize` rend le même service, un peu plus
 * souvent.
 */
export const formatEcran = readable<FormatEcran>(
  typeof window === 'undefined' ? 'large' : formatPour(window.innerWidth),
  (set) => {
    if (typeof window === 'undefined') return;
    const relire = () => set(formatPour(window.innerWidth));
    relire();

    if (typeof window.matchMedia !== 'function') {
      // Repli : on est réveillé à chaque pixel au lieu des deux seuils. C'est
      // le prix d'un environnement qui n'a pas `matchMedia` — et il n'y a
      // personne pour redimensionner, dans un test.
      window.addEventListener('resize', relire);
      return () => window.removeEventListener('resize', relire);
    }

    const icones = window.matchMedia(`(max-width: ${SEUIL_ICONES}px)`);
    const tiroir = window.matchMedia(`(max-width: ${SEUIL_TIROIR}px)`);
    icones.addEventListener('change', relire);
    tiroir.addEventListener('change', relire);
    return () => {
      icones.removeEventListener('change', relire);
      tiroir.removeEventListener('change', relire);
    };
  },
);

/**
 * Le tiroir est-il ouvert ?
 *
 * Dans un magasin, pas dans la barre latérale : au palier « tiroir » celle-ci
 * est HORS CHAMP, son propre bouton est donc inatteignable. C'est l'en-tête de
 * la coquille qui l'ouvre.
 */
export const tiroirOuvert = writable(false);
