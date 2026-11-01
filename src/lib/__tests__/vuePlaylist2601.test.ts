// @vitest-environment jsdom
//
// web#2601 (go de Bertrand du 01/11/2026, rc11 ; fil forum 2592) : sur un
// iMac 21,5 pouces regardé à 90 cm, les vignettes de l'écran d'une playlist
// sont trop petites. Trois attendus, MONTÉS sur la vraie fiche :
//   1. bascule liste / pochettes, retenue, avec un curseur de taille ;
//   2. taille des vignettes réglable dans la vue en liste, retenue ;
//   3. en-tête compact (la grande vignette se réduit), retenu.
// Et rien n'est écrit au montage (#1650).
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : sans `class:compact` sur `.head`, sans
// `{#if vue === 'pochettes'}` ou sans `tailleVignette={tailleListe}` dans
// `PlaylistDetailV2.svelte`, les témoins 2, 3 et 4 rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { bornerTaille, lireTaille, BORNES_TAILLE } from '../vuePlaylist';

vi.setConfig({ testTimeout: 60_000 });

const PISTES = [
  { id: 1, title: 'Alpha', artist_name: 'Un', cover_path: '/covers/a.jpg', album_id: 1, duration_ms: 1000 },
  { id: 2, title: 'Beta', artist_name: 'Deux', cover_path: '/covers/b.jpg', album_id: 2, duration_ms: 1000 },
  { id: 3, title: 'Gamma', artist_name: 'Trois', cover_path: '/covers/c.jpg', album_id: 3, duration_ms: 1000 },
];
const K = (s: string) => `tune_v2_ecran_${s}`;

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = /\/playlists\/\d+\/tracks/.test(u) ? PISTES : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(n = 8) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'local', pl: { id: 42, name: 'Nocturnes', track_count: 3 } }, onClose: () => {} } as any,
  });
  flushSync();
  await tourner();
  return hote;
}
const clic = (el: Element) => { (el as HTMLElement).click(); flushSync(); };
function curseur(h: HTMLElement, v: number) {
  const r = h.querySelector('input[data-taille]') as HTMLInputElement;
  r.value = String(v);
  r.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

describe('web#2601 — écran d\'une playlist', () => {
  it('1. liste par défaut, rien d\'écrit au montage', async () => {
    const h = await monter();
    expect(h.querySelector('[data-pgrille]')).toBeNull();
    expect(h.querySelector('.head.compact')).toBeNull();
    const miennes = Object.keys(localStorage).filter((k) => k.includes('v2.playlist.') && !k.includes('pistes.tri'));
    expect(miennes).toEqual([]);
  });

  it('2. la bascule mène aux pochettes, et le choix est retenu et relu', async () => {
    let h = await monter();
    clic(h.querySelector('[data-vue="pochettes"]')!);
    expect(h.querySelector('[data-pgrille]')).not.toBeNull();
    expect(h.querySelectorAll('.pcarte').length).toBe(PISTES.length);
    expect(localStorage.getItem(K('v2.playlist.vue'))).toBe('pochettes');
    unmount(monte!); monte = null; h.remove();
    h = await monter();
    expect(h.querySelector('[data-pgrille]')).not.toBeNull();
    clic(h.querySelector('[data-vue="liste"]')!);
    expect(h.querySelector('[data-pgrille]')).toBeNull();
  });

  it('3. le curseur règle la taille des pochettes, retenue', async () => {
    let h = await monter();
    clic(h.querySelector('[data-vue="pochettes"]')!);
    curseur(h, 240);
    expect((h.querySelector('[data-pgrille]') as HTMLElement).style.getPropertyValue('--ptaille')).toBe('240px');
    expect(localStorage.getItem(K('v2.playlist.taillePochettes'))).toBe('240');
    unmount(monte!); monte = null; h.remove();
    h = await monter();
    expect((h.querySelector('[data-pgrille]') as HTMLElement).style.getPropertyValue('--ptaille')).toBe('240px');
  });

  it('4. le curseur règle la taille des vignettes de la LISTE, retenue, sans toucher les pochettes', async () => {
    let h = await monter();
    expect(h.querySelector('.tvig')).not.toBeNull();
    expect((h.querySelector('.tvig') as HTMLElement).style.getPropertyValue('--tvig')).toBe('');
    curseur(h, 72);
    expect((h.querySelector('.tvig') as HTMLElement).style.getPropertyValue('--tvig')).toBe('72px');
    expect(localStorage.getItem(K('v2.playlist.tailleListe'))).toBe('72');
    expect(localStorage.getItem(K('v2.playlist.taillePochettes'))).toBeNull();
    unmount(monte!); monte = null; h.remove();
    h = await monter();
    expect((h.querySelector('.tvig') as HTMLElement).style.getPropertyValue('--tvig')).toBe('72px');
  });

  it('5. l\'en-tête compact se bascule, est retenu et relu', async () => {
    let h = await monter();
    clic(h.querySelector('[data-entete]')!);
    expect(h.querySelector('.head.compact')).not.toBeNull();
    expect(localStorage.getItem(K('v2.playlist.entete'))).toBe('compact');
    unmount(monte!); monte = null; h.remove();
    h = await monter();
    expect(h.querySelector('.head.compact')).not.toBeNull();
    clic(h.querySelector('[data-entete]')!);
    expect(h.querySelector('.head.compact')).toBeNull();
  });

  it('6. une taille illisible ou hors bornes retombe dans les bornes', () => {
    localStorage.setItem(K('v2.playlist.tailleListe'), '9999');
    expect(lireTaille('liste')).toBe(BORNES_TAILLE.liste.max);
    localStorage.setItem(K('v2.playlist.tailleListe'), 'abc');
    expect(lireTaille('liste')).toBe(BORNES_TAILLE.liste.defaut);
    expect(bornerTaille('pochettes', 1)).toBe(BORNES_TAILLE.pochettes.min);
    expect(bornerTaille('pochettes', NaN)).toBe(BORNES_TAILLE.pochettes.defaut);
  });
});
