import { tick } from 'svelte';

export interface TrancheAlbums {
  debut: number;
  fin: number;
  avant: number;
  apres: number;
}

/** Fenêtre de lignes complètes : sa taille ne croît pas avec un saut A–Z. */
export function trancheAlbums(total: number, position: number, vue: number, colonnes: number, pas: number, espace: number): TrancheAlbums {
  if (total <= 600) return { debut: 0, fin: total, avant: 0, apres: 0 };
  const cols = Math.max(1, colonnes);
  const hauteur = Math.max(1, pas);
  const lignes = Math.ceil(total / cols);
  const visibles = Math.max(1, Math.ceil(vue / hauteur));
  const marge = Math.max(2, Math.ceil(100 / cols));
  const premiere = Math.min(lignes - 1, Math.max(0, Math.floor(position / hauteur)));
  const debut = Math.max(0, premiere - marge);
  const fin = Math.min(lignes, Math.max(debut + Math.ceil(200 / cols), premiere + visibles + marge));
  return {
    debut: debut * cols,
    fin: Math.min(total, fin * cols),
    // Les cales occupent une ligne/colonne : le gap adjacent existe déjà.
    avant: debut ? Math.max(0, debut * hauteur - espace) : 0,
    apres: fin < lignes ? Math.max(0, (lignes - fin) * hauteur - espace) : 0,
  };
}

interface Options {
  total: number;
  /**
   * web#3189 — la taille des pochettes choisie au curseur. L'action ne la lit
   * pas : elle n'est là que pour que Svelte rappelle `update()` quand elle
   * change. Le cadre ne change pas de taille (aucun `ResizeObserver` ne le
   * voit), mais les colonnes et la hauteur des rangées, si : la tranche et les
   * cales sont alors remesurées.
   */
  taille?: number | null;
  mode: string;
  surFenetre: (tranche: TrancheAlbums) => void;
  surPret: (aller: ((index: number) => Promise<void>) | undefined) => void;
}

/**
 * Deux cales conservent la longueur du défilement ; seuls les albums proches
 * sont montés.
 *
 * tune-web-client#3183 (fils 2879 et 2886) — la version de la rc12 mesurait le
 * pas sur la PREMIÈRE case montée (vide ou pleine, elle change à chaque
 * glissement de la tranche), rééchelonnait `scrollTop` (`*=`) à chaque
 * changement de pas, puis le corrigeait encore après le rendu. Sous Firefox,
 * où le défilement avance sur un autre fil (APZ), chaque écriture absolue de
 * `scrollTop` reprend le geste en cours : la grille cessait d'avancer vers
 * 180-200 albums, revenait en arrière, et la boucle correction → `scroll` →
 * nouvelle mesure pouvait ne plus s'arrêter. Désormais :
 *
 * - le pas est mesuré sur une vignette PLEINE et retenu tant que la grille
 *   (mode, colonnes, largeur) ne change pas ;
 * - la tranche suit la rangée de la première carte EN VUE, lue dans le DOM,
 *   et non `scrollTop / pas` : une estimation fausse des cales ne la fait plus
 *   dériver ;
 * - l'écart entre les rangées réelles et l'estimation est rattrapé par la
 *   hauteur de la cale du haut, jamais par `scrollTop` pendant le défilement ;
 *   seul le retour au tout début (plus de cale) écrit `scrollTop`, une fois,
 *   et l'écho de cette écriture ne relance rien (garde anti-boucle) ;
 * - une page qui arrive au-dessus du cadre (cases vides devenues vignettes)
 *   ne fait plus reculer la grille : la position rétablie est celle d'avant
 *   son arrivée.
 */
export function fenetreAlbumsPaginee(el: HTMLElement, options: Options) {
  let o = options;
  let detruit = false;
  let trame = 0;
  let cible: number | null = null;
  let revision = 0;
  /** Le pas retenu (hauteur d'une rangée + écart), et la grille qu'il mesure. */
  let pas: number | null = null;
  let pasSurCaseVide = true;
  let clePas = '';
  /** Écart cumulé entre les rangées réellement quittées et l'estimation. */
  let decalageAvant = 0;
  let base: TrancheAlbums | null = null;
  /** La valeur de `scrollTop` que NOUS venons d'écrire (son écho est ignoré). */
  let echo: number | null = null;
  let correctionsDeSuite = 0;
  /**
   * La carte en vue et son décalage, tels que laissés par le dernier calcul.
   * Une page qui arrive (`update`) peut avoir déjà changé la hauteur des
   * rangées au-dessus d'elle : c'est cette position-là qu'on rétablit, pas
   * celle relue après coup. Oubliée dès que l'utilisateur défile.
   */
  let ancreRetenue: { index: number; decalage: number } | null = null;

  // Les cales restent des estimations. Une nouvelle première rangée peut
  // avoir une autre hauteur : conserver la carte visible, pas son ancien
  // scrollTop calculé avec une hauteur devenue différente.
  const lireAncre = (horizontal: boolean) => {
    const cadre = el.getBoundingClientRect();
    for (const carte of el.querySelectorAll<HTMLElement>('[data-i]')) {
      const rect = carte.getBoundingClientRect();
      const debut = horizontal ? rect.left - cadre.left : rect.top - cadre.top;
      const fin = horizontal ? rect.right - cadre.left : rect.bottom - cadre.top;
      const vue = horizontal ? cadre.width : cadre.height;
      if (fin > 0 && debut < vue) return { index: Number(carte.dataset.i), decalage: debut };
    }
    return null;
  };
  const mesurer = () => {
    const style = getComputedStyle(el);
    const horizontal = o.mode === 'carousel';
    const colonnes = o.mode === 'grid' ? Math.max(1, style.gridTemplateColumns.split(/\s+/).filter(Boolean).length) : 1;
    const espace = parseFloat(horizontal ? style.columnGap : style.rowGap) || 0;
    const cle = `${o.mode}|${colonnes}|${horizontal ? el.clientHeight : el.clientWidth}`;
    if (cle !== clePas) {
      clePas = cle;
      pas = null;
      pasSurCaseVide = true;
      decalageAvant = 0;
    }
    if (pas == null || pasSurCaseVide) {
      // Une case vide (page pas encore arrivée) n'a pas la hauteur d'une
      // vignette : elle ne sert qu'en attendant la première vignette pleine.
      const pleine = el.querySelector<HTMLElement>('[data-i]:not(.sq)');
      const carte = pleine ?? el.querySelector<HTMLElement>('[data-i]');
      const taille = horizontal ? carte?.offsetWidth : carte?.offsetHeight;
      if (taille) {
        pas = taille + espace;
        pasSurCaseVide = !pleine;
      } else if (pas == null) {
        pas = (horizontal ? 200 : (o.mode === 'list' ? 56 : 210)) + espace;
      }
    }
    return { horizontal, colonnes, espace, pas: pas as number,
      vue: (horizontal ? el.clientWidth : el.clientHeight) || 600 };
  };
  type Geometrie = ReturnType<typeof mesurer>;
  /**
   * La rangée en haut du cadre quand aucune carte n'y est (ascenseur tiré
   * dans une cale) : comptée depuis le bord des cartes montées, au pas.
   * `null` sans mise en page mesurable (témoins jsdom) : on retombe alors
   * sur `scrollTop`.
   */
  const rangeeHorsCartes = (g: Geometrie): number | null => {
    const cartes = el.querySelectorAll<HTMLElement>('[data-i]');
    const cadre = el.getBoundingClientRect();
    if (!cartes.length || cadre.height <= 0) return null;
    const premiere = cartes[0];
    const derniere = cartes[cartes.length - 1];
    const haut = premiere.getBoundingClientRect();
    const bas = derniere.getBoundingClientRect();
    if (haut.top >= cadre.bottom) {
      return Math.max(0, Math.floor(Number(premiere.dataset.i) / g.colonnes) - Math.ceil((haut.top - cadre.top) / g.pas));
    }
    if (bas.bottom <= cadre.top) {
      return Math.floor(Number(derniere.dataset.i) / g.colonnes) + 1
        + Math.max(0, Math.floor((cadre.top - bas.bottom - g.espace) / g.pas));
    }
    return null;
  };
  const poser = (t: TrancheAlbums, g: Geometrie) => {
    base = t;
    if (!t.debut || g.horizontal) decalageAvant = 0;
    o.surFenetre(t.debut && !g.horizontal ? { ...t, avant: Math.max(0, t.avant + decalageAvant) } : t);
  };
  /** Après le rendu : la carte en vue reste où elle était. */
  const recaler = (ancre: { index: number; decalage: number }, tour: number) => {
    if (detruit || tour !== revision || cible != null || !base) return;
    const carte = el.querySelector<HTMLElement>(`[data-i="${ancre.index}"]`);
    if (!carte) { ancreRetenue = null; return; }
    ancreRetenue = ancre;
    const delta = carte.getBoundingClientRect().top - el.getBoundingClientRect().top - ancre.decalage;
    if (Math.abs(delta) <= 0.5) return;
    if (base.debut && base.avant + decalageAvant - delta >= 0) {
      // La cale du haut absorbe l'écart : le contenu revient en place sans
      // toucher à `scrollTop`, donc sans reprendre le geste en cours.
      decalageAvant -= delta;
      o.surFenetre({ ...base, avant: base.avant + decalageAvant });
      return;
    }
    // Plus de cale au-dessus (retour au début) : une écriture, une seule de
    // suite tant que l'utilisateur n'a pas défilé lui-même.
    if (correctionsDeSuite >= 1) return;
    correctionsDeSuite++;
    el.scrollTop += delta;
    echo = el.scrollTop;
  };
  const calculer = (ancreImposee: { index: number; decalage: number } | null = null) => {
    trame = 0;
    if (detruit) return;
    const g = mesurer();
    const tour = ++revision;
    let ancre: { index: number; decalage: number } | null = null;
    let position: number;
    if (cible != null) {
      position = Math.floor(cible / g.colonnes) * g.pas;
    } else if (g.horizontal) {
      position = el.scrollLeft;
    } else {
      ancre = o.total > 600 ? (ancreImposee ?? lireAncre(false)) : null;
      const rangee = ancre ? Math.floor(ancre.index / g.colonnes) : (o.total > 600 ? rangeeHorsCartes(g) : null);
      position = rangee == null ? el.scrollTop : rangee * g.pas;
    }
    poser(trancheAlbums(o.total, position, g.vue, g.colonnes, g.pas, g.espace), g);
    if (ancre) {
      const a = ancre;
      void tick().then(() => recaler(a, tour));
    }
  };
  const planifier = () => {
    if (!trame && !detruit) trame = requestAnimationFrame(() => calculer());
  };
  const aller = async (index: number) => {
    decalageAvant = 0;
    ancreRetenue = null;
    cible = Math.max(0, Math.min(o.total - 1, index));
    calculer();
    await tick();
    if (detruit || cible == null) return;
    const g = mesurer();
    const carte = el.querySelector<HTMLElement>(`[data-i="${cible}"]`);
    const rect = carte?.getBoundingClientRect();
    const cadre = el.getBoundingClientRect();
    const position = rect && rect.height > 0 && !g.horizontal
      ? el.scrollTop + rect.top - cadre.top
      : Math.floor(cible / g.colonnes) * g.pas;
    if (g.horizontal) el.scrollLeft = position; else el.scrollTop = position;
    cible = null;
  };
  const defiler = () => {
    // L'écho de notre propre correction : la tranche est déjà juste.
    if (echo != null && Math.abs(el.scrollTop - echo) < 1) { echo = null; return; }
    echo = null;
    correctionsDeSuite = 0;
    ancreRetenue = null;
    planifier();
  };
  o.surPret(aller);
  el.addEventListener('scroll', defiler, { passive: true });
  window.addEventListener('resize', planifier);
  const taille = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(planifier);
  taille?.observe(el);
  calculer();
  return {
    update(n: Options) {
      if (o.mode !== n.mode) ancreRetenue = null;
      o = n;
      // Les données peuvent grandir après un filtre ou l’arrivée des favoris.
      // Rendre leur nouvelle tranche dans ce cycle, sans attendre une frame.
      calculer(ancreRetenue);
      planifier();
    },
    destroy() {
      detruit = true;
      cancelAnimationFrame(trame);
      taille?.disconnect();
      el.removeEventListener('scroll', defiler);
      window.removeEventListener('resize', planifier);
      o.surPret(undefined);
    },
  };
}
