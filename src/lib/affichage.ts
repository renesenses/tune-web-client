/**
 * La BASCULE D'AFFICHAGE — un seul vocabulaire pour tous les écrans.
 *
 * web#1719 (FabienM, fil 2013, point 4) : « Proposer l'icone affichage grille
 * dans le menu favoris pour les albums et playlists et aussi dans le menu
 * Playlists ». La bascule existait, mais dans UN seul écran — écrite en clair
 * dans `LibraryV2.svelte` (#929).
 *
 * 🔴 Ce module existe pour qu'il n'y ait pas DEUX bascules.
 *
 * Trois écrans qui définiraient chacun leurs modes, leurs libellés et leur
 * rotation finiraient par diverger : un troisième cran ajouté ici, un libellé
 * changé là, et le même bouton ne dirait plus la même chose d'un écran à
 * l'autre. Les modes, les libellés et le « mode suivant » vivent donc ici, le
 * dessin dans `components/v2/BasculeAffichage.svelte`, et la persistance dans
 * `lib/preferencesEcran` — celle que la Bibliothèque utilisait déjà.
 *
 * ⚠️ Les valeurs sont ÉCRITES dans `localStorage` (`lireChoix` les valide
 * contre la liste permise). Renommer un mode invalide les choix retenus : ils
 * retombent silencieusement sur le défaut de l'écran.
 */

/** Les trois formes qu'un même contenu peut prendre. */
export const AFFICHAGES = ['grid', 'list', 'carousel'] as const;

/**
 * web#1802 — le cran « grandes vignettes », propre à « Écouter plus tard ».
 *
 * Bertrand, 29/09/2026 : liste, petite vignette, grande vignette — dans cet
 * écran SEUL. Le cran est donc HORS d'`AFFICHAGES` : la Bibliothèque tourne
 * sur cette liste et lit ses choix contre elle ; l'y ajouter lui donnerait un
 * quatrième cran que personne n'a demandé. `grid` reste la petite vignette,
 * la taille de toujours.
 */
export const GRANDE_GRILLE = 'gridLarge' as const;
/** Les crans COMMUNS — le type que la Bibliothèque et les Favoris manipulent. */
export type Affichage = (typeof AFFICHAGES)[number];
/**
 * Tout cran que la bascule sait dessiner, grandes vignettes comprises. Type À
 * PART : élargir `Affichage` ferait entrer `gridLarge` dans les types de la
 * Bibliothèque, qui n'en veut pas.
 */
export type AffichageEtendu = Affichage | typeof GRANDE_GRILLE;

/** Les trois crans d'« Écouter plus tard », dans l'ordre de rotation. */
export const LISTE_ET_DEUX_GRILLES = ['list', 'grid', GRANDE_GRILLE] as const;

/**
 * Les deux modes qu'un écran ordinaire propose.
 *
 * Le carrousel est le troisième cran de la Bibliothèque SEULE : il suppose une
 * bande d'albums centrée, une géométrie mesurée et un défilement horizontal
 * (#929). L'offrir ailleurs donnerait un clic sans effet — exactement le
 * défaut que la garde de `modesAffichage` évite déjà dans `LibraryV2`.
 */
export const GRILLE_OU_LISTE = ['grid', 'list'] as const;

/**
 * Le libellé d'un mode.
 *
 * 🔴 La bascule annonce le mode où le clic MÈNE, pas celui où l'on est — c'est
 * la convention de ce bouton depuis #929, et la changer tromperait ceux qui la
 * connaissent. Le mode COURANT, lui, se lit sur les pastilles.
 *
 * Les trois clés existent dans les onze langues depuis #929 : cette
 * généralisation n'en ajoute AUCUNE.
 */
export const LIBELLE_AFFICHAGE: Record<AffichageEtendu, string> = {
  grid: 'v2.lib.viewGrid',
  list: 'v2.lib.viewList',
  carousel: 'v2.lib.viewCarousel',
  gridLarge: 'v2.lib.viewGridLarge',
};

/**
 * Le mode où le prochain clic mène.
 *
 * 🔴 Un mode courant ABSENT de la liste retombe sur le premier mode offert, et
 * non sur `modes[(-1 + 1) % n]` — c'est-à-dire `modes[0]`, ce qui marcherait
 * par accident ici mais ferait tourner la bascule sur place au premier cran.
 * Le cas est réel : la Bibliothèque retire le carrousel hors de l'onglet
 * Albums, et un choix `'carousel'` retenu doit alors retomber sur la grille
 * sans effacer le choix de l'onglet Albums.
 */
export function affichageSuivant<T extends AffichageEtendu>(
  modes: readonly T[],
  courant: T,
): T {
  const i = modes.indexOf(courant);
  return i < 0 ? (modes[0] ?? ('grid' as T)) : modes[(i + 1) % modes.length];
}
