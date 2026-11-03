// @vitest-environment jsdom
//
// web#2599 — après les largeurs réglables (#2584), le même testeur veut
// DÉPLACER les colonnes du tableau des pistes : glisser l'en-tête à la
// souris, Alt + flèches au clavier ; ordre retenu par écran ; « Rétablir
// l'ordre par défaut » ; une colonne ajoutée plus tard apparaît quand même.
//
// Le témoin MONTE le tableau et lit l'ordre des en-têtes ET des cellules d'une
// ligne : une garde qui lirait la source resterait verte si le glisser
// cessait d'agir. Chaque promesse a sa contre-épreuve.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { tick } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { COLONNES } from '../colonnesPistes';
import { largeursColonnes, fixerLargeur } from '../largeursColonnes';
import {
  appliquerOrdre, deplacerAupres, deplacerDUnCran, deplacerVers, fixerOrdre, lireOrdre, ordresColonnes,
  retablirOrdre,
} from '../ordreColonnes';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const PISTES = [
  { id: 1, title: 'Hejira', artist_name: 'Joni Mitchell', album_id: 7, artist_id: 3, source: 'local', duration_ms: 400_000, track_number: 1 },
];
const CLE = (e: string) => `tune_v2_ecran_ordre_colonnes_${e}`;

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];

function poser(props: Record<string, unknown> = {}): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(ListePistesV2, { target: hote, props: { pistes: PISTES, onLire: () => {}, ecranColonnes: 'album', ...props } as any }));
  flushSync();
  return hote;
}
const entetes = (h: HTMLElement) =>
  [...h.querySelectorAll<HTMLElement>('.thead [data-th]')].map((e) => e.dataset.th);
const th = (h: HTMLElement, cle: string) => h.querySelector<HTMLElement>(`.thead [data-th="${cle}"]`)!;
/** L'ordre des CELLULES de la première ligne : la ligne doit suivre l'en-tête. */
const cellules = (h: HTMLElement) =>
  [...h.querySelectorAll<HTMLElement>('.trow:not(.thead) .td:not(.act)')].map((e) => e.textContent!.trim());

function glisserEntete(h: HTMLElement, de: string, vers: string, apres = false): void {
  const source = th(h, de);
  const cible = th(h, vers);
  cible.getBoundingClientRect = () => ({ left: 100, width: 100, right: 200, top: 0, bottom: 20, height: 20, x: 100, y: 0, toJSON() {} }) as DOMRect;
  const evt = (type: string, x = 0) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x }) as any;
    e.dataTransfer = { setData() {}, effectAllowed: '', dropEffect: '' };
    return e as Event;
  };
  source.dispatchEvent(evt('dragstart'));
  cible.dispatchEvent(evt('dragover', apres ? 180 : 120));
  flushSync();
  cible.dispatchEvent(evt('drop', apres ? 180 : 120));
  source.dispatchEvent(evt('dragend'));
  flushSync();
}
function alt(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  localStorage.clear();
  largeursColonnes.set({});
  ordresColonnes.set({});
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  preferences.update((p) => ({
    ...p, settingsLevel: 'expert', v2ActionsReduites: false,
    v2Colonnes: { ...p.v2Colonnes, expert: ['num', 'title', 'artist', 'time'] },
  }));
});
afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  localStorage.clear();
  ordresColonnes.set({});
  largeursColonnes.set({});
  vi.unstubAllGlobals();
});

describe('web#2599 — calcul de l’ordre', () => {
  const cols = ['num', 'title', 'artist', 'time'].map((cle) => ({ cle }));
  const cles = (l: { cle: string }[]) => l.map((c) => c.cle);

  it('applique l’ordre retenu', () => {
    expect(cles(appliquerOrdre(cols, ['time', 'artist', 'title', 'num']))).toEqual(['time', 'artist', 'title', 'num']);
    // Contre-épreuve : sans ordre, l’ordre du catalogue, à l’identique.
    expect(cles(appliquerOrdre(cols, []))).toEqual(['num', 'title', 'artist', 'time']);
    expect(cles(appliquerOrdre(cols, null))).toEqual(['num', 'title', 'artist', 'time']);
  });

  it('une colonne absente de l’ordre est AJOUTÉE, après sa voisine par défaut', () => {
    const avec = [...cols.slice(0, 3), { cle: 'genre' }, cols[3]];
    // Ordre ancien, écrit avant que « genre » soit cochée.
    const r = cles(appliquerOrdre(avec, ['time', 'artist', 'title', 'num']));
    expect(r).toHaveLength(5);
    expect(r).toContain('genre');
    expect(r.indexOf('genre')).toBe(r.indexOf('artist') + 1);
    // Une colonne nouvelle en tête du catalogue reste en tête.
    expect(cles(appliquerOrdre([{ cle: 'neuve' }, ...cols], ['time', 'num', 'title', 'artist']))[0]).toBe('neuve');
  });

  it('écarte les clés inconnues et les doublons, sans rien perdre', () => {
    const r = cles(appliquerOrdre(cols, ['fantome', 'time', 'time', 'num']));
    expect(r.slice().sort()).toEqual(['artist', 'num', 'time', 'title']);
    expect(r.slice(0, 2)).toEqual(['time', 'num']);
  });

  it('déplace d’un cran, vers un rang, auprès d’une colonne', () => {
    const k = ['num', 'title', 'artist', 'time'] as any[];
    expect(deplacerDUnCran(k, 'artist', -1)).toEqual(['num', 'artist', 'title', 'time']);
    expect(deplacerDUnCran(k, 'num', -1)).toEqual(k); // bord : rien ne bouge
    expect(deplacerDUnCran(k, 'time', 1)).toEqual(k);
    expect(deplacerVers(k, 'time', 0)).toEqual(['time', 'num', 'title', 'artist']);
    expect(deplacerAupres(k, 'num', 'artist', true)).toEqual(['title', 'artist', 'num', 'time']);
    expect(deplacerAupres(k, 'num', 'artist', false)).toEqual(['title', 'num', 'artist', 'time']);
    expect(deplacerAupres(k, 'num', 'num', true)).toEqual(k);
  });
});

describe('web#2599 — mémoire par écran', () => {
  it('l’album retient son ordre, la playlist n’en hérite pas', () => {
    fixerOrdre('album', ['time', 'num'] as any);
    expect(JSON.parse(localStorage.getItem(CLE('album'))!)).toEqual(['time', 'num']);
    expect(lireOrdre('album')).toEqual(['time', 'num']);
    // Contre-épreuve : l’autre écran reste par défaut.
    expect(lireOrdre('playlist')).toEqual([]);
    expect(localStorage.getItem(CLE('playlist'))).toBeNull();
  });

  it('ignore un stockage corrompu', () => {
    localStorage.setItem(CLE('album'), '{pas du json');
    expect(lireOrdre('album')).toEqual([]);
    localStorage.setItem(CLE('album'), '{"a":1}');
    expect(lireOrdre('album')).toEqual([]);
    localStorage.setItem(CLE('album'), '["time",3,"time","num"]');
    expect(lireOrdre('album')).toEqual(['time', 'num']);
  });

  it('rétablir efface un écran, ou tous', () => {
    fixerOrdre('album', ['time'] as any);
    fixerOrdre('playlist', ['time'] as any);
    retablirOrdre('album');
    expect(lireOrdre('album')).toEqual([]);
    expect(lireOrdre('playlist')).toEqual(['time']);
    retablirOrdre();
    expect(lireOrdre('playlist')).toEqual([]);
  });
});

describe('web#2599 — le tableau monté', () => {
  it('sans ordre retenu : l’ordre du catalogue (contre-épreuve)', () => {
    const h = poser();
    expect(entetes(h)).toEqual(['num', 'title', 'artist', 'time']);
  });

  it('l’ordre retenu est appliqué aux en-têtes ET aux cellules, gabarit compris', () => {
    const avant = poser();
    const gabaritAvant = avant.querySelector<HTMLElement>('.tbl')!.style.getPropertyValue('--tcols');
    const celluleAvant = cellules(avant);
    fixerOrdre('album', ['time', 'artist', 'title', 'num'] as any);
    flushSync();
    expect(entetes(avant)).toEqual(['time', 'artist', 'title', 'num']);
    expect(cellules(avant)).toEqual([...celluleAvant].reverse());
    // Le gabarit suit les colonnes (la dernière piste est la colonne des actions, fixe).
    const quatre = (g: string) => g.split(' ').slice(-5, -1);
    const gabaritApres = avant.querySelector<HTMLElement>('.tbl')!.style.getPropertyValue('--tcols');
    expect(quatre(gabaritApres)).toEqual(quatre(gabaritAvant).reverse());
  });

  it('glisser un en-tête sur un autre déplace la colonne et RETIENT l’ordre', () => {
    const h = poser();
    glisserEntete(h, 'time', 'num');
    expect(entetes(h)).toEqual(['time', 'num', 'title', 'artist']);
    expect(lireOrdre('album')).toEqual(['time', 'num', 'title', 'artist']);
    // Un autre montage du même écran relit l’ordre retenu.
    ordresColonnes.set({});
    expect(entetes(poser())).toEqual(['time', 'num', 'title', 'artist']);
  });

  it('le côté du dépôt compte : après la cible, ou avant', () => {
    const h = poser();
    glisserEntete(h, 'num', 'artist', true);
    expect(entetes(h)).toEqual(['title', 'artist', 'num', 'time']);
  });

  it('l’ordre de la playlist ne bouge pas quand l’album est réordonné', () => {
    const album = poser({ ecranColonnes: 'album' });
    const playlist = poser({ ecranColonnes: 'playlist' });
    glisserEntete(album, 'time', 'num');
    expect(entetes(album)).toEqual(['time', 'num', 'title', 'artist']);
    expect(entetes(playlist)).toEqual(['num', 'title', 'artist', 'time']);
  });

  it('une colonne cochée APRÈS le déplacement apparaît quand même', () => {
    const h = poser();
    glisserEntete(h, 'time', 'num');
    preferences.update((p) => ({ ...p, v2Colonnes: { ...p.v2Colonnes, expert: ['num', 'title', 'artist', 'genre', 'time'] } }));
    flushSync();
    const e = entetes(h);
    expect(e).toHaveLength(5);
    expect(e).toContain('genre');
    // Sa place : juste après sa voisine précédente du CATALOGUE.
    const cat = COLONNES.map((c) => c.cle as string);
    const voisine = cat.slice(0, cat.indexOf('genre')).reverse().find((k) => e.includes(k));
    expect(e.indexOf('genre')).toBe(voisine ? e.indexOf(voisine) + 1 : 0);
  });

  it('une colonne décochée puis recochée retrouve sa place retenue', () => {
    const h = poser();
    glisserEntete(h, 'time', 'num');
    preferences.update((p) => ({ ...p, v2Colonnes: { ...p.v2Colonnes, expert: ['num', 'title', 'artist'] } }));
    flushSync();
    expect(entetes(h)).toEqual(['num', 'title', 'artist']);
    preferences.update((p) => ({ ...p, v2Colonnes: { ...p.v2Colonnes, expert: ['num', 'title', 'artist', 'time'] } }));
    flushSync();
    expect(entetes(h)).toEqual(['time', 'num', 'title', 'artist']);
  });

  it('« Rétablir l’ordre par défaut » rend le catalogue', () => {
    const h = poser();
    glisserEntete(h, 'time', 'num');
    retablirOrdre();
    flushSync();
    expect(entetes(h)).toEqual(['num', 'title', 'artist', 'time']);
    expect(localStorage.getItem(CLE('album'))).toBeNull();
  });

  it('Alt + flèche déplace d’un cran, annonce la place et garde le focus', async () => {
    const h = poser();
    th(h, 'artist').focus();
    alt(th(h, 'artist'), 'ArrowLeft');
    await tick();
    expect(entetes(h)).toEqual(['num', 'artist', 'title', 'time']);
    expect(lireOrdre('album')).toEqual(['num', 'artist', 'title', 'time']);
    expect(h.querySelector('[data-annonce-colonne]')!.textContent).toMatch(/position 2 sur 4/);
    expect(document.activeElement).toBe(th(h, 'artist'));
    alt(th(h, 'artist'), 'ArrowRight');
    await tick();
    expect(entetes(h)).toEqual(['num', 'title', 'artist', 'time']);
  });

  it('Alt + Début rétablit l’ordre par défaut', async () => {
    const h = poser();
    glisserEntete(h, 'time', 'num');
    alt(th(h, 'time'), 'Home');
    await tick();
    expect(entetes(h)).toEqual(['num', 'title', 'artist', 'time']);
    expect(localStorage.getItem(CLE('album'))).toBeNull();
  });

  it('contre-épreuve clavier : une flèche SANS Alt ne déplace rien, au bord rien ne bouge', async () => {
    const h = poser();
    th(h, 'artist').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    flushSync();
    expect(entetes(h)).toEqual(['num', 'title', 'artist', 'time']);
    alt(th(h, 'num'), 'ArrowLeft');
    expect(entetes(h)).toEqual(['num', 'title', 'artist', 'time']);
    expect(localStorage.getItem(CLE('album'))).toBeNull();
  });

  it('sans écran de rangement : en-têtes ni déplaçables ni focalisables (OPT-IN)', () => {
    const h = poser({ ecranColonnes: null });
    expect(h.querySelector('.thead [draggable="true"]')).toBeNull();
    expect(h.querySelector('[data-th]')).toBeNull();
    expect(h.querySelector('[data-annonce-colonne]')).toBeNull();
  });

  it('l’ordre et les largeurs réglées cohabitent : la largeur suit sa colonne', () => {
    const h = poser();
    fixerLargeur('album', 'artist', 222);
    glisserEntete(h, 'artist', 'num');
    flushSync();
    expect(entetes(h)).toEqual(['artist', 'num', 'title', 'time']);
    const gabarit = h.querySelector<HTMLElement>('.tbl')!.style.getPropertyValue('--tcols').split(' ');
    expect(gabarit[0]).toBe('222px');
  });
});
