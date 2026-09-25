// @vitest-environment jsdom
//
// renesenses/tune-web-client#1575 — Lulu, fil 1928, v0.9.164 sous Windows,
// fenêtre 1366 × 768 : sur la fiche album, le menu « Ajouter à une
// collection » s'ouvrait VERS LE HAUT, ancré par `bottom:`, sans hauteur
// maximale. Avec une quinzaine de collections, son haut sortait de la
// fenêtre : « il manque des répertoires (7 pour moi) ». Et tout défilement
// fermait le menu — les entrées cachées restaient hors d'atteinte.
//
// 🔴 CES TÉMOINS MONTENT LA FICHE, simulent la géométrie (la fenêtre de la
// capture, la boîte du bouton) et lisent où le panneau se pose. Ils
// vérifient que le panneau ENTIER tient dans la fenêtre — pas une valeur de
// style recopiée du code.
//
// Contre-épreuve (sur origin/main, ancrageMenu + fiche d'avant) : quatre
// témoins sur cinq virent au rouge — les deux placements marqués 🔴 (aucun
// `max-height`, le panneau déborde par le haut), le défilement interne (le
// menu se fermait) et la feuille (pas d'`overflow-y`). Seul « peu de
// collections » reste vert : ce cas-là marchait déjà.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { t } from '../i18n';
import { activeView } from '../stores/navigation';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}
const ALBUM_ID = 959;
const LOCAL = { id: ALBUM_ID, title: 'Requiem', artist_name: 'Fauré', year: 1990 } as Album;
/** Seize collections manuelles : la quinzaine de Lulu. */
const SEIZE = Array.from({ length: 16 }, (_, i) => ({ id: i + 2, name: `Collection ${i + 1}`, album_ids: [] }));
/** La fenêtre de la capture. */
const LARGEUR = 1366;
const HAUTEUR = 768;
const MARGE_BORD = 8;

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 4000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let manuelles: unknown[] = SEIZE;
let hauteurAvant = 0;
let largeurAvant = 0;

beforeEach(() => {
  manuelles = SEIZE;
  hauteurAvant = window.innerHeight;
  largeurAvant = window.innerWidth;
  Object.defineProperty(window, 'innerHeight', { value: HAUTEUR, configurable: true, writable: true });
  Object.defineProperty(window, 'innerWidth', { value: LARGEUR, configurable: true, writable: true });
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/collections(\?|$)/.test(u)) return reponse(manuelles);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.coll-menu').forEach((n) => n.remove());
  Object.defineProperty(window, 'innerHeight', { value: hauteurAvant, configurable: true, writable: true });
  Object.defineProperty(window, 'innerWidth', { value: largeurAvant, configurable: true, writable: true });
  vi.unstubAllGlobals();
});

function poser() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, album: LOCAL } as any });
  flushSync();
}
function bouton(): HTMLButtonElement | null {
  const libelle = get(t)('v2.album.addToCollection');
  return hote?.querySelector<HTMLButtonElement>(`.actions button[title="${libelle}"]`) ?? null;
}
const panneau = () => document.body.querySelector<HTMLElement>('.coll-menu');
const entrees = () => Array.from(panneau()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

/** Ouvre le menu depuis un bouton posé à `top`..`bottom` dans la fenêtre. */
async function ouvrirDepuis(top: number, bottom: number): Promise<HTMLElement> {
  poser();
  await jusqua(() => !!bouton());
  const b = bouton()!;
  b.getBoundingClientRect = () => ({
    top, bottom, right: 900, left: 760, width: 140, height: bottom - top, x: 760, y: top,
    toJSON() { return this; },
  }) as DOMRect;
  b.click();
  await jusqua(() => entrees().length > 0);
  const p = panneau();
  expect(p, 'le menu ne s’est pas ouvert').not.toBeNull();
  return p!;
}

/** Les bords VERTICAUX du panneau, déduits de son style — hauteur au plafond,
 *  le pire cas. Sans plafond, on prend la hauteur des entrées (34 px). */
function bords(p: HTMLElement): { haut: number; bas: number; plafond: number | null; sens: 'bas' | 'haut' } {
  const s = p.getAttribute('style') ?? '';
  const px = (nom: string) => {
    const m = new RegExp(`(?:^|;)\\s*${nom}\\s*:\\s*(-?[\\d.]+)px`).exec(s);
    return m ? Number(m[1]) : null;
  };
  const plafond = px('max-height');
  const hauteur = plafond ?? entrees().length * 34 + 14;
  const top = px('top');
  const bottom = px('bottom');
  if (top !== null) return { haut: top, bas: top + hauteur, plafond, sens: 'bas' };
  if (bottom === null) throw new Error(`panneau sans ancrage vertical : « ${s} »`);
  const bas = HAUTEUR - bottom;
  return { haut: bas - hauteur, bas, plafond, sens: 'haut' };
}

describe('#1575 — le menu « Ajouter à une collection » tient dans la fenêtre', () => {
  it('🔴 seize collections, bouton à mi-hauteur (la capture de Lulu) : aucune entrée hors de la fenêtre', async () => {
    const p = await ouvrirDepuis(340, 374);
    expect(entrees()).toHaveLength(16);
    const b = bords(p);
    expect(b.plafond, 'aucune hauteur maximale : le panneau pousse hors de l’écran').not.toBeNull();
    expect(b.haut, 'le haut du panneau sort de la fenêtre').toBeGreaterThanOrEqual(0);
    expect(b.bas, 'le bas du panneau sort de la fenêtre').toBeLessThanOrEqual(HAUTEUR);
    // Plus de place sous le bouton (382 px) qu'au-dessus (328 px) : il descend.
    expect(b.sens).toBe('bas');
    expect(b.haut).toBe(374 + 4);
  });

  it('🔴 bouton près du bas : il monte, et s’arrête au bord haut de la fenêtre', async () => {
    const p = await ouvrirDepuis(600, 634);
    const b = bords(p);
    expect(b.sens).toBe('haut');
    expect(b.plafond).not.toBeNull();
    expect(b.haut, 'le haut du panneau sort de la fenêtre').toBeGreaterThanOrEqual(MARGE_BORD);
    expect(b.bas).toBe(600 - 4);
  });

  it('bouton près du haut, peu de collections : il descend, comme avant', async () => {
    manuelles = SEIZE.slice(0, 3);
    const p = await ouvrirDepuis(120, 154);
    const b = bords(p);
    expect(b.sens).toBe('bas');
    expect(b.haut).toBe(158);
    expect(b.bas).toBeLessThanOrEqual(HAUTEUR - MARGE_BORD);
  });

  it('🔴 le panneau défile en lui-même : son défilement ne le ferme pas, celui de la page si', async () => {
    const p = await ouvrirDepuis(340, 374);
    p.dispatchEvent(new Event('scroll'));
    flushSync();
    expect(panneau(), 'faire défiler le menu l’a fermé : les dernières collections restent hors d’atteinte').not.toBeNull();
    document.dispatchEvent(new Event('scroll'));
    flushSync();
    expect(panneau(), 'le menu reste figé alors que la page défile sous lui').toBeNull();
  });

  it('la feuille du panneau porte le défilement interne', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/AlbumDetailV2.svelte'), 'utf-8');
    const regle = /\n\s*\.coll-menu\{([^}]*)\}/.exec(src);
    expect(regle, 'règle `.coll-menu` introuvable').not.toBeNull();
    expect(regle![1]).toMatch(/overflow-y:\s*auto/);
  });
});
