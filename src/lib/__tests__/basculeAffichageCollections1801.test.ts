// @vitest-environment jsdom
//
// web#1801 — FabienM (fil 2037, point 13), go de Bertrand du 29/09/2026 :
// Collections reçoit la bascule d'affichage de la Bibliothèque, à trois crans
// (liste, petites vignettes, grandes vignettes), pour les collections ET les
// collections intelligentes.
//
// Le témoin MONTE l'écran, lit la grille et clique la bascule :
//   1. par défaut, les petites vignettes, et RIEN n'est écrit au montage (le
//      piège de #1650 : un défaut écrit se fige en faux choix) ;
//   2. un clic mène à la liste, un autre aux grandes vignettes, un troisième
//      revient ; chaque clic est retenu sous la clé de CET écran ;
//   3. le même choix vaut dans les deux onglets ;
//   4. un choix retenu est relu à l'ouverture.
//
// CONTRE-ÉPREUVE : sans `class:liste` / `class:grandes` sur la grille de
// `CollectionsV2.svelte`, les témoins 2, 3 et 4 rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';

const CLE = 'tune_v2_ecran_v2.collections.display';

const MANUELLES = [
  { id: 1, name: 'Ambiances', description: null, album_ids: [10], covers: [], created_at: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Zénith', description: null, album_ids: [11], covers: [], created_at: '2026-02-01T00:00:00Z' },
];
const INTELLIGENTES = [
  { id: 1, name: 'Audiophile', description: null, album_count: 4, covers: [], created_at: '2026-01-01T00:00:00Z' },
];

function corps(chemin: string): unknown {
  if (chemin.includes('/smart-collections/preview')) return { total: 0, albums: [] };
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.includes('/smart-collections')) return INTELLIGENTES;
  if (/\/collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.endsWith('/library/collections')) return MANUELLES;
  return [];
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = corps(brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  await tourner();
  return hote;
}

/** La forme de la grille, lue sur ses classes. */
function forme(racine: HTMLElement): 'petites' | 'liste' | 'grandes' {
  const grille = racine.querySelector<HTMLElement>('.defil .grid');
  expect(grille, 'grille des collections introuvable — témoin sans objet').not.toBeNull();
  expect(grille!.querySelectorAll('.card').length, 'aucune carte — témoin sans objet').toBeGreaterThan(0);
  if (grille!.classList.contains('liste')) return 'liste';
  if (grille!.classList.contains('grandes')) return 'grandes';
  return 'petites';
}

async function basculer(racine: HTMLElement) {
  const b = racine.querySelector<HTMLButtonElement>('nav.tabs .viewtog');
  expect(b, 'bascule d’affichage absente de Collections').not.toBeNull();
  b!.click();
  await tourner(2);
}

async function onglet(racine: HTMLElement, rang: number) {
  racine.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab')[rang].click();
  await tourner();
}

describe('web#1801 — la bascule d’affichage dans Collections', () => {
  it('par défaut, les petites vignettes, et rien n’est écrit au montage', async () => {
    const racine = await poser();
    expect(forme(racine)).toBe('petites');
    expect(racine.querySelector('nav.tabs .viewtog')?.getAttribute('data-vue')).toBe('grid');
    expect(localStorage.getItem(CLE), 'le défaut est retenu comme un choix (#1650)').toBeNull();
  });

  // Rotation commune avec « Écouter plus tard » (#1802, `LISTE_ET_DEUX_GRILLES`) :
  // liste → petites → grandes → liste.
  it('🔴 trois crans : grandes vignettes, liste, retour — chaque clic est retenu', async () => {
    const racine = await poser();
    await basculer(racine);
    expect(forme(racine)).toBe('grandes');
    expect(localStorage.getItem(CLE)).toBe('gridLarge');
    await basculer(racine);
    expect(forme(racine)).toBe('liste');
    expect(localStorage.getItem(CLE)).toBe('list');
    await basculer(racine);
    expect(forme(racine)).toBe('petites');
    expect(localStorage.getItem(CLE)).toBe('grid');
  });

  it('🔴 le même choix vaut pour les collections intelligentes et les collections', async () => {
    const racine = await poser();
    // Premier onglet : les intelligentes.
    await basculer(racine);
    expect(forme(racine)).toBe('grandes');
    await onglet(racine, 1);
    expect(racine.textContent).toContain('Zénith');
    expect(forme(racine)).toBe('grandes');
  });

  it('🔴 un choix retenu est relu à l’ouverture', async () => {
    localStorage.setItem(CLE, 'gridLarge');
    const racine = await poser();
    expect(forme(racine)).toBe('grandes');
  });

  it('un choix illisible retombe sur les petites vignettes', async () => {
    localStorage.setItem(CLE, 'carousel');
    const racine = await poser();
    expect(forme(racine)).toBe('petites');
  });
});
