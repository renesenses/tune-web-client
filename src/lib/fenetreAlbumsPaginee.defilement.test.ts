// @vitest-environment jsdom
/**
 * tune-web-client#3183 (fils forum 2879 et 2886) — la grille des Albums en
 * pages (plus de 600 albums) cessait de défiler vers 180-200 albums, revenait
 * de quelques rangées en arrière et pouvait geler la page.
 *
 * Banc : un moteur de mise en page minimal, à hauteurs simulées, autour de la
 * VRAIE action `fenetreAlbumsPaginee`. 2 189 albums sur 10 colonnes ; des
 * vignettes de deux hauteurs (titre sur une ou deux lignes) ; des cases vides,
 * plus basses, tant que leur page de 100 albums n'est pas arrivée. Comme
 * Firefox, l'évènement `scroll` part à la trame suivante. Comme Svelte, la
 * grille rappelle `update()` à l'arrivée de chaque page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fenetreAlbumsPaginee, type TrancheAlbums } from './fenetreAlbumsPaginee';

const TOTAL = 2189;
const COLONNES = 10;
const ESPACE = 22;
const VUE = 800;
const TAILLE_PAGE = 100;
const HAUTEUR_VIDE = 236;
/** Titre sur deux lignes pour un album sur cinq environ : 290 px, sinon 262. */
const hauteurPleine = (i: number) => ((i * 7919) % 5 === 0 ? 290 : 262);

interface Banc {
  el: HTMLDivElement;
  /** Fait défiler l'utilisateur de `delta` px, puis joue une trame. */
  trame: (delta?: number) => Promise<void>;
  pagesChargees: Set<number>;
  appelsFenetre: () => number;
  evenementsScroll: () => number;
  premiereVisible: () => number | null;
  derniereVisible: () => number | null;
  aller: () => ((index: number) => Promise<void>) | undefined;
  detruire: () => void;
}

function monterBanc(): Banc {
  const el = document.createElement('div');
  document.body.append(el);
  let tranche: TrancheAlbums = { debut: 0, fin: 200, avant: 0, apres: 0 };
  const pagesChargees = new Set<number>();
  const pagesDemandees = new Map<number, number>();
  let numeroTrame = 0;
  let scrollTop = 0;
  let scrollEnAttente = false;
  let nbFenetre = 0;
  let nbScroll = 0;
  let allerVers: ((index: number) => Promise<void>) | undefined;
  let rafs: FrameRequestCallback[] = [];

  // --- mise en page : une rangée par cale, une rangée par 10 cases ---------
  type Boite = { top: number; hauteur: number };
  let boites = new Map<Element, Boite>();
  let hauteurTotale = 0;
  const charge = (i: number) => pagesChargees.has(Math.floor(i / TAILLE_PAGE));
  const disposer = () => {
    boites = new Map();
    let y = 0;
    let premiereRangee = true;
    const rangee = (hauteur: number, elements: Element[]) => {
      if (!premiereRangee) y += ESPACE;
      premiereRangee = false;
      for (const e of elements) boites.set(e, { top: y, hauteur });
      y += hauteur;
    };
    const enfants = [...el.children];
    let k = 0;
    while (k < enfants.length) {
      const e = enfants[k] as HTMLElement;
      if (e.classList.contains('cale-paginee')) {
        rangee(Number(e.dataset.h), [e]);
        k++;
        continue;
      }
      const ligne: HTMLElement[] = [];
      while (k < enfants.length && ligne.length < COLONNES
             && !(enfants[k] as HTMLElement).classList.contains('cale-paginee')) {
        ligne.push(enfants[k] as HTMLElement);
        k++;
      }
      // Les cases d'une rangée s'étirent à la plus haute (align-items: stretch).
      const h = Math.max(...ligne.map(c => {
        const i = Number(c.dataset.i);
        return charge(i) ? hauteurPleine(i) : HAUTEUR_VIDE;
      }));
      rangee(h, ligne);
    }
    hauteurTotale = y;
    scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, hauteurTotale - VUE)));
  };
  const rendre = () => {
    el.replaceChildren();
    const cale = (h: number) => {
      if (h <= 0) return;
      const c = document.createElement('div');
      c.className = 'cale-paginee';
      c.dataset.h = String(h);
      el.append(c);
    };
    cale(tranche.avant);
    for (let i = tranche.debut; i < tranche.fin; i++) {
      const c = document.createElement('div');
      c.className = charge(i) ? 'card' : 'card sq';
      c.dataset.i = String(i);
      Object.defineProperty(c, 'offsetHeight', { get: () => boites.get(c)?.hauteur ?? 0 });
      Object.defineProperty(c, 'offsetWidth', { get: () => 100 });
      c.getBoundingClientRect = () => {
        const b = boites.get(c) ?? { top: 0, hauteur: 0 };
        const top = b.top - scrollTop;
        return { top, bottom: top + b.hauteur, left: 0, right: 100, height: b.hauteur, width: 100, x: 0, y: top, toJSON() {} } as DOMRect;
      };
      el.append(c);
    }
    cale(tranche.apres);
    disposer();
  };

  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      const borne = Math.max(0, Math.min(v, Math.max(0, hauteurTotale - VUE)));
      if (borne !== scrollTop) { scrollTop = borne; scrollEnAttente = true; }
    },
  });
  Object.defineProperty(el, 'scrollLeft', { get: () => 0, set: () => {} });
  Object.defineProperty(el, 'clientHeight', { get: () => VUE });
  Object.defineProperty(el, 'clientWidth', { get: () => 1200 });
  Object.defineProperty(el, 'scrollHeight', { get: () => hauteurTotale });
  el.getBoundingClientRect = () => ({ top: 0, bottom: VUE, left: 0, right: 1200, height: VUE, width: 1200, x: 0, y: 0, toJSON() {} }) as DOMRect;

  const styleOrigine = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((cible: Element, pseudo?: string | null) => {
    if (cible !== el) return styleOrigine(cible, pseudo);
    return {
      gridTemplateColumns: Array(COLONNES).fill('100px').join(' '),
      rowGap: `${ESPACE}px`, columnGap: `${ESPACE}px`,
    } as unknown as CSSStyleDeclaration;
  });
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { rafs.push(f); return rafs.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  const options = () => ({
    total: TOTAL,
    mode: 'grid',
    surFenetre: (t: TrancheAlbums) => {
      nbFenetre++;
      if (t.debut !== tranche.debut || t.fin !== tranche.fin || t.avant !== tranche.avant || t.apres !== tranche.apres) {
        tranche = t;
        rendre();
      }
    },
    surPret: (a: ((index: number) => Promise<void>) | undefined) => { allerVers = a; },
  });
  const microtaches = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };

  rendre();
  const action = fenetreAlbumsPaginee(el, options());

  const visibles = () => [...el.querySelectorAll<HTMLElement>('[data-i]')].filter(c => {
    const r = c.getBoundingClientRect();
    return r.bottom > 0 && r.top < VUE;
  }).map(c => Number(c.dataset.i));

  const trame = async (delta = 0) => {
    numeroTrame++;
    if (delta) { const avant = scrollTop; el.scrollTop = scrollTop + delta; if (scrollTop === avant) scrollEnAttente = false; }
    if (scrollEnAttente) {
      scrollEnAttente = false;
      nbScroll++;
      el.dispatchEvent(new Event('scroll'));
    }
    const enCours = rafs;
    rafs = [];
    for (const f of enCours) f(numeroTrame * 16);
    await microtaches();
    // Les cases vides en vue (et une demi-vue autour) demandent leur page,
    // qui arrive deux trames plus tard ; la grille repasse alors par update().
    for (const c of el.querySelectorAll<HTMLElement>('[data-i].sq')) {
      const r = c.getBoundingClientRect();
      if (r.bottom < -VUE / 2 || r.top > VUE * 1.5) continue;
      const p = Math.floor(Number(c.dataset.i) / TAILLE_PAGE);
      if (!pagesDemandees.has(p)) pagesDemandees.set(p, numeroTrame + 2);
    }
    let arrivee = false;
    for (const [p, due] of pagesDemandees) {
      if (due <= numeroTrame && !pagesChargees.has(p)) { pagesChargees.add(p); arrivee = true; }
    }
    if (arrivee) {
      rendre();
      action.update(options());
      await microtaches();
    }
  };

  return {
    el, trame, pagesChargees,
    appelsFenetre: () => nbFenetre,
    evenementsScroll: () => nbScroll,
    premiereVisible: () => { const v = visibles(); return v.length ? Math.min(...v) : null; },
    derniereVisible: () => { const v = visibles(); return v.length ? Math.max(...v) : null; },
    aller: () => allerVers,
    detruire: () => { action.destroy(); el.remove(); },
  };
}

describe('grille des Albums en pages : défilement jusqu’au bout (#3183)', () => {
  let banc: Banc;
  beforeEach(() => { banc = monterBanc(); });
  afterEach(() => { banc.detruire(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  /** Défile de `delta` px par trame jusqu'à `arret(banc)` ; rend les mesures. */
  async function defiler(delta: number, arret: () => boolean, trames: number) {
    let recul = 0;
    let vide = 0;
    let precedente = banc.premiereVisible();
    let n = 0;
    for (; n < trames && !arret(); n++) {
      await banc.trame(delta);
      const p = banc.premiereVisible();
      if (p == null) { vide++; continue; }
      if (precedente != null) {
        // En descendant, la première carte en vue ne recule jamais ; en
        // montant, elle n'avance jamais.
        const ecart = delta > 0 ? precedente - p : p - precedente;
        recul = Math.max(recul, ecart);
      }
      precedente = p;
    }
    return { recul, vide, trames: n };
  }

  async function auRepos() {
    for (let n = 0; n < 20; n++) await banc.trame();
    const scroll = banc.evenementsScroll();
    const fenetre = banc.appelsFenetre();
    for (let n = 0; n < 30; n++) await banc.trame();
    return { scroll: banc.evenementsScroll() - scroll, fenetre: banc.appelsFenetre() - fenetre };
  }

  it('descend du premier au dernier album sans retour en arrière', async () => {
    await auRepos();
    const { recul, vide, trames } = await defiler(120, () => banc.derniereVisible() === TOTAL - 1, 20_000);
    expect(banc.derniereVisible(), `arrêté après ${trames} trames`).toBe(TOTAL - 1);
    expect(recul, 'la première carte en vue a reculé (en albums)').toBe(0);
    expect(vide, 'trames sans aucune carte en vue').toBe(0);
    // ≈ 219 rangées de 284 px en moyenne, 120 px par trame : pas de détour.
    expect(trames).toBeLessThan(700);
  });

  it('remonte du dernier au premier album sans retour en arrière', async () => {
    await auRepos();
    await defiler(400, () => banc.derniereVisible() === TOTAL - 1, 20_000);
    await auRepos();
    const { recul, vide } = await defiler(-120, () => banc.premiereVisible() === 0 && banc.el.scrollTop === 0, 20_000);
    expect(banc.premiereVisible()).toBe(0);
    expect(recul).toBe(0);
    expect(vide).toBe(0);
  });

  it('au repos, plus aucune correction : ni scroll, ni nouvelle fenêtre (pas de boucle)', async () => {
    await auRepos();
    for (const arret of [190, 400, 1200, 2000]) {
      await defiler(120, () => (banc.premiereVisible() ?? 0) >= arret, 20_000);
      const repos = await auRepos();
      expect(repos, `au repos vers l’album ${arret}`).toEqual({ scroll: 0, fenetre: 0 });
    }
  });

  it('après un saut A–Z au milieu, monte et descend bien au-delà de 18 rangées', async () => {
    await auRepos();
    const aller = banc.aller();
    expect(aller).toBeTypeOf('function');
    await aller!(800);
    await auRepos();
    const depart = banc.premiereVisible()!;
    expect(Math.abs(depart - 800)).toBeLessThan(COLONNES);
    const bas = await defiler(120, () => (banc.premiereVisible() ?? 0) >= depart + 60 * COLONNES, 2_000);
    expect(banc.premiereVisible()!).toBeGreaterThanOrEqual(depart + 60 * COLONNES);
    expect(bas.recul).toBe(0);
    await auRepos();
    const haut = await defiler(-120, () => (banc.premiereVisible() ?? TOTAL) <= depart - 60 * COLONNES, 4_000);
    expect(banc.premiereVisible()!).toBeLessThanOrEqual(depart - 60 * COLONNES);
    expect(haut.recul).toBe(0);
    expect(haut.vide).toBe(0);
  });
});
