// @vitest-environment jsdom
// web#3230 (fil 2864, point 14) — recherche, section Playlists : les playlists
// Qobuz s'affichaient sans vignette (case grise et ▶) alors que le serveur
// rend `cover_path` (et `covers` pour la mosaïque). Vrai écran, vraie API ;
// réponses HTTP synthétiques, aucun flux joué.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

let instance: ReturnType<typeof mount> | null = null;
let hote: HTMLDivElement;
let ancien = get(preferences);
let playlistsQobuz: unknown[];
const vide = { artists: [], albums: [], tracks: [], labels: [], playlists: [] };

beforeEach(() => {
  ancien = get(preferences);
  locale.set('fr');
  preferences.update(p => ({ ...p, searchExact: false }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    let corps: unknown = [];
    if (url.pathname === '/api/v1/library/search') {
      corps = { ...vide, albums: [{ id: 17, title: 'Album témoin fontaine', artist_name: 'Témoin' }] };
    } else if (url.pathname === '/api/v1/search' && url.searchParams.get('sources') !== 'radios') {
      corps = { local: vide, services: { qobuz: { ...vide, playlists: playlistsQobuz } } };
    } else if (url.pathname === '/api/v1/search') {
      corps = { radios: [], radios_annuaire: { total: 0, items: [] } };
    }
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = null; hote?.remove(); setSearchCriteria(null);
  preferences.set(ancien); vi.unstubAllGlobals();
});

async function lignes(q: string) {
  setSearchCriteria({ q });
  hote = document.createElement('div'); document.body.append(hote);
  instance = mount(SearchV2, { target: hote });
  await vi.waitFor(() => {
    flushSync(); expect(hote.querySelectorAll('.plhote').length).toBe(playlistsQobuz.length);
  });
  return [...hote.querySelectorAll('.plhote')];
}

it('épreuve : chaque playlist Qobuz trouvée montre sa pochette dans la case ▶', async () => {
  playlistsQobuz = [
    { source_id: '101', name: 'i love you so', track_count: 46, cover_path: 'https://static.qobuz.example/pl101.jpg' },
    { source_id: '102', name: 'all fontaines d.c.', track_count: 94, cover_path: null,
      covers: ['https://static.qobuz.example/a.jpg', 'https://static.qobuz.example/b.jpg'] },
  ];
  const [l1, l2] = await lignes('fontaine');
  await vi.waitFor(() => {
    flushSync();
    expect(l1.querySelector('.plg.lire .plimg img')?.getAttribute('src')).toContain('pl101.jpg');
    expect(l2.querySelector('.plg.lire .plimg img')?.getAttribute('src')).toContain('a.jpg');
  });
  // Le ▶ reste là : la case lance toujours la lecture.
  expect(l1.querySelector('.plg.lire svg')).not.toBeNull();
  expect(l1.querySelector('.plg.lire')?.classList.contains('avecimg')).toBe(true);
});

it('contre-épreuve : sans image servie, la case reste ▶ seul, sans image cassée', async () => {
  playlistsQobuz = [{ source_id: '103', name: 'fontaine nue', track_count: 3 }];
  const [l] = await lignes('fontaine');
  flushSync();
  expect(l.querySelector('.plg.lire .plimg')).toBeNull();
  expect(l.querySelector('.plg.lire')?.classList.contains('avecimg')).toBe(false);
  expect(l.querySelector('.plg.lire svg')).not.toBeNull();
});
