// @vitest-environment jsdom
//
// tune-server-rust#8061 — Gros Bidon, rc12 (fil 2690, réponse 11388) :
// « Les petits cœurs des playlists Qobuz sont à la ligne ».
//
// Favoris › Playlists, affichage en LISTE : la ligne `.simple` est une grille
// de TROIS colonnes (`auto 1fr auto` : pochette, nom, compte). Depuis le
// nombre de titres en sous-titre (8859d212, rc12), une playlist de service
// porte QUATRE éléments : pochette, nom, compte… et son cœur. Le quatrième
// ouvre une seconde rangée de la grille : le cœur passe sous la pochette.
//
// Le témoin monte l'écran, une playlist Qobuz favorite dont le service donne
// le nombre de titres, et compte les enfants directs de la ligne contre les
// colonnes que la feuille de style déclare.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';

const PL_SERVICE = {
  item_type: 'playlist', service: 'qobuz', service_id: '77',
  title: 'Jazz du dimanche', artist: null, album: null,
  cover_url: 'https://x/c.jpg', created_at: '2026-09-11T10:00:00Z',
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function corps(url: string): unknown {
  // La playlist elle-même, demandée pour son nombre de titres.
  if (/\/streaming\/qobuz\/playlists\/77(\?|$)/.test(url)) return { id: '77', name: 'Jazz du dimanche', track_count: 12, tracks: [] };
  if (url.includes('/favorites/streaming')) return [PL_SERVICE];
  if (url.includes('/favorites/facets')) return [];
  if (url.includes('/favorites')) return [];
  return [];
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps(String(url)), text: async () => JSON.stringify(corps(String(url))),
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
  favoriteStreamingKeys.set(new Set([streamingFavKey('playlist', 'qobuz', '77')]));
  localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  localStorage.clear();
});

const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

/** Le nombre de colonnes de la grille `.simple`, lu dans la feuille de style. */
function colonnesDeLaLigne(): number {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2/FavoritesV2.svelte'), 'utf-8');
  const m = src.match(/\.simple\{display:grid; grid-template-columns:([^;]+);/);
  expect(m, 'la règle `.simple{display:grid; grid-template-columns:…}` a changé de forme').not.toBeNull();
  return m![1].trim().split(/\s+/).length;
}

describe('#8061 — le cœur d’une playlist de service reste sur sa ligne', () => {
  it('🔴 playlist Qobuz avec nombre de titres : pas plus d’enfants que de colonnes', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(FavoritesV2, { target: hote, props: {} as any });
    flushSync();
    await respirer();
    flushSync();
    const ong = Array.from(hote.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => /playlist/i.test(b.textContent ?? ''));
    if (ong) { ong.click(); flushSync(); }
    await respirer();
    flushSync();

    const ligne = Array.from(hote.querySelectorAll<HTMLElement>('.simple'))
      .find((e) => (e.textContent ?? '').includes('Jazz du dimanche'));
    expect(ligne, `ligne introuvable ; rendu : ${(hote.textContent ?? '').slice(0, 200)}`).toBeTruthy();
    // Les deux éléments dont la réunion déclenchait le défaut sont bien là.
    expect(ligne!.textContent).toContain('12');
    expect(ligne!.querySelector('.sfav'), 'le cœur de la playlist de service manque').not.toBeNull();

    const colonnes = colonnesDeLaLigne();
    expect(
      ligne!.children.length,
      `${ligne!.children.length} éléments dans une grille de ${colonnes} colonnes : le dernier (le cœur) passe à la ligne`,
    ).toBeLessThanOrEqual(colonnes);
  });
});
