// @vitest-environment jsdom
// tune-server-rust#7335 (laguespa, fil forum 2510) — « Créer » une playlist
// répond 201 (id 231, puis 232) mais elle n'apparaît pas dans l'écran
// Playlists. Le serveur trie par ordre alphabétique et `getPlaylists()` ne
// demandait qu'UNE page de 100 : au-delà, la playlist « test » tombait hors
// de la première page. Serveur HTTP synthétique qui respecte `limit`/`offset`
// comme `GET /api/v1/playlists` (tri alphabétique, `tranche`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import * as api from '../api';
import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { locale } from '../i18n';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let playlists: { id: number; name: string; track_count: number }[];
let ignorerOffset: boolean;
let lecturesListe: number;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

/** 150 playlists « Liste 001 »…« Liste 150 », puis « test » (id 231), qui trie après. */
function bibliothequeDeLaguespa() {
  playlists = Array.from({ length: 150 }, (_, i) => ({
    id: i + 1, name: `Liste ${String(i + 1).padStart(3, '0')}`, track_count: 0,
  }));
  playlists.push({ id: 231, name: 'test', track_count: 0 });
}

beforeEach(() => {
  bibliothequeDeLaguespa(); ignorerOffset = false; lecturesListe = 0;
  localStorage.clear(); locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  detailOuvert.set(null); ongletCourant.set(null); activeView.set('playlists');
  hote = document.createElement('div'); document.body.append(hote);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(String(url), window.location.href);
    if (u.pathname === '/api/v1/playlists') {
      lecturesListe++;
      const tries = [...playlists].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id);
      const limit = Number(u.searchParams.get('limit') ?? 50);
      const offset = ignorerOffset ? 0 : Number(u.searchParams.get('offset') ?? 0);
      return json(tries.slice(offset, offset + limit));
    }
    return json([]);
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); detailOuvert.set(null); ongletCourant.set(null);
  vi.unstubAllGlobals();
});

describe('#7335 — plus de 100 playlists : toutes sont rendues', () => {
  it('getPlaylists() rend les 151 playlists, « test » comprise', async () => {
    const toutes = await api.getPlaylists();
    expect(toutes, '#7335 : getPlaylists() s\'arrête à la première page de 100').toHaveLength(151);
    expect(toutes.some((p) => p.name === 'test')).toBe(true);
    expect(new Set(toutes.map((p) => p.id)).size).toBe(151);
    expect(lecturesListe).toBe(2);
  });

  it('l\'écran Playlists montre la playlist « test » créée en 151e position', async () => {
    composant = mount(PlaylistsV2, { target: hote });
    flushSync(); await stabiliser();
    await vi.waitFor(() => expect(hote.querySelectorAll('.card.local').length).toBeGreaterThan(0));
    const noms = [...hote.querySelectorAll('.card.local .ct')].map((e) => e.textContent?.trim());
    expect(noms, '#7335 : la playlist « test » n\'est pas rendue').toContain('test');
    expect(noms).toHaveLength(151);
  });

  it('une page complète puis une page courte : la lecture s\'arrête', async () => {
    playlists = playlists.slice(0, 100);
    const toutes = await api.getPlaylists();
    expect(toutes).toHaveLength(100);
    expect(lecturesListe).toBe(2);
  });

  it('un serveur qui ignore offset ne fait pas boucler la lecture', async () => {
    ignorerOffset = true;
    const toutes = await api.getPlaylists();
    expect(toutes).toHaveLength(100);
    expect(lecturesListe).toBe(2);
  });
});
