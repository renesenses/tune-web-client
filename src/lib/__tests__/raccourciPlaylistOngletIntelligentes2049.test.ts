// @vitest-environment jsdom
//
// renesenses/tune-web-client#2049 — FabienM, fil 2199 point 1, 1.0.0-rc3 :
// « Raccourci sur une playlist ne fonctionne pas ».
//
// UN chemin où le client web échoue, établi en montant la coquille : l'écran
// « Playlists » (`v2-heritage/PlaylistManagerView`) est ouvert sur l'onglet
// « Smart Playlists » (ou « Smart AI »), et l'on clique un raccourci vers une
// playlist (barre latérale, écran Raccourcis). La vue ne change pas, l'écran
// n'est pas remonté : la playlist est bien sélectionnée (cible, clé
// d'historique), mais le gabarit ne dessine le détail que sous l'onglet
// « Playlists » — rien ne s'affiche, l'écran reste sur les intelligentes.
//
// Depuis l'Accueil ou l'écran PlaylistsV2, le raccourci rouvre bien la
// playlist : ces chemins sont gardés ici en témoins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { navigateToShortcut, currentShortcutTarget, clearShortcutTarget, type Shortcut } from '../stores/shortcuts';
import { propositionRaccourciObjet } from '../raccourciObjet';
import { activeView } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';

vi.setConfig({ testTimeout: 60_000 });

const LOCALE = { id: 42, name: 'Nocturnes', track_count: 3 };
const QOBUZ = { source_id: 'q-777', name: 'Sleepy Mix', track_count: 5, source: 'qobuz' };

function corpsPour(url: string): unknown {
  if (url.includes('/playlist-manager/services')) return {};
  if (url.includes('/streaming/services')) return { qobuz: { authenticated: true, enabled: true } };
  if (url.includes('/streaming/qobuz/playlists/q-777')) return [];
  if (url.includes('/streaming/qobuz/playlists')) return [QOBUZ];
  if (/\/playlists\/\d+\/tracks/.test(url)) return [];
  if (/\/playlists\/42(\?|$)/.test(url)) return LOCALE;
  if (/\/playlists(\?|$)/.test(url)) return [LOCALE];
  if (/\/(smart-playlists|smart-collections|smart|profiles|zones|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/.test(url)) return [];
  return {};
}

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement;
let monte: Record<string, any>;

async function tourner(n = 30) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 10)); flushSync(); }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const c = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
  activeView.set('home');
  detailOuvert.set(null);
  clearShortcutTarget();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
});

afterEach(() => {
  unmount(monte);
  hote.remove();
  vi.unstubAllGlobals();
});

const raccourci = (o: object): Shortcut =>
  ({ id: 'sc', name: 'n', icon: '', ...propositionRaccourciObjet(o as any)! }) as unknown as Shortcut;
const LOCALE_SC = () => raccourci({ type: 'playlist', id: 42, nom: 'Nocturnes' });
const QOBUZ_SC = () => raccourci({ type: 'playlist', service: 'qobuz', sourceId: 'q-777', nom: 'Sleepy Mix' });

/** Le détail d'une playlist est à l'écran (son en-tête, son titre). */
const detailAffiche = (nom: string) => {
  const tete = hote.querySelector('.pm-view .detail-header');
  return !!tete && (tete.textContent ?? '').includes(nom);
};

async function surLOngletIntelligentes() {
  activeView.set('playlistmanager');
  await tourner(10);
  const onglets = [...hote.querySelectorAll<HTMLButtonElement>('.view-tabs button.view-tab')];
  expect(onglets.length, 'les onglets de l’écran Playlists').toBe(3);
  onglets[1].click();
  await tourner(5);
  expect(onglets[1].classList.contains('active')).toBe(true);
}

describe('#2049 — un raccourci vers une playlist l’affiche', () => {
  it('témoin : depuis l’Accueil, la playlist locale s’ouvre', async () => {
    await tourner(5);
    navigateToShortcut(LOCALE_SC());
    await tourner();
    expect(get(activeView)).toBe('playlistmanager');
    expect(detailAffiche('Nocturnes')).toBe(true);
  });

  it('🔴 depuis l’onglet « Smart Playlists » de l’écran Playlists, la playlist locale s’affiche', async () => {
    await surLOngletIntelligentes();
    navigateToShortcut(LOCALE_SC());
    await tourner();
    expect(get(currentShortcutTarget)?.key).toBe('playlists:42');
    expect(detailAffiche('Nocturnes'), 'sélectionnée mais cachée sous l’onglet des intelligentes').toBe(true);
  });

  it('🔴 depuis l’onglet « Smart Playlists », une playlist Qobuz s’affiche aussi', async () => {
    await surLOngletIntelligentes();
    navigateToShortcut(QOBUZ_SC());
    await tourner();
    expect(get(currentShortcutTarget)?.key).toBe('streamingplaylists:qobuz:q-777');
    expect(detailAffiche('Sleepy Mix'), 'sélectionnée mais cachée sous l’onglet des intelligentes').toBe(true);
  });
});
