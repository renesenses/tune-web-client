// @vitest-environment jsdom
//
// renesenses/tune-web-client#1580 — Gros Bidon (Didier), fil 1907, 0.9.164 :
//
//   « dans le menu de gauche il n'est pas possible de réduire complètement le
//     menu Collections. Quand il va être très long avec beaucoup de rayons cela
//     risque de devenir difficile à gérer. »
//
// Livré par #1546 : l'arbre des rayons est rendu SANS condition sous l'entrée
// « Collections » ; seuls les rayons se replient un par un, et tous les rayons
// racine restent affichés. On monte la VRAIE barre latérale avec un arbre, et
// on cherche le geste qui replie l'arbre entier — et qui s'en souvient.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ArbreCollections } from '../api';

const ARBRE: ArbreCollections = {
  max_depth: 3,
  folders: [
    {
      id: 1, name: 'Rock', parent_id: null, position: 0, depth: 1,
      folders: [{ id: 2, name: 'Rock Experimental', parent_id: 1, position: 0, depth: 2, folders: [], collections: [] }],
      collections: [],
    },
    { id: 3, name: 'Electronic', parent_id: null, position: 1, depth: 1, folders: [], collections: [] },
  ],
  collections: [],
};

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return { ...vrai, getCollectionFolders: vi.fn(async () => ARBRE) };
});

import Sidebar from '../../components/v2/Sidebar.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 60_000 });

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Sidebar, { target: hote });
  flushSync();
  await attendre();
  return hote;
}

function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

const rayonsRendus = (h: HTMLElement) => h.querySelectorAll('[data-rayon]').length;
const pliCollections = (h: HTMLElement) =>
  [...h.querySelectorAll('button')].find((b) => {
    const nom = b.getAttribute('aria-label') ?? '';
    return nom === fr['v2.rayons.hideTree'] || nom === fr['v2.rayons.showTree'];
  }) as HTMLButtonElement | undefined;

beforeEach(() => {
  locale.set('fr');
  try {
    localStorage.clear();
    // jsdom mesure 1024 px, palier « étroit » : barre en icônes, arbre masqué.
    // On pose le choix explicite « barre dépliée », comme un utilisateur.
    localStorage.setItem('tune_v2_sidebar_collapsed', '0');
  } catch { /* */ }
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  demonter();
  vi.unstubAllGlobals();
});

describe('#1580 — l’arbre des rayons de la barre latérale se replie EN ENTIER', () => {
  it('un geste sur « Collections » masque tout l’arbre, un second le rend', async () => {
    const h = await monter();
    // Témoin : l'arbre est bien là au départ (comportement livré conservé).
    expect(rayonsRendus(h), 'arbre absent au montage — témoin sans objet').toBeGreaterThan(0);

    const pli = pliCollections(h);
    expect(pli, 'aucun geste pour replier l’arbre Collections entier (#1580)').toBeTruthy();
    expect(pli!.getAttribute('aria-expanded')).toBe('true');
    pli!.click();
    flushSync();
    expect(rayonsRendus(h), 'l’arbre reste affiché après le repli').toBe(0);
    expect(pli!.getAttribute('aria-expanded')).toBe('false');
    // L'entrée « Collections » elle-même reste là.
    expect(h.textContent).toContain(fr['v2.nav.collections'] ?? 'Collections');

    pli!.click();
    flushSync();
    expect(rayonsRendus(h)).toBeGreaterThan(0);
  });

  it('le repli est RETENU d’un montage à l’autre', async () => {
    let h = await monter();
    pliCollections(h)!.click();
    flushSync();
    demonter();

    h = await monter();
    expect(rayonsRendus(h), 'l’arbre se redéploie au rechargement').toBe(0);
    expect(pliCollections(h)!.getAttribute('aria-expanded')).toBe('false');
  });
});
