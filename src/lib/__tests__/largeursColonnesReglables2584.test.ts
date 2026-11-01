// @vitest-environment jsdom
//
// web#2584 — un testeur Windows (visio du 01/11/2026, point 5, « Taille
// Colonne ») veut régler à la main la largeur des colonnes du tableau des
// pistes. Go de Bertrand le 01/11 : « essaye rc10 ».
//
// Le témoin tient quatre promesses, chacune avec sa contre-épreuve :
//   1. le calcul et les BORNES des largeurs (`lib/largeursColonnes`) ;
//   2. la MÉMOIRE par écran — l'album ne déteint pas sur la playlist ;
//   3. un GLISSER de poignée ne trie pas, un clic sur l'en-tête trie toujours ;
//   4. le DOUBLE-CLIC rend la largeur automatique — le gabarit d'avant, au
//      caractère près.
// Il MONTE le tableau et lit le gabarit qu'il pose (`--tcols`) : une garde
// qui lirait la source resterait verte si la poignée cessait d'agir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { COLONNES, PAR_CLE, gabaritGrille, largeurMinimale } from '../colonnesPistes';
import {
  appliquerLargeurs, bornerLargeur, fixerLargeur, largeurMin, largeursColonnes, lireLargeurs,
  retablirLargeur, retablirLargeurs, LARGEUR_MAX_PX, PAS_CLAVIER_PX,
} from '../largeursColonnes';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const PISTES = [
  { id: 1, title: 'Hejira', artist_name: 'Joni Mitchell', album_id: 7, artist_id: 3, source: 'local', duration_ms: 400_000, track_number: 1 },
  { id: 2, title: 'Amelia', artist_name: 'Joni Mitchell', album_id: 7, artist_id: 3, source: 'local', duration_ms: 360_000, track_number: 2 },
];
const CLE_STOCKAGE = (e: string) => `tune_v2_ecran_largeurs_colonnes_${e}`;

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];

function poser(props: Record<string, unknown> = {}): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(ListePistesV2, { target: hote, props: { pistes: PISTES, onLire: () => {}, ...props } as any }));
  flushSync();
  return hote;
}

const tbl = (h: HTMLElement) => h.querySelector<HTMLElement>('.tbl')!;
const tcols = (h: HTMLElement) => tbl(h).style.getPropertyValue('--tcols');
const poignee = (h: HTMLElement, cle: string) => h.querySelector<HTMLElement>(`[data-redim="${cle}"]`);

/** jsdom n'a pas toujours `PointerEvent` : un `MouseEvent` porte le même `clientX`. */
function pointeur(type: string, clientX: number): Event {
  const Ctor: typeof MouseEvent = (globalThis as any).PointerEvent ?? MouseEvent;
  const e = new Ctor(type, { bubbles: true, cancelable: true, clientX, button: 0 } as any);
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse' })) {
    if ((e as any)[k] == null || (e as any)[k] === '') Object.defineProperty(e, k, { value: v });
  }
  return e;
}
function glisser(el: HTMLElement, de: number, vers: number): void {
  el.dispatchEvent(pointeur('pointerdown', de));
  el.dispatchEvent(pointeur('pointermove', (de + vers) / 2));
  el.dispatchEvent(pointeur('pointermove', vers));
  el.dispatchEvent(pointeur('pointerup', vers));
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  localStorage.clear();
  largeursColonnes.set({});
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
  largeursColonnes.set({});
  vi.unstubAllGlobals();
});

describe('web#2584 — calcul et bornes des largeurs', () => {
  it('borne au plancher de la colonne, au plafond commun, et arrondit', () => {
    expect(bornerLargeur('time', 3)).toBe(largeurMin('time'));
    expect(bornerLargeur('artist', 10)).toBe(80);
    expect(bornerLargeur('artist', 5000)).toBe(LARGEUR_MAX_PX);
    expect(bornerLargeur('artist', 201.6)).toBe(202);
    expect(bornerLargeur('artist', Number.NaN)).toBe(80);
    // Contre-épreuve : une valeur dans les bornes passe telle quelle.
    expect(bornerLargeur('artist', 240)).toBe(240);
  });

  it('une colonne réglée passe en pixels ; les autres et le Titre ne bougent pas', () => {
    const cols = [PAR_CLE.num, PAR_CLE.title, PAR_CLE.artist, PAR_CLE.time];
    const reglees = appliquerLargeurs(cols, { artist: 260, title: 500 } as any);
    expect(reglees[2].largeur).toBe('260px');
    // Le Titre prend le reste : jamais fixé, même si un stockage le prétend.
    expect(reglees[1]).toBe(PAR_CLE.title);
    expect(reglees[0]).toBe(PAR_CLE.num);
    // Le plancher (#853) compte la largeur réglée, exactement.
    expect(largeurMinimale(reglees)).toBe(44 + 170 + 260 + 64);
    // Contre-épreuve : sans réglage, gabarit d'avant au caractère près.
    expect(gabaritGrille(appliquerLargeurs(cols, {}))).toBe(gabaritGrille(cols));
    expect(gabaritGrille(appliquerLargeurs(cols, null))).toBe(gabaritGrille(cols));
  });

  it('chaque colonne du catalogue a un plancher positif sous son nominal', () => {
    for (const c of COLONNES) expect(largeurMin(c.cle)).toBeGreaterThan(0);
  });
});

describe('web#2584 — mémoire par écran', () => {
  it('l’album retient sa largeur, la playlist n’en hérite pas', () => {
    fixerLargeur('album', 'artist', 222);
    expect(JSON.parse(localStorage.getItem(CLE_STOCKAGE('album'))!)).toEqual({ artist: 222 });
    expect(lireLargeurs('album')).toEqual({ artist: 222 });
    // Contre-épreuve : l'autre écran reste automatique.
    expect(lireLargeurs('playlist')).toEqual({});
    expect(localStorage.getItem(CLE_STOCKAGE('playlist'))).toBeNull();
  });

  it('la largeur retenue est relue au montage suivant de l’écran', () => {
    localStorage.setItem(CLE_STOCKAGE('album'), JSON.stringify({ artist: 300 }));
    const album = poser({ ecranColonnes: 'album' });
    expect(tcols(album)).toContain(' 300px ');
    // Contre-épreuve : le même tableau sur un autre écran garde l'auto.
    const playlist = poser({ ecranColonnes: 'playlist' });
    expect(tcols(playlist)).not.toContain('300px');
  });

  it('écarte une valeur illisible plutôt que de casser la grille', () => {
    localStorage.setItem(CLE_STOCKAGE('titres'), '{pas du json');
    expect(lireLargeurs('titres')).toEqual({});
    localStorage.setItem(CLE_STOCKAGE('titres'), JSON.stringify({ artist: 'large', time: -4, year: 99999 }));
    expect(lireLargeurs('titres')).toEqual({ year: LARGEUR_MAX_PX });
  });

  it('« Rétablir les largeurs » oublie un écran, ou tous', () => {
    fixerLargeur('album', 'artist', 222);
    fixerLargeur('titres', 'time', 90);
    retablirLargeurs('album');
    expect(lireLargeurs('album')).toEqual({});
    expect(lireLargeurs('titres')).toEqual({ time: 90 });
    retablirLargeurs();
    expect(lireLargeurs('titres')).toEqual({});
  });
});

describe('web#2584 — la poignée dans le tableau', () => {
  it('sans écran, rien ne change : ni poignée, ni gabarit différent', () => {
    const sans = poser();
    expect(sans.querySelectorAll('[role="separator"]').length).toBe(0);
    const avec = poser({ ecranColonnes: 'titres' });
    expect(tcols(avec)).toBe(tcols(sans));
    // Contre-épreuve : avec l'écran, les poignées sont là — sauf sur le Titre.
    expect(poignee(avec, 'artist')).not.toBeNull();
    expect(poignee(avec, 'title')).toBeNull();
  });

  it('porte un séparateur accessible : orientation, valeur, étiquette traduite', () => {
    const h = poser({ ecranColonnes: 'titres' });
    const p = poignee(h, 'artist')!;
    expect(p.getAttribute('role')).toBe('separator');
    expect(p.getAttribute('aria-orientation')).toBe('vertical');
    expect(p.getAttribute('tabindex')).toBe('0');
    expect(p.getAttribute('aria-valuenow')).toBe('130');
    expect(p.getAttribute('aria-label')).toMatch(/^Largeur de la colonne Artiste/);
    expect(p.getAttribute('aria-label')).not.toContain('{col}');
  });

  it('un glisser élargit la colonne, la retient, et ne trie pas', () => {
    const onTrier = vi.fn();
    const h = poser({ ecranColonnes: 'titres', triables: new Set(['artist', 'time']), onTrier, tri: null });
    const avant = tcols(h);
    glisser(poignee(h, 'artist')!, 500, 570);
    // Le clic que le navigateur peut émettre au relâcher, sur le libellé.
    h.querySelector<HTMLButtonElement>('[data-tri="artist"]')!.click();
    poignee(h, 'artist')!.click();
    flushSync();
    expect(onTrier).not.toHaveBeenCalled();
    expect(tcols(h)).not.toBe(avant);
    expect(tcols(h)).toContain(' 200px ');
    expect(lireLargeurs('titres')).toEqual({ artist: 200 });
    expect(poignee(h, 'artist')!.getAttribute('aria-valuenow')).toBe('200');
  });

  it('contre-épreuve : un clic simple sur l’en-tête trie toujours', async () => {
    const onTrier = vi.fn();
    const h = poser({ ecranColonnes: 'titres', triables: new Set(['artist']), onTrier, tri: null });
    h.querySelector<HTMLButtonElement>('[data-tri="artist"]')!.click();
    expect(onTrier).toHaveBeenCalledWith('artist');
    // Et un clic sur la poignée sans bouger ne règle rien.
    const p = poignee(h, 'artist')!;
    p.dispatchEvent(pointeur('pointerdown', 500));
    p.dispatchEvent(pointeur('pointerup', 501));
    flushSync();
    expect(lireLargeurs('titres')).toEqual({});
  });

  it('le double-clic rend la largeur automatique — le gabarit d’avant', () => {
    const h = poser({ ecranColonnes: 'album' });
    const auto = tcols(h);
    glisser(poignee(h, 'artist')!, 500, 600);
    expect(tcols(h)).not.toBe(auto); // contre-épreuve : le glisser a bien agi
    poignee(h, 'artist')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    flushSync();
    expect(tcols(h)).toBe(auto);
    expect(lireLargeurs('album')).toEqual({});
    expect(localStorage.getItem(CLE_STOCKAGE('album'))).toBeNull();
  });

  it('au clavier : flèches gauche et droite, par pas de 16 px, bornées', () => {
    const h = poser({ ecranColonnes: 'playlist' });
    const p = poignee(h, 'time')!;
    p.focus();
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    flushSync();
    expect(lireLargeurs('playlist')).toEqual({ time: 64 + PAS_CLAVIER_PX });
    expect(p.getAttribute('aria-valuenow')).toBe(String(64 + PAS_CLAVIER_PX));
    for (let i = 0; i < 10; i++) {
      p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    }
    flushSync();
    expect(lireLargeurs('playlist')).toEqual({ time: largeurMin('time') });
    // Contre-épreuve : une autre touche ne règle rien.
    retablirLargeur('playlist', 'time');
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    flushSync();
    expect(lireLargeurs('playlist')).toEqual({});
  });

  it('en lecture seule sans suffixe, la dernière colonne n’a pas de poignée (pas de débordement)', () => {
    const h = poser({ ecranColonnes: 'titres', lectureSeule: true });
    expect(poignee(h, 'time')).toBeNull();
    // Contre-épreuve : avec la colonne d'actions à droite, elle en a une.
    const h2 = poser({ ecranColonnes: 'titres' });
    expect(poignee(h2, 'time')).not.toBeNull();
  });
});

describe('web#2584 — affichage mobile et Réglages', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/v2/ListePistesV2.svelte'), 'utf-8');
  it('sous 720 px : pas de poignée, et le plancher ignore les largeurs réglées', () => {
    const mobile = /@media \(max-width: 720px\)\{([\s\S]*?)\n  \}/.exec(css)![1];
    expect(mobile).toMatch(/\.poignee-col\{display:none\}/);
    expect(mobile).toMatch(/\.thead, \.trow\{min-width:var\(--tmin-pile, 0\)\}/);
  });
  it('le plancher mobile ne suit pas un réglage, le plancher bureau oui', () => {
    localStorage.setItem(CLE_STOCKAGE('titres'), JSON.stringify({ artist: 600 }));
    const h = poser({ ecranColonnes: 'titres' });
    const t = tbl(h);
    const bureau = parseFloat(t.style.getPropertyValue('--tmin'));
    const mobile = parseFloat(t.style.getPropertyValue('--tmin-pile'));
    expect(bureau - mobile).toBe(600 - 130);
  });
  it('les Réglages portent « Rétablir les largeurs », branché sur tous les écrans', () => {
    const reglages = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(reglages).toMatch(/data-retablir-largeurs onclick=\{\(\) => retablirLargeurs\(\)\}/);
  });
});
