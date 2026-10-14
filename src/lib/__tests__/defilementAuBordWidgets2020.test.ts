// @vitest-environment jsdom
//
// web#2020 (Alex Campbell, fil 2178, Safari) — pendant le déplacement d'un
// widget de l'accueil, la page doit défiler quand le pointeur approche du haut
// ou du bas de la zone défilante. Ces témoins font défiler un VRAI élément par
// de vrais évènements `dragover` ; le dernier monte `PageWidgets`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { creerDefilementAuBord, vitesseAuBord, MARGE_BORD, VITESSE_MAX } from '../defilementAuBord';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import type { Widget } from '../accueilWidgets';
import { currentProfileId } from '../stores/profile';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 30_000 });

const CADRE = { top: 100, bottom: 700 };

/** Un conteneur défilant de jsdom : `scrollTop` borné à [0, 2000]. */
function zoneDefilante(cadre = CADRE, max = 2000): HTMLDivElement {
  const el = document.createElement('div');
  let haut = 0;
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => haut,
    set: (v: number) => { haut = Math.max(0, Math.min(max, v)); },
  });
  el.getBoundingClientRect = () => ({ top: cadre.top, bottom: cadre.bottom, left: 0, right: 800, width: 800, height: cadre.bottom - cadre.top, x: 0, y: cadre.top, toJSON() {} }) as DOMRect;
  return el;
}

/** Des images d'animation qu'on déroule à la main. */
function images() {
  const file: FrameRequestCallback[] = [];
  return {
    raf: (f: FrameRequestCallback) => { file.push(f); return file.length; },
    annuler: () => { file.length = 0; },
    derouler(n: number) { for (let i = 0; i < n && file.length; i++) file.shift()!(0); },
    get enAttente() { return file.length; },
  };
}

const survoler = (y: number) => document.dispatchEvent(new MouseEvent('dragover', { clientX: 400, clientY: y, bubbles: true }));

describe('web#2020 — la vitesse près des bords', () => {
  it('nulle au milieu, vers le haut près du haut, vers le bas près du bas', () => {
    expect(vitesseAuBord(400, CADRE)).toBe(0);
    expect(vitesseAuBord(CADRE.top + MARGE_BORD + 1, CADRE)).toBe(0);
    expect(vitesseAuBord(CADRE.top + 5, CADRE)).toBeLessThan(0);
    expect(vitesseAuBord(CADRE.bottom - 5, CADRE)).toBeGreaterThan(0);
  });

  it('proportionnelle à la proximité, maximale au bord et au-delà', () => {
    const loin = vitesseAuBord(CADRE.bottom - MARGE_BORD + 10, CADRE);
    const pres = vitesseAuBord(CADRE.bottom - 5, CADRE);
    expect(pres).toBeGreaterThan(loin);
    expect(vitesseAuBord(CADRE.bottom, CADRE)).toBe(VITESSE_MAX);
    expect(vitesseAuBord(CADRE.top - 50, CADRE), 'pointeur sur l’en-tête').toBe(-VITESSE_MAX);
    expect(vitesseAuBord(CADRE.bottom + 50, CADRE)).toBe(VITESSE_MAX);
  });

  it('un cadre bas garde un milieu immobile', () => {
    const petit = { top: 0, bottom: 90 };
    expect(vitesseAuBord(45, petit)).toBe(0);
    expect(vitesseAuBord(2, petit)).toBeLessThan(0);
  });
});

describe('web#2020 — le moteur', () => {
  it('fait défiler vers le bas puis vers le haut, et s’arrête au milieu', () => {
    const el = zoneDefilante();
    const im = images();
    const d = creerDefilementAuBord(() => el, { raf: im.raf, annuler: im.annuler });
    d.demarrer();
    survoler(CADRE.bottom - 4);
    im.derouler(10);
    const descendu = el.scrollTop;
    expect(descendu, 'la page ne descend pas').toBeGreaterThan(0);
    survoler(CADRE.top + 4);
    im.derouler(5);
    expect(el.scrollTop, 'la page ne remonte pas').toBeLessThan(descendu);
    survoler(400);
    im.derouler(5);
    const fige = el.scrollTop;
    im.derouler(5);
    expect(el.scrollTop).toBe(fige);
    expect(im.enAttente).toBe(0);
    d.arreter();
  });

  it('en butée, il cesse de tourner ; arrêté, il ne suit plus le pointeur', () => {
    const el = zoneDefilante(CADRE, 30);
    const im = images();
    const d = creerDefilementAuBord(() => el, { raf: im.raf, annuler: im.annuler });
    d.demarrer();
    survoler(CADRE.bottom);
    im.derouler(20);
    expect(el.scrollTop).toBe(30);
    expect(im.enAttente, 'tourne à vide en butée').toBe(0);
    d.arreter();
    el.scrollTop = 0;
    survoler(CADRE.bottom);
    im.derouler(5);
    expect(el.scrollTop, 'défile encore après le dépôt').toBe(0);
  });

  it('un évènement en (0, 0) n’est pas un pointeur en haut', () => {
    const el = zoneDefilante();
    el.scrollTop = 500;
    const im = images();
    const d = creerDefilementAuBord(() => el, { raf: im.raf, annuler: im.annuler });
    d.demarrer();
    document.dispatchEvent(new MouseEvent('dragover', { clientX: 0, clientY: 0 }));
    im.derouler(5);
    expect(el.scrollTop).toBe(500);
    d.arreter();
  });
});

describe('web#2020 — branché dans PageWidgets', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;
  let file: FrameRequestCallback[] = [];
  beforeEach(() => {
    file = [];
    localStorage.clear();
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { file.push(f); return file.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { file = []; });
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}), text: async () => '{}' }) as unknown as Response));
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null; hote?.remove(); hote = null;
    currentProfileId.set(null);
    vi.unstubAllGlobals();
  });

  it('saisir la poignée puis approcher du bas fait défiler `.scroll` ; le dépôt arrête', async () => {
    const w = (id: string): Widget => ({ id, cleTitre: 'v2.home.eyebrow', forme: 'bande', charger: async () => [] } as unknown as Widget);
    // Sans profil, la page ne charge rien (#1152) : il lui en faut un.
    currentProfileId.set(1);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets as any, { target: hote, props: { catalogue: [w('a'), w('b'), w('c')], dispositionDefaut: ['a', 'b', 'c'], cle: 'dispoTest2020' } });
    for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
    const modifier = [...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === fr['v2.home.edit']);
    expect(modifier, 'aucun bouton Modifier').toBeTruthy();
    modifier!.click();
    flushSync();
    const poignees = hote.querySelectorAll<HTMLElement>('.poignee');
    expect(poignees.length).toBe(3);

    // La vraie zone défilante, munie d'un cadre et d'un défilement mesurables.
    const scroll = hote.querySelector<HTMLDivElement>('.scroll')!;
    let haut = 0;
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, get: () => haut, set: (v: number) => { haut = Math.max(0, Math.min(3000, v)); } });
    scroll.getBoundingClientRect = () => ({ top: CADRE.top, bottom: CADRE.bottom, left: 0, right: 800, width: 800, height: 600, x: 0, y: CADRE.top, toJSON() {} }) as DOMRect;

    survoler(CADRE.bottom - 3);
    while (file.length) file.shift()!(0);
    expect(haut, 'sans glisser en cours, la page ne doit pas bouger').toBe(0);

    poignees[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    flushSync();
    survoler(CADRE.bottom - 3);
    for (let i = 0; i < 10 && file.length; i++) file.shift()!(0);
    expect(haut, 'la page ne défile pas pendant le glisser').toBeGreaterThan(0);

    poignees[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    flushSync();
    const apres = haut;
    survoler(CADRE.bottom - 3);
    while (file.length) file.shift()!(0);
    expect(haut, 'la page défile encore après le dépôt').toBe(apres);
  });
});
