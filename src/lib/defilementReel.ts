/**
 * Trouver le conteneur qui DÉFILE RÉELLEMENT.
 *
 * Mesuré dans Chrome sur .18 (v0.9.126), onglet Albums de la Bibliothèque,
 * après un défilement réel :
 *
 *   .view-scroller      scrollTop 0    scrollHeight 745    clientHeight 745  → NE DÉFILE PAS
 *   .library-scroller   scrollTop 0    scrollHeight 607    clientHeight 607  → NE DÉFILE PAS
 *   .album-grid-viewport scrollTop 600 scrollHeight 121363 clientHeight 523  → c'est lui
 *
 * Or la mémorisation de position visait `.view-scroller` (App.svelte) et
 * `.library-scroller` (LibraryView.svelte) : les deux lisaient et réécrivaient
 * 0 indéfiniment. Le mécanisme d'attente « quand la liste est prête » était
 * bon, seule sa CIBLE était fausse — d'où cinq PR de rechute (#82, #583, #586,
 * #588, #621).
 *
 * La règle ici ne nomme donc plus UN conteneur : elle prend une liste de
 * candidats ordonnée du plus intérieur au plus extérieur et retient celui qui
 * défile pour de bon. La disposition peut changer (grille virtualisée, page de
 * détail, onglet Genres qui défile ailleurs) sans repasser par un correctif.
 */

/** Un élément défile s'il a plus de contenu que de hauteur visible. */
export function defileVraiment(el: Element | null | undefined): boolean {
  if (!el) return false;
  return el.scrollHeight > el.clientHeight;
}

/**
 * Le premier candidat qui défile vraiment.
 *
 * À défaut — rien n'a encore été rendu, la liste tient dans l'écran — rend le
 * premier candidat PRÉSENT plutôt que `null` : mémoriser 0 sur un conteneur
 * qui ne défile pas est sans effet, alors que rendre `null` ferait perdre
 * l'appelant qui, lui, doit bien écrire quelque part.
 */
export function conteneurDefilant(
  candidats: readonly string[],
  racine: ParentNode = document,
): HTMLElement | null {
  let premierPresent: HTMLElement | null = null;
  for (const selecteur of candidats) {
    const el = racine.querySelector(selecteur) as HTMLElement | null;
    if (!el) continue;
    if (premierPresent === null) premierPresent = el;
    if (defileVraiment(el)) return el;
  }
  return premierPresent;
}

/**
 * Ordre des candidats de la vue Bibliothèque, du plus intérieur au plus
 * extérieur. La grille d'albums et celle des années sont virtualisées et
 * portent leur propre ascenseur ; `.library-scroller` porte la liste des
 * artistes et l'onglet Genres ; `.view-scroller` est le repli des autres vues.
 */
export const CANDIDATS_DEFILEMENT = [
  '.album-grid-viewport',
  '.year-grid-viewport',
  '.library-scroller',
  '.view-scroller',
] as const;

/**
 * Restaure une position en attendant que la liste soit assez haute pour la
 * porter. Sans cette attente, `scrollTop = 600` sur une liste encore vide est
 * ramené à 0 par le navigateur et l'utilisateur retombe en haut (#1024).
 *
 * `cible <= 0` ne déclenche rien : il n'y a pas de position à rendre, et
 * écrire 0 écraserait une restauration concurrente.
 */
export function restaurerQuandPret(
  cible: number,
  trouver: () => HTMLElement | null,
  options: {
    essaisMax?: number;
    programmer?: (cb: () => void) => void;
    fini?: () => void;
  } = {},
): void {
  const essaisMax = options.essaisMax ?? 30;
  const programmer =
    options.programmer ??
    ((cb: () => void) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
      else setTimeout(cb, 16);
    });
  if (cible <= 0) {
    options.fini?.();
    return;
  }
  let essais = 0;
  const tick = () => {
    const el = trouver();
    const pret = el !== null && el.scrollHeight >= cible + el.clientHeight;
    if (pret || essais >= essaisMax) {
      if (el) el.scrollTop = cible;
      options.fini?.();
      return;
    }
    essais += 1;
    programmer(tick);
  };
  programmer(tick);
}
