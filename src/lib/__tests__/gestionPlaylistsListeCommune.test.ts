// @vitest-environment jsdom
//
// « Gestion des playlists » rend la LISTE COMMUNE — Bertrand, 23/09/2026.
//
// L'écran hérité rendait sa propre liste de pistes : le troisième rendu de
// piste du client, avec lire, lire-à-partir-d'ici, file, cœur, retirer — et
// SANS les étiquettes ni le menu « … » que `PisteActions` porte partout
// ailleurs. La seule chose que `ListePistesV2` ne savait pas faire était le
// glisser-déposer de réordonnancement. Il y est désormais (opt-in), et
// l'écran s'y branche.
//
// Ce que ce fichier tient, EN MONTANT les composants (jsdom, pas `node` :
// sans `window`, le runtime client de Svelte ne rend rien et tout passerait
// au vert à vide) :
//
//   1. chaque piste de la fiche porte la barre `PisteActions` complète —
//      étiquettes et « … » compris, les deux gestes que l'écran n'avait pas ;
//   2. « retirer » appelle la route de retrait, avec le rang ;
//   3. réordonner — au GLISSER comme au CLAVIER — appelle la route d'ordre
//      avec les identifiants dans le nouvel ordre ;
//   4. sans la prop `reordonnable`, `ListePistesV2` ne change RIEN : ni
//      poignée, ni attribut `draggable` — les autres écrans ne bougent pas ;
//   5. garde de source : plus aucun rendu de piste maison dans l'écran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount, type Component } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { preferences } from '../stores/preferences';
import {
  pendingPlaylistId,
  playlists,
  playlistsLoaded,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';
import type { Track } from '../types';

// Monter un écran de plus de quatre mille lignes compile beaucoup : 5 s
// donneraient un rouge de CHARGE, pas de code.
vi.setConfig({ testTimeout: 60_000 });

const FR = fr as Record<string, string>;
const PISTES: Track[] = [
  { id: 101, title: 'Première', artist_name: 'A', album_title: 'X', duration_ms: 1000, source: 'local' } as Track,
  { id: 102, title: 'Deuxième', artist_name: 'B', album_title: 'X', duration_ms: 2000, source: 'local' } as Track,
  { id: 103, title: 'Troisième', artist_name: 'C', album_title: 'X', duration_ms: 3000, source: 'local' } as Track,
];

/** Ce que le faux serveur a reçu : la méthode, l'URL et le corps. */
let appels: { method: string; url: string; body: unknown }[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/playlists/42/tracks')) return PISTES;
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 42, name: 'Nocturnes', track_count: 3 }];
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 4) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

async function monter<P extends Record<string, unknown>>(Vue: Component<P>, props: P) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue, { target: hote, props });
  flushSync();
  await souffler();
  return hote;
}

/** La fiche de la playlist 42, ouverte : `loadAll()` lit `pendingPlaylistId`. */
async function monterLaFiche() {
  pendingPlaylistId.set(42);
  const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
  await souffler(6);
  expect(appels.some((a) => a.url.includes('/playlists/42/tracks')), 'la fiche n’a pas chargé ses pistes').toBe(true);
  return el;
}

const lignes = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.track-list [role="row"].trow'));
const poignees = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('.poignee'));
const dernierAppel = (motif: RegExp) => [...appels].reverse().find((a) => motif.test(`${a.method} ${a.url}`));

beforeEach(() => {
  appels = [];
  localStorage.clear();
  locale.set('fr');
  // Expert rend le TABLEAU (`MODES_BRANCHES`) : c'est la forme qu'ont les
  // fiches de playlist ; le mode lignes est éprouvé à part, plus bas.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = init?.body; }
      appels.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(url), body });
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.unstubAllGlobals();
});

describe('Gestion des playlists — la liste commune', () => {
  it('🔴 chaque piste porte la barre PisteActions : étiquettes ET « … »', async () => {
    const el = await monterLaFiche();
    const rangs = lignes(el);
    expect(rangs.length, 'aucune ligne de la liste commune peinte').toBe(PISTES.length);
    for (const ligne of rangs) {
      expect(ligne.querySelector('.pactions'), 'ligne sans barre PisteActions').not.toBeNull();
      const libelles = Array.from(ligne.querySelectorAll('button[aria-label]')).map((b) => b.getAttribute('aria-label'));
      expect(libelles, 'pas de bouton Étiquettes').toContain(FR['v2.cover.tags']);
      expect(libelles, 'pas de menu « … »').toContain(FR['library.moreOptions']);
      expect(libelles, 'pas de bouton Retirer').toContain(FR['playlist.remove']);
    }
  });

  it('« retirer » appelle la route de retrait avec le RANG', async () => {
    const el = await monterLaFiche();
    const retirer = lignes(el)[1].querySelector<HTMLButtonElement>(`button[aria-label="${FR['playlist.remove']}"]`);
    expect(retirer).not.toBeNull();
    retirer!.click();
    await souffler();
    const appel = dernierAppel(/^POST .*\/playlists\/42\/tracks\/remove$/);
    expect(appel, 'aucun appel de retrait').toBeDefined();
    expect(appel!.body).toEqual({ position: 1 });
  });

  it('🔴 glisser la première ligne sur la troisième réordonne, et le serveur reçoit le nouvel ordre', async () => {
    const el = await monterLaFiche();
    const rangs = lignes(el);
    expect(rangs[0].getAttribute('draggable')).toBe('true');
    rangs[0].dispatchEvent(new Event('dragstart'));
    rangs[2].dispatchEvent(new Event('dragover', { cancelable: true }));
    rangs[2].dispatchEvent(new Event('drop', { cancelable: true }));
    await souffler();
    const appel = dernierAppel(/^PUT .*\/playlists\/42\/tracks$/);
    expect(appel, 'aucun appel de réordonnancement').toBeDefined();
    expect(appel!.body).toEqual({ track_ids: [102, 103, 101] });
    // L'écran a bougé aussi, sans attendre le serveur.
    expect(lignes(el).map((l) => l.querySelector('.ttxt')?.textContent)).toEqual(['Deuxième', 'Troisième', 'Première']);
  });

  it('↓ sur la poignée descend la piste d’un rang — le même geste que la file, au clavier', async () => {
    const el = await monterLaFiche();
    const p = poignees(el);
    expect(p.length).toBe(PISTES.length);
    expect(p[0].getAttribute('aria-label')).toBe(FR['v2.liste.poignee']);
    p[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await souffler();
    const appel = dernierAppel(/^PUT .*\/playlists\/42\/tracks$/);
    expect(appel, 'aucun appel de réordonnancement au clavier').toBeDefined();
    expect(appel!.body).toEqual({ track_ids: [102, 101, 103] });
    // Le focus SUIT la piste déplacée : la poignée du rang 1 est active.
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-rang')).toBe('1');
    // ↑ sur la première ligne : rien ne part, il n'y a pas de rang au-dessus.
    const avant = appels.length;
    poignees(el)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await souffler();
    expect(appels.length).toBe(avant);
  });

  it('lâcher une ligne sur elle-même ne fait rien', async () => {
    const el = await monterLaFiche();
    const rangs = lignes(el);
    const avant = appels.length;
    rangs[1].dispatchEvent(new Event('dragstart'));
    rangs[1].dispatchEvent(new Event('drop', { cancelable: true }));
    await souffler();
    expect(appels.length).toBe(avant);
  });
});

describe('ListePistesV2 — le réordonnancement est OPT-IN', () => {
  const props = { pistes: PISTES, onLire: () => {} };

  it('sans la prop, ni poignée ni `draggable` : le rendu des autres écrans ne bouge pas (tableau)', async () => {
    const el = await monter(ListePistesV2, props);
    expect(el.querySelectorAll('.trow').length).toBe(PISTES.length);
    expect(poignees(el).length).toBe(0);
    expect(el.querySelector('[draggable]')).toBeNull();
    expect(el.querySelector('.tbl.reordonnable')).toBeNull();
  });

  it('avec la prop : une poignée par ligne, et la ligne se saisit (tableau)', async () => {
    const el = await monter(ListePistesV2, { ...props, reordonnable: true, onReordonner: () => {} });
    expect(poignees(el).length).toBe(PISTES.length);
    expect(el.querySelectorAll('.trow[draggable="true"]').length).toBe(PISTES.length);
    // La colonne de la poignée est dans l'EN-TÊTE aussi : un seul gabarit.
    expect(el.querySelectorAll('.thead .th').length).toBe(el.querySelector('.trow')!.children.length);
  });

  it('en mode LIGNES aussi : sans la prop rien, avec la prop une poignée par ligne', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    const nu = await monter(ListePistesV2, props);
    expect(nu.querySelectorAll('.trk').length).toBe(PISTES.length);
    expect(poignees(nu).length).toBe(0);
    expect(nu.querySelector('[draggable]')).toBeNull();
    expect(nu.querySelector('.avecSuffixe')).toBeNull();
    unmount(monte!);
    monte = null;
    hote!.remove();

    const de: [number, number][] = [];
    const el = await monter(ListePistesV2, { ...props, reordonnable: true, onReordonner: (a: number, b: number) => { de.push([a, b]); } });
    expect(poignees(el).length).toBe(PISTES.length);
    const enveloppes = Array.from(el.querySelectorAll<HTMLElement>('.avecSuffixe.avecPoignee[draggable="true"]'));
    expect(enveloppes.length).toBe(PISTES.length);
    enveloppes[2].dispatchEvent(new Event('dragstart'));
    enveloppes[0].dispatchEvent(new Event('drop', { cancelable: true }));
    expect(de).toEqual([[2, 0]]);
  });
});

describe('garde de source', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2-heritage/PlaylistManagerView.svelte'), 'utf8');

  it('🔴 l’écran rend la liste commune, réordonnable, avec « retirer » en suffixe', () => {
    expect(src).toMatch(/<ListePistesV2 pistes=\{detailTracks\}/);
    expect(src).toContain('reordonnable={!!selectedPlaylist}');
    expect(src).toContain('onReordonner={reorderTracks}');
    expect(src).toMatch(/apres=\{selectedPlaylist \? retirer : undefined\}/);
    expect(src).toContain('api.reorderPlaylistTracks(selectedPlaylist.id, trackIds)');
    expect(src).toContain('api.removePlaylistTrackAt(selectedPlaylist.id, position)');
  });

  it('🔴 plus aucun rendu de piste maison', () => {
    for (const vestige of ['track-item', 'dragIndex', 'dragOverIndex', 'add-queue-btn', 'play-from-here-btn',
      'add-playlist-btn', '<HeartButton trackId', 'addTrackToQueue', 'formatAudioBadge', 'estLaPisteEnLecture']) {
      expect(src, `vestige de la liste maison : ${vestige}`).not.toContain(vestige);
    }
  });
});
