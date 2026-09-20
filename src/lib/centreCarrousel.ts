/**
 * LA GÉOMÉTRIE DU CARROUSEL, ET QUEL ALBUM EST « AU MILIEU » — #929.
 *
 * Bertrand, 20/09/2026, après avoir regardé le carrousel à l'écran :
 *
 * > « Il faudrait mettre en plus gros l'album du milieu et actif. »
 *
 * C'est le geste du cover-flow qu'il avait en tête le 19/08, quand il
 * écrivait que « le plaisir vient des pochettes en grand ». La pochette
 * centrale grandit, et c'est le DÉFILEMENT qui décide laquelle — pas un
 * clic, pas un survol : on fait glisser la bande, et l'album qui passe au
 * milieu prend la vedette.
 *
 * Sa capture, prise sur un **27 pouces**, a montré le second défaut : une
 * bande de 260 px perdue au tiers de la hauteur, avec du vide au-dessus et
 * au-dessous. Une largeur de pochette écrite en dur ne peut pas être juste à
 * la fois sur un portable et sur un 27 pouces — elle doit se DÉDUIRE de la
 * place réellement disponible.
 *
 * ## 🔴 UNE SEULE RANGÉE, PLUS GRANDE — pas deux rangées
 *
 * S'il reste de la hauteur, elle va dans la TAILLE des pochettes, jamais dans
 * un second rang. Une bande à deux rangs est une autre conception (c'est la
 * grille, qui existe déjà à côté) et ce n'est pas ce qui est demandé : un
 * cover-flow a une rangée et un album mis en avant.
 *
 * ## 🔴 Pourquoi un CALCUL, et pas une mesure par vignette
 *
 * La réserve posée le 19/08 tient toujours : « superbe sur cinquante albums
 * et hostile sur deux mille » — la bibliothèque de Bertrand en compte 4 338.
 * Chercher l'élément central en interrogeant le DOM (`getBoundingClientRect`
 * sur chaque vignette, ou un `IntersectionObserver` par carte) coûterait un
 * balayage de toute la liste à chaque cran de molette : c'est précisément
 * ainsi qu'un effet joli devient un écran pâteux.
 *
 * La rangée a un PAS CONSTANT — une vignette et sa gouttière —, donc la
 * position de défilement suffit à désigner l'album central par une division.
 * `indiceCentre` et `geometrieCarrousel` ne prennent que des NOMBRES : elles
 * ne peuvent pas, par construction, coûter plus cher sur 4 338 albums que sur
 * cinquante. C'est la garde, et c'est ce que les témoins mesurent.
 *
 * ## Les mesures de la rangée, à UN seul endroit
 *
 * La géométrie calculée ici est descendue au CSS en variables (`--ccw`,
 * `--ccg`, `--ccp`, `--cce`). Deux copies divergeraient au premier réglage de
 * largeur, et l'album désigné ne serait plus celui qui grandit — une panne
 * silencieuse, invisible aux tests qui ne regardent qu'un côté.
 */

/** Ce que le bloc de texte sous une pochette occupe : titre, artiste, qualité. */
export const HAUTEUR_TEXTE = 64;
/** Le retrait aux deux bouts de la rangée, aligné sur celui de la grille. */
export const MARGE_BORD = 30;
/** Un peu d'air au-dessus et au-dessous de la pochette agrandie. */
export const MARGE_VERTICALE = 16;
/**
 * Les bornes de la pochette.
 *
 * Le plancher évite qu'un portable ne rende un carrousel plus petit que la
 * grille (148 px) — il n'aurait alors plus de raison d'être. Le plafond évite
 * qu'un très grand écran ne rende une pochette grotesque : au-delà, on ne
 * parcourt plus une discothèque, on regarde une affiche.
 */
export const COTE_MIN = 150;
export const COTE_MAX = 640;
/**
 * Combien de pochettes doivent rester en vue, au moins.
 *
 * 🔴 C'EST CE QUI GARDE LE SENTIMENT DE BANDE. Bertrand l'a relevé comme le
 * point réussi de la première capture : « les pochettes sont coupées aux deux
 * bords, ce qui donne le sentiment que la bande continue ». La demi-pochette
 * du bout est donc une exigence, pas un reste : c'est pour elle que le compte
 * est fractionnaire.
 */
export const VISIBLES_MIN = 3.5;
/** De combien grandit la pochette centrale, au mieux. */
export const ECHELLE_MAX = 1.28;

/**
 * La taille de la fenêtre n'est pas encore connue — au tout premier rendu, ou
 * sous un moteur qui ne met rien en page. On prend alors la géométrie d'un
 * portable plutôt qu'une bande écrasée à zéro.
 */
export const REPLI = { largeur: 1280, hauteur: 470 };

export type GeometrieCarrousel = {
  /** Le côté d'une pochette, en pixels (elle est carrée). */
  cote: number;
  /** L'espace entre deux vignettes. */
  gouttiere: number;
  /** Le retrait aux deux bouts. */
  margeBord: number;
  /** Le facteur d'agrandissement de la pochette centrale. */
  echelle: number;
  /** D'un bord gauche de vignette au suivant. */
  pas: number;
  /** La hauteur d'une carte au repos, texte compris. */
  hauteurCarte: number;
  /** La hauteur occupée par la carte AGRANDIE — ce que la bande réclame. */
  hauteurBande: number;
  /** Combien de pochettes tiennent dans la largeur, demies comprises. */
  visibles: number;
};

/** La gouttière suit la pochette : elle doit absorber son agrandissement. */
function gouttierePour(cote: number, echelle: number): number {
  return Math.round(((echelle - 1) / 2) * cote) + 8;
}

/**
 * La géométrie de la bande pour une place donnée.
 *
 * 🔴 DEUX CONTRAINTES, ET C'EST LA PLUS SERRÉE QUI DÉCIDE.
 *
 *  - **La hauteur** : la carte AGRANDIE doit tenir dans la place verticale,
 *    sinon la pochette centrale serait rognée en haut et en bas — le défaut
 *    exact qu'un carrousel ne pardonne pas, puisque c'est elle qu'on regarde.
 *  - **La largeur** : `VISIBLES_MIN` pochettes doivent rester en vue. Sans
 *    cette borne, un grand écran haut et étroit rendrait deux pochettes
 *    géantes et plus aucune bande.
 *
 * Quand le plancher `COTE_MIN` l'emporte sur une fenêtre très basse, c'est
 * l'AGRANDISSEMENT qui cède, pas la pochette : mieux vaut un cover-flow
 * discret qu'une pochette centrale coupée.
 */
export function geometrieCarrousel(largeur: number, hauteur: number): GeometrieCarrousel {
  const L = largeur > 0 ? largeur : REPLI.largeur;
  const H = hauteur > 0 ? hauteur : REPLI.hauteur;

  const dispoH = Math.max(0, H - MARGE_VERTICALE);
  // Ce que la hauteur permet, l'agrandissement compris.
  const parHauteur = dispoH / ECHELLE_MAX - HAUTEUR_TEXTE;
  // Ce que la largeur permet, pour garder `VISIBLES_MIN` pochettes en vue.
  // `pas = cote·(1 + (E−1)/2) + 8`, d'où le `cote` maximal admissible.
  const parLargeur = (L / VISIBLES_MIN - 8) / (1 + (ECHELLE_MAX - 1) / 2);

  const cote = Math.round(
    Math.min(COTE_MAX, Math.max(COTE_MIN, Math.min(parHauteur, parLargeur))),
  );

  const hauteurCarte = cote + HAUTEUR_TEXTE;
  // Si le plancher a forcé une carte trop haute, l'agrandissement cède.
  const echelle = Math.max(
    1,
    Math.min(ECHELLE_MAX, Math.round((dispoH / hauteurCarte) * 100) / 100),
  );
  const gouttiere = gouttierePour(cote, echelle);
  const pas = cote + gouttiere;

  return {
    cote,
    gouttiere,
    margeBord: MARGE_BORD,
    echelle,
    pas,
    hauteurCarte,
    hauteurBande: Math.round(hauteurCarte * echelle),
    visibles: Math.round((L / pas) * 100) / 100,
  };
}

/** Deux géométries sont-elles la même ? Sert à ne pas re-rendre pour rien. */
export function memeGeometrie(a: GeometrieCarrousel, b: GeometrieCarrousel): boolean {
  return a.cote === b.cote && a.gouttiere === b.gouttiere && a.echelle === b.echelle;
}

/**
 * L'indice de l'album le plus proche du milieu de la fenêtre visible.
 *
 * Rend `-1` sur une rangée vide — il n'y a alors personne à mettre en avant —
 * et borne le résultat aux deux bouts : aux extrémités de la course, le
 * milieu géométrique de la fenêtre tombe en dehors de la bande, et sans
 * bornage l'effet disparaîtrait exactement là où l'on s'arrête le plus
 * souvent.
 */
export function indiceCentre(
  scrollLeft: number,
  clientWidth: number,
  nombre: number,
  geo: Pick<GeometrieCarrousel, 'cote' | 'pas' | 'margeBord'>,
): number {
  if (nombre <= 0) return -1;
  const milieu = scrollLeft + clientWidth / 2;
  // Le centre de la vignette `i` est à `margeBord + i·pas + cote/2`.
  const i = Math.round((milieu - geo.margeBord - geo.cote / 2) / geo.pas);
  return Math.min(nombre - 1, Math.max(0, i));
}

export type OptionsCentrage = {
  /** Combien d'albums la rangée porte en ce moment. */
  nombre: number;
  /** Appelé quand l'album central CHANGE, jamais autrement. */
  sur: (indice: number) => void;
  /** Appelé quand la géométrie de la bande CHANGE, jamais autrement. */
  surGeometrie: (g: GeometrieCarrousel) => void;
};

/**
 * `use:centrageCarrousel` — suit l'album central et la taille de la bande.
 *
 * Trois économies, et elles comptent sur une longue discothèque :
 *
 *  - **Une image par trame au plus.** Une molette rend des dizaines
 *    d'événements `scroll` par seconde ; sans `requestAnimationFrame`, chacun
 *    déclencherait un rendu. Les événements qui arrivent pendant qu'une trame
 *    est déjà armée sont absorbés.
 *  - **On ne prévient que si ça CHANGE.** Faire glisser la bande de dix
 *    pixels ne change pas l'album central : `sur` n'est pas rappelé, et
 *    Svelte n'a rien à refaire.
 *  - **Aucune vignette n'est interrogée.** Tout se déduit de `scrollLeft`,
 *    `clientWidth` et `clientHeight` du CONTENEUR : trois lectures, quel que
 *    soit le nombre d'albums.
 *
 * 🔴 `scroll` est écouté en `passive: true`. Ce geste ne prend jamais
 * l'événement — c'est `defilementHorizontal` qui décide de ce que devient la
 * molette, et lui seul (#1327). Deux gestionnaires qui se disputeraient
 * `preventDefault()` rendraient la règle « la page passe d'abord »
 * imprévisible.
 *
 * 🔴 LA HAUTEUR SE LIT SUR LA RANGÉE ELLE-MÊME, et c'est une leçon payée dans
 * le navigateur. Elle se lisait d'abord sur le PARENT — qui contient AUSSI le
 * rail A–Z couché sous la bande. La place annoncée était donc celle d'avant
 * que le rail ne prenne la sienne : mesuré sur un portable 1280 × 800, le
 * calcul recevait 401 px pour une bande qui n'en faisait que 362, et la
 * pochette centrale agrandie réclamait 397 px — elle était rognée en haut et
 * en bas par `overflow-y:hidden`, exactement le défaut qu'un carrousel ne
 * pardonne pas.
 *
 * La rangée s'étire pour remplir ce qui RESTE (`flex:1`), et sa hauteur ne
 * dépend d'aucune des variables qu'on calcule — les vignettes y sont centrées,
 * pas étirées. Il n'y a donc pas de boucle : sa hauteur EST la place
 * disponible, déjà nette de tout ce qui l'entoure.
 */
export function centrageCarrousel(el: HTMLElement, o: OptionsCentrage) {
  let nombre = o.nombre;
  let sur = o.sur;
  let surGeometrie = o.surGeometrie;
  /** `-2` : aucune valeur encore annoncée — `-1` est un résultat valide. */
  let dernier = -2;
  /** La place verticale réelle. Le parent n'est qu'un repli du premier rendu. */
  const hauteurDispo = () => el.clientHeight || el.parentElement?.clientHeight || 0;
  let geo = geometrieCarrousel(el.clientWidth, hauteurDispo());
  let trame = 0;

  const calculer = () => {
    trame = 0;
    const g = geometrieCarrousel(el.clientWidth, hauteurDispo());
    if (!memeGeometrie(g, geo)) {
      geo = g;
      surGeometrie(g);
    }
    const i = indiceCentre(el.scrollLeft, el.clientWidth, nombre, geo);
    if (i === dernier) return;
    dernier = i;
    sur(i);
  };
  const planifier = () => {
    if (trame) return;
    trame = requestAnimationFrame(calculer);
  };

  el.addEventListener('scroll', planifier, { passive: true });
  // La fenêtre change de taille, le milieu se déplace et les pochettes avec :
  // sans cela, la bande garderait la géométrie d'avant le redimensionnement.
  window.addEventListener('resize', planifier);
  /**
   * 🔴 ET LA RANGÉE ELLE-MÊME PEUT CHANGER SANS QUE LA FENÊTRE BOUGE : le rail
   * couché apparaît sous elle, la barre latérale se replie, la frise des
   * années s'ouvre. `resize` ne dit rien de tout cela, et la bande garderait
   * une géométrie calculée sur une place qu'elle n'a plus.
   *
   * Le repli silencieux est assumé : là où `ResizeObserver` n'existe pas
   * (jsdom, moteurs anciens), on garde la mesure d'ouverture et les
   * redimensionnements de fenêtre — jamais une erreur affichée pour un confort.
   */
  const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(planifier) : null;
  obs?.observe(el);
  // Tout de suite, et sans attendre un geste : à l'ouverture du mode, une
  // géométrie est déjà décidée et un album est déjà au milieu.
  surGeometrie(geo);
  calculer();

  return {
    update(n: OptionsCentrage) {
      nombre = n.nombre;
      sur = n.sur;
      surGeometrie = n.surGeometrie;
      // La liste a changé — un filtre, un tri : l'album central aussi, même
      // si la rangée n'a pas bougé d'un pixel.
      dernier = -2;
      calculer();
    },
    destroy() {
      if (trame) cancelAnimationFrame(trame);
      obs?.disconnect();
      el.removeEventListener('scroll', planifier);
      window.removeEventListener('resize', planifier);
    },
  };
}
