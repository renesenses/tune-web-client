// @vitest-environment jsdom
//
// web#2971 — recette rc12 (Bertrand, .18, 13/11/2026) : l'entrée « Playlists »
// de la barre latérale (groupe Sélections) ouvrait l'ancien gestionnaire
// (`v2-heritage/PlaylistManagerView`, onglets « Playlists / Smart Playlists /
// Générateur de playlists ») au lieu de `PlaylistsV2` / `PlaylistDetailV2`.
// Toute la fiche playlist de la rc12 (#2914, #2739, #2864) y était invisible.
//
// Cause : la barre elle-même — `SELECTIONS` déclarait l'entrée sur la vue
// `playlistmanager` depuis le 14/09/2026. Aucune préférence en jeu (sur le
// .18 : `startupView: home`, `barreLaterale: null`, niveau Expert).
//
// 🔴 CES TÉMOINS CLIQUENT : la vraie coquille (`ShellV2`), la vraie barre, la
// vraie fiche. Puis ils vérifient que ce que seul l'écran complet sait faire
// (Vérifier la disponibilité, Transférer, Comparer) et le Générateur restent
// à un geste depuis la V2.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';
import { preferences } from '../stores/preferences';
import { normaliserChoixBarre, ordonnerEntrees, estMasquee } from '../ordreBarreLaterale';
import { TOUTES_ENTREES } from '../../components/v2/Sidebar.svelte';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const PL = { id: 7, name: 'Nocturnes', track_count: 1 };
const PISTE = { id: 70, title: 'Clair de lune', artist_name: 'Debussy', album_title: 'Suite', duration_ms: 300000, source: 'local' };

const COLLECTIONS =
  /\/(profiles|zones|devices|shortcuts|collections|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|tags)(\?|\/|$)/;

function corpsPour(url: string): unknown {
  if (/\/playlists\/7\/tracks/.test(url)) return [PISTE];
  if (/\/playlists\/7(\?|$)/.test(url)) return PL;
  if (/\/playlists\/?(\?|$)/.test(url)) return [PL];
  if (/\/playlists\//.test(url)) return [];
  if (/\/smart-playlists/.test(url)) return [];
  return COLLECTIONS.test(url) ? [] : {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}
async function attendreQue(cond: () => boolean, quoi: string, n = 80) {
  for (let i = 0; i < n; i++) {
    if (cond()) return;
    await respirer(); flushSync();
  }
  throw new Error(`jamais vu : ${quoi}`);
}

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

/** L'entrée « Playlists » de la barre, trouvée par son GROUPE et son libellé — pas par sa vue. */
function entreePlaylists(el: HTMLElement): HTMLButtonElement {
  const b = [...el.querySelectorAll<HTMLButtonElement>('nav[data-groupe="selections"] button.nav')]
    .find((x) => x.textContent?.trim() === 'Playlists');
  expect(b, 'pas d’entrée « Playlists » dans Sélections — le témoin ne mesure rien').toBeTruthy();
  return b!;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const corps = corpsPour(String(input));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // Le niveau de Bertrand sur le .18.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' as any, barreLaterale: null as any }));
  activeView.set('home');
  vueDeRetour.set(null);
  detailOuvert.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  document.querySelectorAll('.menu[role="menu"]').forEach((m) => m.parentElement?.remove());
  vi.unstubAllGlobals();
});

describe('web#2971 — « Playlists » ouvre la fiche V2', () => {
  it('🔴 le clic sur l’entrée monte PlaylistsV2, pas l’ancien gestionnaire', async () => {
    const el = poserLaCoquille();
    await souffler();
    entreePlaylists(el).click();
    await souffler();

    expect(get(activeView)).toBe('playlists');
    expect(el.querySelector('section.v2-playlists'), 'PlaylistsV2 n’est pas monté').not.toBeNull();
    expect(el.querySelector('.pm-racine'), 'l’ancien gestionnaire est monté — web#2971').toBeNull();
    expect(entreePlaylists(el).classList.contains('active'), 'l’entrée ne s’allume pas').toBe(true);

    // Et la playlist s'ouvre dans PlaylistDetailV2.
    await attendreQue(() => !!el.querySelector('section.v2-playlists [class*="card"], section.v2-playlists button'), 'la liste');
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { target: { key: 'playlists:7', restore: { id: 7, name: 'Nocturnes' } } },
    }));
    await attendreQue(() => !!el.querySelector('.v2-pldetail'), 'la fiche PlaylistDetailV2');
  });

  it('🔴 depuis la fiche V2, « … › Gestionnaire de playlists » ouvre l’écran complet SUR la playlist', async () => {
    const el = poserLaCoquille();
    await souffler();
    entreePlaylists(el).click();
    await souffler();
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { target: { key: 'playlists:7', restore: { id: 7, name: 'Nocturnes' } } },
    }));
    await attendreQue(() => !!el.querySelector('.v2-pldetail [data-menu-playlist]'), 'le menu « … » de la fiche');
    el.querySelector<HTMLButtonElement>('.v2-pldetail [data-menu-playlist]')!.click();
    await attendreQue(() => !!document.querySelector('[data-ouvrir-gestionnaire-playlist]'), 'l’entrée « Gestionnaire de playlists »');
    document.querySelector<HTMLElement>('[data-ouvrir-gestionnaire-playlist]')!.click();
    await souffler();

    expect(get(activeView)).toBe('playlistmanager');
    await attendreQue(() => !!el.querySelector('.pm-racine'), 'l’écran complet');
    // L'écran complet a ouvert LA playlist demandée : son détail, avec les
    // gestes qui n'existent que là (Transférer, Comparer, Vérifier la disponibilité).
    await attendreQue(() => !!el.querySelector('.pm-racine .detail-header'), 'le détail de la playlist dans l’écran complet');
    // L'entrée de la barre reste allumée : on est toujours « dans Playlists ».
    expect(entreePlaylists(el).classList.contains('active')).toBe(true);
  });

  it('🔴 le Générateur de playlists a sa porte dans PlaylistsV2, et la coquille le monte', async () => {
    const el = poserLaCoquille();
    await souffler();
    entreePlaylists(el).click();
    await attendreQue(() => !!el.querySelector('[data-ouvrir-generateur]'), 'l’onglet Générateur');
    expect(el.querySelector('[data-ouvrir-gestionnaire]'), 'l’onglet Gestionnaire a disparu').not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-ouvrir-generateur]')!.click();
    await souffler();
    expect(get(activeView)).toBe('smart-ai');
    expect(el.querySelector('.smart-ai-view'), 'la route smart-ai ne monte rien').not.toBeNull();
    expect(entreePlaylists(el).classList.contains('active')).toBe(true);
  });
});

describe('web#2971 — un ordre de barre enregistré avec `playlistmanager`', () => {
  it('garde sa place et son masquage sous le nouveau nom', () => {
    const choix = normaliserChoixBarre({ ordre: ['playlistmanager', 'home'], masquees: ['playlistmanager'] })!;
    expect(choix.ordre).toEqual(['playlists', 'home']);
    expect(ordonnerEntrees(TOUTES_ENTREES, ['playlistmanager', 'home'])[0].view).toBe('playlists');
    expect(estMasquee('playlists', { ordre: [], masquees: ['playlistmanager'] })).toBe(true);
  });
});
