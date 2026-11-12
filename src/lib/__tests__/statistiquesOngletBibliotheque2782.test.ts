// @vitest-environment jsdom
//
// web#2782 — Gros Bidon (Didier), fil 2747 : les onglets de la Bibliothèque
// affichent leur contenu DANS la page, sauf « Statistiques », qui faisait
// sortir de la Bibliothèque (vue `statsbibliotheque` seule, sans barre
// d'onglets ni retour).
//
// Attendu : l'onglet se comporte comme les autres — contenu rendu dans la
// page, barre d'onglets conservée, retour par un clic sur un autre onglet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';

const STATS = {
  tracks: 10, albums: 3, artists: 2,
  distributions: {
    by_codec: [{ value: 'flac', tracks: 6 }, { value: 'mp3', tracks: 4 }],
    by_sample_rate: [{ value: 44100, tracks: 10 }],
    by_decade: [{ value: 1990, tracks: 10 }],
    by_credit_role: [],
  },
};

function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => JSON.parse(texte), text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(predicat: () => boolean, limite = 4000): Promise<void> {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    flushSync();
    if (predicat()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}

async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  flushSync();
  await attendreQue(() => !!hote!.querySelector('[data-stats-bibliotheque-ouvrir]'));
  return hote;
}

const contenu = (h: HTMLElement) => h.querySelector<HTMLElement>('.contenu-lib')!;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = new URL(String(url), 'http://tune.test').pathname.replace(/^\/api\/v1/, '');
    return reponse(p === '/library/stats' ? STATS : []);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  pendingLibraryFiltre.set(null);
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set([] as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#2782 — « Statistiques » reste dans la Bibliothèque', () => {
  it('🔴 le clic ne quitte pas la vue : statistiques dans la page, barre d’onglets conservée', async () => {
    const h = await ecranMonte();
    h.querySelector<HTMLButtonElement>('[data-stats-bibliotheque-ouvrir]')!.click();
    flushSync();

    expect(get(activeView), 'l’onglet Statistiques fait encore sortir de la Bibliothèque').toBe('library');
    await attendreQue(() => !!h.querySelector('[data-repartition="by_codec"]'));
    expect(h.querySelector('[data-stats-bibliotheque]'), 'les statistiques ne sont pas rendues dans la page').not.toBeNull();
    expect(h.querySelector('[data-repartition="by_codec"]')).not.toBeNull();
    // La barre d'onglets est toujours là, et « Statistiques » y est l'onglet actif.
    expect(h.querySelector('[data-onglet="albums"]')).not.toBeNull();
    expect(h.querySelector('[data-onglet="albums"]')!.classList.contains('active')).toBe(false);
    expect(h.querySelector('[data-stats-bibliotheque-ouvrir]')!.classList.contains('active')).toBe(true);
    // Le contenu de l'onglet précédent est masqué, pas superposé.
    expect(contenu(h).style.display).toBe('none');
  });

  it('🔴 un clic sur un autre onglet ramène à son contenu', async () => {
    const h = await ecranMonte();
    h.querySelector<HTMLButtonElement>('[data-stats-bibliotheque-ouvrir]')!.click();
    flushSync();
    h.querySelector<HTMLButtonElement>('[data-onglet="albums"]')!.click();
    flushSync();

    expect(h.querySelector('[data-stats-bibliotheque]')).toBeNull();
    expect(contenu(h).style.display).toBe('contents');
    expect(h.querySelector('[data-onglet="albums"]')!.classList.contains('active')).toBe(true);
    expect(h.querySelector('[data-stats-bibliotheque-ouvrir]')!.classList.contains('active')).toBe(false);
  });

  it('une barre filtrante (format) referme les statistiques sur les Albums filtrés', async () => {
    const h = await ecranMonte();
    h.querySelector<HTMLButtonElement>('[data-stats-bibliotheque-ouvrir]')!.click();
    flushSync();
    await attendreQue(() => !!h.querySelector('[data-repartition="by_codec"] [data-filtre]'));
    h.querySelector<HTMLButtonElement>('[data-repartition="by_codec"] [data-filtre]')!.click();
    await attendreQue(() => !h.querySelector('[data-stats-bibliotheque]'));

    expect(get(activeView)).toBe('library');
    expect(h.querySelector('[data-stats-bibliotheque]')).toBeNull();
    expect(contenu(h).style.display).toBe('contents');
    expect(h.querySelector('[data-onglet="albums"]')!.classList.contains('active')).toBe(true);
  });
});
