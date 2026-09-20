/**
 * Faire défiler une rangée horizontale à la MOLETTE et aux FLÈCHES — #1137,
 * corrigé par #1327.
 *
 * Pascal (bluevelvet), fil 1765, 11/09/2026, rejoignant Mac Brehlit :
 *
 * > « Il en va de même pour les rangées d'albums présentées horizontalement :
 * > il faut là aussi attraper la barre pour se déplacer latéralement, ce qui
 * > n'est pas très pratique. »
 *
 * ⚠️ CECI NE TRAITE QUE LE SYMPTÔME, et c'est assumé. Pascal propose mieux —
 * un bouton « Plus » qui ouvre la rubrique en VERTICAL, à la façon de Roon,
 * et supprime le besoin de barre horizontale. Sa proposition règle en prime
 * la découvrabilité : une rangée coupée ne dit pas combien d'albums elle
 * cache. C'est un autre travail, et il reste à faire ; en attendant, une
 * rangée qui répond à la molette coûte peu et ne ferme aucune porte.
 *
 * ## Les trois pièges, et pourquoi ils comptent
 *
 * 1. 🔴 **Ne JAMAIS confisquer le défilement de la page.** Une rangée qui
 *    avale la molette une fois arrivée au bout rend la page impossible à
 *    faire défiler dès que le pointeur la survole. C'est le défaut le plus
 *    courant de ce geste, et le plus pénible. On ne prend l'événement que si
 *    la rangée peut RÉELLEMENT avancer dans ce sens.
 * 2. **Un geste horizontal de pavé tactile est déjà horizontal.** Quand
 *    `deltaX` est non nul, le navigateur fait le bon travail : on ne s'en
 *    mêle pas, sinon les deux s'additionnent et la rangée saute.
 * 3. **Une rangée qui ne déborde pas n'est pas une rangée qui défile.**
 *    `scrollWidth <= clientWidth` : rien à faire, et surtout rien à prendre.
 *
 * ## 🔴 #1327 — le piège 1 était MAL GARDÉ, et la page y est restée
 *
 * Gros Bidon (Didier), fil 1858, 20/09/2026, vingt-deux heures après la
 * livraison de ce geste :
 *
 * > « Si on place la souris au niveau d'un sous-titre comme albums favoris,
 * > c'est cette zone qui se déplace vers la gauche et le défilement vers le
 * > bas avec la molette n'est pas actif. […] Donc la zone permettant le
 * > défilement vers le bas est très étroite. »
 *
 * La garde écrite ne couvrait que le BOUT DE COURSE. Une rangée éditoriale
 * déborde presque toujours : au milieu de sa course — c'est-à-dire là où le
 * pointeur se trouve la quasi-totalité du temps — elle prenait la molette,
 * et la page ne bougeait plus. La règle d'en-tête était donc violée dans le
 * cas COURANT, et respectée seulement dans le cas rare.
 *
 * Deux verrous la font désormais tenir, et aucun des deux ne retire le geste
 * demandé par Pascal :
 *
 * - **La page passe d'abord.** Tant qu'un défilement vertical est possible
 *   sous le pointeur, il appartient à la page (`pagePeutDefiler`). La rangée
 *   ne reprend la molette verticale que là où il n'y a rien à confisquer :
 *   une page qui tient tout entière à l'écran, ou déjà en butée dans ce
 *   sens. `Maj` + molette — l'idiome universel du défilement horizontal —
 *   la lui rend en toutes circonstances, comme les flèches du clavier.
 * - **Un geste en cours ne se vole pas** (`VERROU_VERTICAL_MS`). C'est le
 *   point 4 de Didier : « si on arrive à lancer un défilement vers le bas et
 *   que la souris tombe sur une zone des sous-titres, ce sont ces derniers
 *   qui parfois se déplacent ». Chaque événement était jugé isolément ; une
 *   rangée qui passe sous le pointeur pendant l'inertie prenait la main. Le
 *   même piège avait déjà été payé dans `partages/NowPlaying.svelte`
 *   (`NP_WHEEL_RESET_MS`) — on emprunte sa méthode.
 */

/** De combien une flèche déplace la rangée. Une vignette et sa gouttière. */
export const PAS_FLECHE = 220;

/**
 * Combien de temps un défilement vertical reste « en cours » — #1327.
 *
 * En dessous de ce délai depuis le dernier événement laissé à la page, aucune
 * rangée ne reprend la molette : le geste appartient à qui l'a commencé.
 */
export const VERROU_VERTICAL_MS = 220;

/** Ce que la rangée doit savoir de son entourage pour trancher — #1327. */
export type ContexteMolette = {
  /** La page peut-elle encore avancer dans ce sens sous le pointeur ? */
  pageDefile: boolean;
  /** Horodatage du dernier événement laissé à la page (0 = aucun). */
  dernierVertical: number;
  /** Maintenant, en millisecondes. */
  maintenant: number;
};

/**
 * La rangée peut-elle avancer de `delta` dans ce sens ?
 *
 * 🔴 L'ARRONDI VA VERS LE BORD QU'ON TESTE, et pas toujours dans le même sens.
 * Un défilement en cours rend des positions fractionnaires — 599,6 au bord
 * droit, 0,4 au bord gauche — et un arrondi unique se trompe forcément d'un
 * côté : `Math.ceil(0,4)` vaut 1, donc « il reste de la place à gauche »,
 * alors qu'il n'en reste pas. La rangée prendrait l'événement sans bouger, et
 * la page resterait figée sous le pointeur — exactement le défaut que cette
 * fonction existe pour éviter. On arrondit donc VERS le bord : au plancher à
 * gauche, au plafond à droite.
 */
export function peutDefiler(el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>, delta: number): boolean {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return false;
  return delta < 0 ? Math.floor(el.scrollLeft) > 0 : Math.ceil(el.scrollLeft) < max;
}

/**
 * Un ancêtre de la rangée peut-il encore défiler VERTICALEMENT de `delta` ?
 * — #1327.
 *
 * 🔴 On ne lit PAS `overflow-y` : `getComputedStyle` coûte à chaque cran de
 * molette, et son absence ne peut se tromper que dans le sens sûr. Un ancêtre
 * en `overflow:hidden` dont le contenu déborde sera compté comme défilant :
 * la rangée laissera alors passer un événement qu'elle aurait pu prendre —
 * une occasion manquée, jamais une page confisquée. L'erreur inverse, elle,
 * est précisément le défaut de ce ticket.
 *
 * Le `> 1` absorbe les sous-pixels : un ancêtre dont `scrollHeight` dépasse
 * `clientHeight` d'un demi-pixel d'arrondi ne défile pas pour autant.
 */
export function pagePeutDefiler(el: Pick<HTMLElement, 'parentElement'>, delta: number): boolean {
  if (!delta) return false;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const max = p.scrollHeight - p.clientHeight;
    if (max <= 1) continue;
    if (delta < 0 ? Math.floor(p.scrollTop) > 0 : Math.ceil(p.scrollTop) < max) return true;
  }
  return false;
}

/**
 * Ce que la molette doit faire : le déplacement horizontal, ou `0` pour
 * « laisser passer ».
 *
 * Rend `0` — donc « ne prends pas l'événement » — dans les trois cas du
 * commentaire d'en-tête, et dans les deux verrous de #1327.
 *
 * 🔴 `ctx` est FACULTATIF, et son absence rend la règle d'avant #1327 : sans
 * entourage connu, on ne peut rien confisquer à personne. C'est ce qui permet
 * aux témoins de #1137 de juger la conversion seule, sans la décrire deux
 * fois.
 */
export function deplacementMolette(
  el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>,
  e: Pick<WheelEvent, 'deltaX' | 'deltaY'> & { shiftKey?: boolean },
  ctx?: ContexteMolette,
): number {
  if (e.deltaX !== 0) return 0;
  const d = e.deltaY;
  if (!d) return 0;
  if (!peutDefiler(el, d)) return 0;
  // `Maj` + molette : la demande est explicite, elle passe avant tout verrou.
  if (e.shiftKey) return d;
  if (!ctx) return d;
  // Un geste vertical en cours ne se vole pas (point 4 de Didier).
  if (ctx.maintenant - ctx.dernierVertical < VERROU_VERTICAL_MS) return 0;
  // Et tant que la page peut avancer, la molette verticale est à elle.
  if (ctx.pageDefile) return 0;
  return d;
}

/**
 * L'action Svelte : `use:defilementHorizontal` sur la rangée.
 *
 * Elle rend aussi la rangée atteignable au clavier — c'est l'autre moitié de
 * la demande de Pascal (« les touches fléchées ») — sans voler le focus :
 * `tabindex` n'est posé que si l'appelant ne l'a pas déjà fait.
 */
export function defilementHorizontal(el: HTMLElement) {
  /**
   * Quand la page a reçu son dernier événement. 🔴 Une variable de fermeture,
   * une par rangée : deux rangées voisines ne se partagent pas un geste.
   */
  let dernierVertical = 0;
  const molette = (e: WheelEvent) => {
    const maintenant = Date.now();
    const d = deplacementMolette(el, e, {
      pageDefile: pagePeutDefiler(el, e.deltaY),
      dernierVertical,
      maintenant,
    });
    if (!d) {
      // L'événement repart à la page : le geste vertical est EN COURS, et la
      // rangée ne doit plus le lui reprendre avant qu'il s'éteigne — y
      // compris quand c'est le bout de course qui vient de le relâcher.
      if (e.deltaY) dernierVertical = maintenant;
      return;                  // la page garde son défilement
    }
    e.preventDefault();
    el.scrollBy({ left: d, behavior: 'auto' });
  };
  const clavier = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? PAS_FLECHE : e.key === 'ArrowLeft' ? -PAS_FLECHE : 0;
    if (!d || !peutDefiler(el, d)) return;
    e.preventDefault();
    el.scrollBy({ left: d, behavior: 'smooth' });
  };
  // `passive: false` : sans lui le navigateur refuse `preventDefault()` sur
  // un `wheel`, et la page défilerait EN PLUS de la rangée.
  el.addEventListener('wheel', molette, { passive: false });
  el.addEventListener('keydown', clavier);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  return {
    destroy() {
      el.removeEventListener('wheel', molette);
      el.removeEventListener('keydown', clavier);
    },
  };
}
