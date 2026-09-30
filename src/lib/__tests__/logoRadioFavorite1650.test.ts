// @vitest-environment jsdom
//
// renesenses/tune-web-client#1650 (FabienM, fil 1982, point 1, v0.9.166).
//
// > « vignette absente pour les radios favorites »
//
// Favoris › Radio rendait chaque station en carte `.stcarte` avec son NOM et
// son GENRE, rien d'autre — alors que l'objet reçu (`GET /radios?favorite=true`)
// porte `logo_url`, que `RadiosV2` affiche déjà par `AlbumArt`.
//
// 🔴 Le témoin MONTE l'écran, ouvre l'onglet Radio et lit ce qui est dessiné.
// La contre-épreuve consiste à retirer la ligne `<span class="stlogo">…` du
// composant : les deux premiers `it` rougissent (aucune image, aucune initiale).
//
// Hors périmètre : l'affichage par défaut des playlists favorites (liste ou
// grille), décision de Bertrand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { currentProfileId, favoriteAlbumIds, favoritePlaylistIds } from '../stores/profile';
import { activeView } from '../stores/navigation';

const LOGO = 'https://cdn.example.test/logos/fip-electro.png';
const STATIONS = [
  { id: 3, name: 'FIP Electro', genre: 'Électronique', favorite: true, logo_url: LOGO },
  { id: 4, name: 'Nova', genre: 'Éclectique', favorite: true, logo_url: null },
];

function corps(url: string): unknown {
  if (url.includes('/radio-favorites')) return [];
  if (/\/radios(\?|$)/.test(url)) return STATIONS;
  if (url.includes('/streaming/services')) return {};
  return [];
}

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const b = corps(String(entree));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => b, text: async () => JSON.stringify(b),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
  favoriteAlbumIds.set(new Set());
  favoritePlaylistIds.set(new Set());
  activeView.set('favorites' as any);
});

afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function ongletRadio(): Promise<HTMLDivElement> {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const m = mount(FavoritesV2, { target: h, props: {} as any });
  montes.push({ m, h });
  flushSync();
  await respirer();
  flushSync();
  const b = Array.from(h.querySelectorAll<HTMLButtonElement>('.tabs button'))
    .find((x) => /radio/i.test(x.textContent ?? ''));
  expect(b, 'l’onglet Radio est introuvable — témoin sans objet').toBeTruthy();
  b!.click();
  flushSync();
  await respirer(80);
  flushSync();
  return h;
}

const carte = (h: HTMLElement, nom: string) =>
  Array.from(h.querySelectorAll<HTMLElement>('.stgrille .stcarte'))
    .find((c) => c.querySelector('.stnom')?.textContent?.trim() === nom);

describe('#1650 — la radio favorite montre son logo', () => {
  it('🔴 une station qui a un `logo_url` l’affiche dans sa carte', async () => {
    const h = await ongletRadio();
    const c = carte(h, 'FIP Electro');
    expect(c, 'la carte de la station n’est pas rendue — témoin sans objet').toBeTruthy();
    const img = c!.querySelector<HTMLImageElement>('img');
    expect(img, 'la carte de la radio favorite n’a aucune image').toBeTruthy();
    // Une URL externe passe par le proxy d'illustrations du serveur, comme
    // dans `RadiosV2` (`artworkUrl`) : on exige le logo, sous cette forme.
    expect(img!.getAttribute('src') ?? '').toContain(encodeURIComponent(LOGO));
    expect(img!.getAttribute('alt')).toBe('FIP Electro');
  });

  it('🔴 une station sans logo porte son initiale, pas une case vide', async () => {
    const h = await ongletRadio();
    const c = carte(h, 'Nova');
    expect(c, 'la carte de la station n’est pas rendue — témoin sans objet').toBeTruthy();
    expect(c!.querySelector('img')).toBeNull();
    expect(c!.querySelector('.placeholder-initials')?.textContent?.trim()).toBe('N');
  });

  it('le logo reste HORS du bouton de lecture ; lecture et cœur sont intacts', async () => {
    const h = await ongletRadio();
    const c = carte(h, 'FIP Electro')!;
    expect(c.querySelector('.stlire img'), 'le logo est entré dans le bouton de lecture').toBeNull();
    expect(c.querySelector('button.stlire'), 'le bouton de lecture a disparu').toBeTruthy();
    expect(c.querySelector('button.sfav'), 'le cœur de retrait a disparu').toBeTruthy();
  });
});
