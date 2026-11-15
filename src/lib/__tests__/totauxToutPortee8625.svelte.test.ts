// @vitest-environment jsdom
//
// tune-server-rust#8625, relecture du 14/11 — le chip « Tout » des Albums
// prenait le total de la bibliothèque (`$albums.length`) dès qu'aucun filtre
// de `toutActif` n'était posé, même quand la grille était RESTREINTE par une
// portée de dossier : « Tout · 9 494 » au-dessus de 1 440 cartes, infobulle
// fausse comprise. Avec un dossier, « Tout » compte la grille.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';

function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => JSON.parse(texte), text: async () => texte,
  } as unknown as Response;
}

const ALBUMS = [
  { id: 1, title: 'Alpha', artist_name: 'A', format: 'FLAC' },
  { id: 2, title: 'Beta', artist_name: 'B', format: 'FLAC' },
  { id: 3, title: 'Gamma', artist_name: 'C', format: 'FLAC' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(predicat: () => boolean, limite = 8000): Promise<void> {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    flushSync();
    if (predicat()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  flushSync();
}

const tout = () => hote!.querySelector<HTMLButtonElement>('[data-albums-tout]');
const nombre = () => Number((tout()?.textContent ?? '').replace(/\D/g, ''));

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = new URL(String(url), 'http://tune.test').pathname.replace(/^\/api\/v1/, '');
    // La portée « /m/A » ne contient que l'album 1.
    if (p === '/library/albums-detailed') return reponse({ items: [{ album_id: 1 }], total: 1 });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  pendingLibraryFiltre.set(null);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  libraryFolderScope.set(null as any);
  vi.unstubAllGlobals();
});

describe('#8625 — « Tout » ne dépasse jamais la grille restreinte', { timeout: 20_000 }, () => {
  it('🔴 avec un dossier, « Tout » compte les albums du dossier, pas la bibliothèque', async () => {
    libraryFolderScope.set('/m/A' as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} });
    await attendreQue(() => !!tout() && nombre() === 1);
    expect(nombre(), '« Tout » affiche le total de la bibliothèque sous une portée de dossier').toBe(1);
    expect(tout()!.getAttribute('title'), 'l’infobulle « N cartes pour M albums » est fausse sous une portée').toBeNull();
  });

  it('sans portée, « Tout » garde le total de la bibliothèque', async () => {
    libraryFolderScope.set(null as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} });
    await attendreQue(() => !!tout() && nombre() === 3);
    expect(nombre()).toBe(3);
  });
});
