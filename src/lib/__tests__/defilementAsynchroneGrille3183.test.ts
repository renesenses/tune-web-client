// @vitest-environment jsdom
/**
 * QA 18/11 — banc de défilement ASYNCHRONE de la grille des Albums en pages
 * (tune-web-client#3183, corrigé par web#3186).
 *
 * Le bug Firefox (la grille cesse d'avancer vers 180-200 albums, recule, et
 * la boucle « recalcul → écriture de scrollTop → scroll → recalcul » ne
 * s'arrête plus) n'avait été attrapé par AUCUN test : les témoins de la
 * grille appelaient l'action de façon synchrone, avec un `scrollTop` qui ne
 * bouge que lorsqu'on l'écrit. Un vrai navigateur ne se comporte pas ainsi.
 * Ce banc reproduit, autour de la VRAIE action `fenetreAlbumsPaginee`, ce que
 * fait un navigateur à défilement asynchrone (Firefox APZ, et à un moindre
 * degré Chrome sur le fil du compositeur) :
 *
 * - le COMPOSITEUR fait avancer le défilement à chaque trame, pendant que la
 *   page calcule : `scrollTop` change ENTRE deux trames, sans que la page
 *   l'ait écrit ; une écriture de `scrollTop` par la page reprend la main sur
 *   le geste en cours, et le pas de défilement de cette trame est perdu ;
 * - l'évènement `scroll` arrive DÉCALÉ (deux trames après le mouvement), et
 *   plusieurs mouvements sont regroupés en un seul évènement ;
 * - une vignette qui vient d'être montée n'a pas encore sa hauteur : sa
 *   pochette se décode deux trames plus tard et la rangée grandit (décalage
 *   de mise en page sans aucun évènement) ;
 * - une case vide (page de 100 albums pas encore arrivée) est plus basse
 *   qu'une vignette ; sa page arrive quelques trames après qu'elle est vue ;
 * - le `ResizeObserver` du cadre ne prévient qu'avec trois trames de retard ;
 * - la taille des pochettes (curseur web#3189) change le nombre de colonnes
 *   en cours de route.
 *
 * Ce qui est exigé :
 *   1. pas de boucle : au repos, plus aucun recalcul ni évènement `scroll`,
 *      et pendant la descente, un nombre de recalculs borné par trame ;
 *   2. la tranche suit le défilement jusqu'au dernier album ;
 *   3. aucun retour en arrière : la première carte en vue ne recule jamais
 *      en descendant.
 *
 * Contre-épreuve (Shrek, 18/11) : sur le `main` d'avant web#3186, les deux
 * témoins qui changent la géométrie EN ROUTE (taille des pochettes, largeur
 * du cadre) étaient ROUGES — la grille cessait d'avancer (dernière carte en
 * vue 399 puis 699 sur 2 188). Avec web#3186, les cinq étaient VERTS. Le banc
 * a d'abord porté ces deux témoins en `it.fails` ; web#3186 fusionnée, ce
 * sont de simples `it`. Les deux témoins de descente simple passaient déjà
 * avant web#3186 dans ce banc : ils restent comme garde de non-régression.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fenetreAlbumsPaginee, type TrancheAlbums } from '../fenetreAlbumsPaginee';

const TOTAL = 2189;
const VUE = 820;
const LARGEUR = 1240;
const ESPACE = 20;
const TAILLE_PAGE = 100;
/** Trames entre le mouvement du compositeur et l'évènement `scroll`. */
const RETARD_SCROLL = 2;
/** Trames avant qu'une pochette montée soit décodée (hauteur finale). */
const RETARD_POCHETTE = 2;
/** Trames entre la vue d'une case vide et l'arrivée de sa page. */
const LATENCE_PAGE = 3;
/** Retard du `ResizeObserver` du cadre. */
const RETARD_RESIZE = 3;

interface Mesures {
  /** Appels de `surFenetre` (recalculs de la tranche). */
  recalculs: number;
  /** Évènements `scroll` délivrés. */
  scrolls: number;
  /** Trames où la page a écrit `scrollTop` elle-même. */
  ecritures: number;
}

function monterGrille(taillePochette = 180) {
  const el = document.createElement('div');
  document.body.append(el);
  let taille = taillePochette;
  let largeur = LARGEUR;
  const colonnes = () => Math.max(1, Math.floor((largeur + ESPACE) / (taille + ESPACE)));
  /** Hauteur finale d'une vignette : pochette + une ou deux lignes de titre. */
  const hauteurPleine = (i: number) => taille + ((i * 7919) % 5 === 0 ? 74 : 52);
  /** Avant le décodage de la pochette : le texte seul et une pochette réduite. */
  const hauteurProvisoire = () => Math.round(taille * 0.55) + 52;
  const hauteurVide = () => taille + 30;

  let tranche: TrancheAlbums = { debut: 0, fin: 200, avant: 0, apres: 0 };
  const pages = new Set<number>();
  const pagesDemandees = new Map<number, number>();
  /** Trame de montage de chaque vignette pleine actuellement dans le DOM. */
  const montees = new Map<number, number>();
  let trame = 0;
  const mesures: Mesures = { recalculs: 0, scrolls: 0, ecritures: 0 };

  // --- défilement : le compositeur, et ce que voit la page ---------------
  let compositeur = 0;
  let ecritDansLaTrame = false;
  /** Mouvements du compositeur pas encore signalés par un évènement `scroll`. */
  const scrollsEnRoute: number[] = [];
  let rafs: FrameRequestCallback[] = [];
  const observateurs: { rappel: ResizeObserverCallback; due: number | null }[] = [];

  // --- mise en page ---------------------------------------------------------
  type Boite = { top: number; hauteur: number };
  let boites = new Map<Element, Boite>();
  let hauteurTotale = 0;
  const pleine = (i: number) => pages.has(Math.floor(i / TAILLE_PAGE));
  const hauteurCase = (i: number) => {
    if (!pleine(i)) return hauteurVide();
    const m = montees.get(i);
    return m != null && trame - m < RETARD_POCHETTE ? hauteurProvisoire() : hauteurPleine(i);
  };
  const borner = (v: number) => Math.max(0, Math.min(v, Math.max(0, hauteurTotale - VUE)));
  const disposer = () => {
    boites = new Map();
    let y = 0;
    let premiere = true;
    const rangee = (h: number, elements: Element[]) => {
      if (!premiere) y += ESPACE;
      premiere = false;
      for (const e of elements) boites.set(e, { top: y, hauteur: h });
      y += h;
    };
    const enfants = [...el.children] as HTMLElement[];
    const c = colonnes();
    for (let k = 0; k < enfants.length;) {
      if (enfants[k].classList.contains('cale-paginee')) {
        rangee(Number(enfants[k].dataset.h), [enfants[k]]);
        k++;
        continue;
      }
      const ligne: HTMLElement[] = [];
      while (k < enfants.length && ligne.length < c && !enfants[k].classList.contains('cale-paginee')) ligne.push(enfants[k++]);
      rangee(Math.max(...ligne.map((x) => hauteurCase(Number(x.dataset.i)))), ligne);
    }
    hauteurTotale = y;
    // Le navigateur borne le défilement quand le contenu raccourcit.
    compositeur = borner(compositeur);
  };
  const rendre = () => {
    const avant = new Set(montees.keys());
    el.replaceChildren();
    const cale = (h: number) => {
      if (h <= 0) return;
      const d = document.createElement('div');
      d.className = 'cale-paginee';
      d.dataset.h = String(h);
      el.append(d);
    };
    cale(tranche.avant);
    const presentes = new Set<number>();
    for (let i = tranche.debut; i < tranche.fin; i++) {
      const d = document.createElement('div');
      d.className = pleine(i) ? 'card' : 'card sq';
      d.dataset.i = String(i);
      if (pleine(i)) {
        presentes.add(i);
        // Une vignette DÉJÀ montée garde son image décodée ; une nouvelle
        // repart d'une hauteur provisoire.
        if (!avant.has(i)) montees.set(i, trame);
      }
      Object.defineProperty(d, 'offsetHeight', { get: () => boites.get(d)?.hauteur ?? 0 });
      Object.defineProperty(d, 'offsetWidth', { get: () => taille });
      d.getBoundingClientRect = () => {
        const b = boites.get(d) ?? { top: 0, hauteur: 0 };
        const top = b.top - compositeur;
        return { top, bottom: top + b.hauteur, left: 0, right: taille, height: b.hauteur, width: taille, x: 0, y: top, toJSON() {} } as DOMRect;
      };
      el.append(d);
    }
    for (const i of [...montees.keys()]) if (!presentes.has(i)) montees.delete(i);
    cale(tranche.apres);
    disposer();
  };

  Object.defineProperty(el, 'scrollTop', {
    // La page lit la position du compositeur, qui a pu avancer depuis la
    // trame précédente sans aucune écriture de sa part.
    get: () => compositeur,
    set: (v: number) => {
      const b = borner(v);
      ecritDansLaTrame = true;
      if (b !== compositeur) { compositeur = b; scrollsEnRoute.push(trame); }
    },
  });
  Object.defineProperty(el, 'scrollLeft', { get: () => 0, set: () => {} });
  Object.defineProperty(el, 'clientHeight', { get: () => VUE });
  Object.defineProperty(el, 'clientWidth', { get: () => largeur });
  Object.defineProperty(el, 'scrollHeight', { get: () => hauteurTotale });
  el.getBoundingClientRect = () => ({ top: 0, bottom: VUE, left: 0, right: largeur, height: VUE, width: largeur, x: 0, y: 0, toJSON() {} }) as DOMRect;

  const styleOrigine = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((cible: Element, pseudo?: string | null) => {
    if (cible !== el) return styleOrigine(cible, pseudo);
    return {
      gridTemplateColumns: Array(colonnes()).fill(`${taille}px`).join(' '),
      rowGap: `${ESPACE}px`,
      columnGap: `${ESPACE}px`,
    } as unknown as CSSStyleDeclaration;
  });
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { rafs.push(f); return rafs.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class {
    private o: { rappel: ResizeObserverCallback; due: number | null };
    constructor(rappel: ResizeObserverCallback) { this.o = { rappel, due: null }; observateurs.push(this.o); }
    observe() {}
    unobserve() {}
    disconnect() { const k = observateurs.indexOf(this.o); if (k >= 0) observateurs.splice(k, 1); }
  });

  let allerVers: ((index: number) => Promise<void>) | undefined;
  const options = () => ({
    total: TOTAL,
    mode: 'grid',
    taille,
    surFenetre: (t: TrancheAlbums) => {
      mesures.recalculs++;
      if (t.debut !== tranche.debut || t.fin !== tranche.fin || t.avant !== tranche.avant || t.apres !== tranche.apres) {
        tranche = t;
        rendre();
      }
    },
    surPret: (a: ((index: number) => Promise<void>) | undefined) => { allerVers = a; },
  });
  const microtaches = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };

  rendre();
  const action = fenetreAlbumsPaginee(el, options());

  const enVue = () => [...el.querySelectorAll<HTMLElement>('[data-i]')]
    .filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < VUE; })
    .map((c) => Number(c.dataset.i));

  /** Une trame du navigateur ; `geste` : ce que le doigt fait défiler pendant cette trame. */
  const jouerTrame = async (geste = 0) => {
    trame++;
    // 1. Évènements `scroll` en retard : un seul pour tous les mouvements dus.
    const dus = scrollsEnRoute.filter((t) => trame - t >= RETARD_SCROLL);
    if (dus.length) {
      scrollsEnRoute.splice(0, scrollsEnRoute.length, ...scrollsEnRoute.filter((t) => trame - t < RETARD_SCROLL));
      mesures.scrolls++;
      el.dispatchEvent(new Event('scroll'));
    }
    // 2. Le `ResizeObserver` en retard.
    for (const o of observateurs) if (o.due != null && o.due <= trame) { o.due = null; o.rappel([], {} as ResizeObserver); }
    // 3. Les rappels d'animation, puis les microtâches (le `tick` de Svelte).
    ecritDansLaTrame = false;
    const lot = rafs;
    rafs = [];
    for (const f of lot) f(trame * 16);
    await microtaches();
    // 4. Les pochettes montées il y a RETARD_POCHETTE trames se décodent : la
    //    rangée grandit, sans évènement.
    if ([...montees.values()].some((m) => trame - m === RETARD_POCHETTE)) disposer();
    // 5. Les cases vides proches demandent leur page ; les pages dues arrivent
    //    et la grille repasse par `update()`, comme Svelte.
    for (const c of el.querySelectorAll<HTMLElement>('[data-i].sq')) {
      const r = c.getBoundingClientRect();
      if (r.bottom < -VUE / 2 || r.top > VUE * 1.5) continue;
      const p = Math.floor(Number(c.dataset.i) / TAILLE_PAGE);
      if (!pagesDemandees.has(p)) pagesDemandees.set(p, trame + LATENCE_PAGE);
    }
    let arrivee = false;
    for (const [p, due] of pagesDemandees) if (due <= trame && !pages.has(p)) { pages.add(p); arrivee = true; }
    if (arrivee) {
      rendre();
      action.update(options());
      await microtaches();
    }
    // 6. Le compositeur : le geste de cette trame ne compte que si la page n'a
    //    pas écrit `scrollTop` (l'écriture reprend la main sur le geste).
    if (ecritDansLaTrame) mesures.ecritures++;
    else if (geste) {
      const b = borner(compositeur + geste);
      if (b !== compositeur) { compositeur = b; scrollsEnRoute.push(trame); }
    }
  };

  return {
    el,
    mesures,
    jouerTrame,
    premiere: () => { const v = enVue(); return v.length ? Math.min(...v) : null; },
    derniere: () => { const v = enVue(); return v.length ? Math.max(...v) : null; },
    aller: () => allerVers,
    /** Curseur de taille des pochettes (web#3189) : nouvelles colonnes, `update()`. */
    changerTaille: async (t: number) => { taille = t; rendre(); action.update(options()); await microtaches(); },
    /** Le cadre change de largeur (barre latérale repliée) : le `ResizeObserver` prévient en retard. */
    changerLargeur: (l: number) => { largeur = l; rendre(); for (const o of observateurs) o.due = trame + RETARD_RESIZE; },
    detruire: () => { action.destroy(); el.remove(); },
  };
}

type Grille = ReturnType<typeof monterGrille>;

/** Trames sans aucune avance au-delà desquelles la grille est déclarée bloquée. */
const BLOCAGE = 150;

/**
 * Défile de `geste` px par trame jusqu'à `fin()` ; relève le pire recul et le
 * pire nombre de recalculs par trame. S'arrête aussi quand la grille n'avance
 * plus depuis `BLOCAGE` trames : c'est le bug (« la grille cesse d'avancer »),
 * inutile de brûler le reste du budget.
 */
async function defiler(g: Grille, geste: number, fin: () => boolean, budget: number) {
  let recul = 0;
  let pireParTrame = 0;
  let precedente = g.premiere();
  let meilleure = precedente ?? 0;
  let sansAvance = 0;
  let n = 0;
  for (; n < budget && !fin() && sansAvance < BLOCAGE; n++) {
    const avant = g.mesures.recalculs;
    await g.jouerTrame(geste);
    pireParTrame = Math.max(pireParTrame, g.mesures.recalculs - avant);
    const p = g.premiere();
    if (p != null && precedente != null) recul = Math.max(recul, geste > 0 ? precedente - p : p - precedente);
    if (p != null) precedente = p;
    const avance = geste > 0 ? (p ?? 0) > meilleure : (p ?? 0) < meilleure;
    if (avance) { meilleure = p ?? meilleure; sansAvance = 0; } else sansAvance++;
  }
  return { recul, pireParTrame, trames: n };
}

/** Laisse arriver ce qui est en vol, puis compte ce qui bouge encore au repos. */
async function auRepos(g: Grille, attente = 20, mesure = 40) {
  for (let n = 0; n < attente; n++) await g.jouerTrame();
  const { recalculs, scrolls } = g.mesures;
  for (let n = 0; n < mesure; n++) await g.jouerTrame();
  return { recalculs: g.mesures.recalculs - recalculs, scrolls: g.mesures.scrolls - scrolls };
}

describe('grille des Albums en pages sous défilement asynchrone (#3183, Firefox/APZ)', () => {
  let g: Grille | null = null;
  afterEach(() => { g?.detruire(); g = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('descend du premier au dernier album, sans recul ni boucle', async () => {
    g = monterGrille();
    await auRepos(g);
    const r = await defiler(g, 110, () => g!.derniere() === TOTAL - 1, 6_000);
    expect(
      { derniere: g.derniere(), recul: r.recul },
      `la tranche n'a pas suivi (${r.trames} trames, ${g.mesures.ecritures} écritures de scrollTop)`,
    ).toEqual({ derniere: TOTAL - 1, recul: 0 });
    // Une trame = au plus un recalcul par cause (rAF, update d'une page).
    expect(r.pireParTrame, 'recalculs dans une seule trame').toBeLessThanOrEqual(3);
    expect(await auRepos(g), 'au repos en bas de la grille').toEqual({ recalculs: 0, scrolls: 0 });
  }, 120_000);

  it('s’arrête net au repos à chaque étape de la descente (pas de boucle de recalcul)', async () => {
    g = monterGrille();
    await auRepos(g);
    for (const arret of [150, 190, 420, 1100, 1900]) {
      const r = await defiler(g, 110, () => (g!.premiere() ?? 0) >= arret, 3_000);
      expect(g.premiere() ?? 0, `la grille n'a pas atteint l'album ${arret}`).toBeGreaterThanOrEqual(arret);
      expect(r.recul, `recul avant l'album ${arret}`).toBe(0);
      expect(await auRepos(g), `au repos vers l'album ${arret}`).toEqual({ recalculs: 0, scrolls: 0 });
    }
  }, 120_000);

  it('la taille des pochettes change en route (web#3189) : la grille repart et va au bout', async () => {
    g = monterGrille(180);
    await auRepos(g);
    await defiler(g, 110, () => (g!.premiere() ?? 0) >= 500, 3_000);
    await g.changerTaille(240);
    await auRepos(g);
    const r = await defiler(g, 110, () => g!.derniere() === TOTAL - 1, 8_000);
    expect({ derniere: g.derniere(), recul: r.recul }).toEqual({ derniere: TOTAL - 1, recul: 0 });
    expect(await auRepos(g)).toEqual({ recalculs: 0, scrolls: 0 });
  }, 120_000);

  it('le cadre change de largeur, son ResizeObserver prévient en retard : ni recul ni boucle', async () => {
    g = monterGrille(180);
    await auRepos(g);
    await defiler(g, 110, () => (g!.premiere() ?? 0) >= 700, 3_000);
    g.changerLargeur(980);
    // Le passage de 6 à 5 colonnes redistribue les rangées : la première carte
    // en vue peut changer de quelques albums SANS défilement. Le recul ne se
    // mesure qu'une fois le ResizeObserver passé et la grille reposée.
    for (let n = 0; n < RETARD_RESIZE + 5; n++) await g.jouerTrame();
    const r = await defiler(g, 110, () => g!.derniere() === TOTAL - 1, 8_000);
    expect({ derniere: g.derniere(), recul: r.recul }).toEqual({ derniere: TOTAL - 1, recul: 0 });
    expect(await auRepos(g)).toEqual({ recalculs: 0, scrolls: 0 });
  }, 120_000);

  // Le témoin de contrôle : sans défilement, aucune version ne boucle. S'il
  // rougissait, c'est le banc qui serait faux, pas l'action.
  it('contrôle du banc : sans geste, la grille se pose et ne bouge plus', async () => {
    g = monterGrille();
    expect(await auRepos(g, 30)).toEqual({ recalculs: 0, scrolls: 0 });
    expect(g.premiere()).toBe(0);
  }, 60_000);
});
