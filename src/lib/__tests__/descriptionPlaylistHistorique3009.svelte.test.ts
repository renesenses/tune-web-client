// @vitest-environment jsdom
//
// Fil 3009, point 8 (FabienM, v1.0.0-rc13) — « Menu historique : quand on
// clique sur le conteneur Playlist, on ouvre la page de la playlist mais il
// manque le texte descriptif de la playlist. »
//
// L'Historique ouvre une playlist de service par `ouvrirPlaylistDeService`,
// qui ne connaît que son identifiant, son nom et sa pochette : la fiche
// arrivait sans `description`. Ouverte depuis la liste des playlists, la même
// fiche l'avait, parce que `/streaming/{service}/playlists` la porte. La
// fiche la demande désormais au service quand elle lui manque.
//
// Contre-épreuve : avec `PlaylistDetailV2` de `origin/main` (a10e4118), la
// fiche montée comme l'Historique la monte n'affiche aucune description, et
// ne demande jamais `GET /streaming/qobuz/playlists/65607848` : le témoin
// rougit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { descriptionDePlaylist } from '../descriptionPlaylist';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { streamingServices } from '../stores/streaming';

vi.setConfig({ testTimeout: 60_000 });

const DESCRIPTION = 'Le meilleur du R&B et de la néo-soul pour un dimanche tranquille.';

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const urls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  currentZoneId.set(1);
  activeView.set('playlists');
  streamingServices.set({ qobuz: { enabled: true, authenticated: true, username: 'fabien' } } as any);
  urls.length = 0;
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    urls.push(u);
    const c = /\/streaming\/qobuz\/playlists\/65607848(\?|$)/.test(u)
      ? { source_id: '65607848', name: 'Dimanche R&B / Neo-Soul', description: DESCRIPTION, cover_path: null, track_count: 2 }
      : [];
    return {
      ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  localStorage.clear();
  streamingServices.set({});
  vi.unstubAllGlobals();
});

async function tourner(n = 12) { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } }

function monter(pl: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'streaming', service: 'qobuz', pl }, onClose: () => {} } as any,
  });
  flushSync();
}

describe('fil 3009, point 8 — la description d’une playlist ouverte depuis l’Historique', () => {
  it('la fiche reçue SANS description (forme de `ouvrirPlaylistDeService`) la demande au service et l’affiche', async () => {
    // Exactement ce que `ouvrirPlaylistDeService` passe à la fiche.
    monter({ source_id: '65607848', name: 'Dimanche R&B / Neo-Soul', track_count: 0, duration_ms: 0, cover_path: null, source: 'qobuz' });
    await tourner();
    expect(urls.some((u) => /\/streaming\/qobuz\/playlists\/65607848(\?|$)/.test(u)), 'la fiche n’a pas demandé la playlist au service').toBe(true);
    const d = hote!.querySelector('[data-description-playlist]');
    expect(d, 'la description de la playlist manque').not.toBeNull();
    expect(d!.textContent?.trim()).toBe(DESCRIPTION);
  });

  it('une fiche qui porte déjà sa description ne redemande rien', async () => {
    monter({ source_id: '65607848', name: 'Dimanche R&B / Neo-Soul', description: 'Déjà là', track_count: 0, cover_path: null });
    await tourner();
    expect(urls.some((u) => /\/streaming\/qobuz\/playlists\/65607848(\?|$)/.test(u))).toBe(false);
    expect(hote!.querySelector('.desc')?.textContent?.trim()).toBe('Déjà là');
  });

  it('relecture du 23/11 : un service non connecté n’est pas interrogé', async () => {
    streamingServices.set({ qobuz: { enabled: true, authenticated: false, username: 'fabien' } } as any);
    monter({ source_id: '65607848', name: 'Dimanche R&B / Neo-Soul', track_count: 0, duration_ms: 0, cover_path: null, source: 'qobuz' });
    await tourner();
    expect(urls.some((u) => /\/streaming\/qobuz\/playlists\/65607848(\?|$)/.test(u))).toBe(false);
    expect(hote!.querySelector('[data-description-playlist]')).toBeNull();
  });

  it('descriptionDePlaylist : une chaîne vide ou d’espaces n’est pas une description', () => {
    expect(descriptionDePlaylist({ description: '  ' })).toBeNull();
    expect(descriptionDePlaylist({ description: 42 })).toBeNull();
    expect(descriptionDePlaylist(null)).toBeNull();
    expect(descriptionDePlaylist({ description: ' Soul ' })).toBe('Soul');
  });
});
