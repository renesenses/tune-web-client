// @vitest-environment jsdom
// Vrai écran et vraie API ; les réponses HTTP sont synthétiques, aucun flux joué.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

let instance: ReturnType<typeof mount> | null = null;
let hote: HTMLDivElement;
let appels: { url: URL; method: string }[];
let refusRadio: boolean;
let ancien = get(preferences);
const vide = { artists: [], albums: [], tracks: [], labels: [], playlists: [] };
const fiche = (external_id: string, name: string, my_radio_id: number | null = null) => ({
  external_id, name, my_radio_id, stream_url: 'https://example.invalid/radio', now_playing: false,
});

beforeEach(() => {
  appels = []; refusRadio = false; ancien = get(preferences);
  locale.set('fr');
  preferences.update(p => ({ ...p, searchExact: false }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    appels.push({ url, method: init?.method ?? 'GET' });
    let corps: unknown = [];
    let status = 200;
    if (url.pathname === '/api/v1/search' && url.searchParams.get('sources') === 'radios') {
      status = refusRadio ? 503 : 200;
      corps = refusRadio ? { error: 'synthetic failure' } : {
        radios: [{ id: 7, name: 'BBC Radio 3 Unwind', stream_url: 'https://example.invalid/local', favorite: true }],
        radios_annuaire: { total: 2, items: [
          fiche('S1', 'BBC Radio 3 Unwind', 7), fiche('S2', 'BBC Unwind Extra'),
        ] },
      };
    } else if (url.pathname === '/api/v1/library/search') {
      corps = { ...vide, albums: [{ id: 17, title: 'BBC Unwind album témoin', artist_name: 'Témoin' }] };
    } else if (url.pathname === '/api/v1/search') corps = { local: vide, services: {} };
    return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = null; hote?.remove(); setSearchCriteria(null);
  preferences.set(ancien); vi.unstubAllGlobals();
});

async function chercher(q: string) {
  setSearchCriteria({ q });
  hote = document.createElement('div'); document.body.append(hote);
  instance = mount(SearchV2, { target: hote });
  await vi.waitFor(() => {
    flushSync(); expect(hote.textContent).toContain('BBC Unwind album témoin');
  });
}

it('transmet tous les mots jusqu’à HTTP et affiche les radios sans répéter la station locale', async () => {
  await chercher('BBC unwind');
  await vi.waitFor(() => {
    flushSync(); expect(hote.querySelector('[data-section="radios"]')).not.toBeNull();
  });
  const requetes = appels.filter(a => a.url.pathname === '/api/v1/search' && a.url.searchParams.get('sources') === 'radios');
  expect(requetes).toHaveLength(1);
  expect(requetes[0].url.searchParams.get('q')).toBe('BBC unwind');
  const section = hote.querySelector('[data-section="radios"]')!;
  expect([...section.querySelectorAll('.fiche .nm')].map(n => n.textContent)).toEqual(['BBC Radio 3 Unwind', 'BBC Unwind Extra']);
  expect(section.querySelectorAll('.dedans')).toHaveLength(1);
  expect(appels.filter(a => a.method !== 'GET')).toEqual([]);
});

it('préserve l’ordre saisi et les caractères dans la requête radio', async () => {
  await chercher('unwind BBC & café');
  await vi.waitFor(() => {
    flushSync(); expect(hote.querySelector('[data-section="radios"] .fiche')).not.toBeNull();
  });
  const requetes = appels.filter(a => a.url.searchParams.get('sources') === 'radios');
  expect(requetes).toHaveLength(1);
  expect(requetes[0].url.searchParams.get('q')).toBe('unwind BBC & café');
});

it('un refus radio conserve les résultats de bibliothèque', async () => {
  refusRadio = true;
  await chercher('BBC unwind');
  await vi.waitFor(() => expect(appels.some(a => a.url.searchParams.get('sources') === 'radios')).toBe(true));
  flushSync();
  expect(hote.querySelector('[data-section="radios"]')).toBeNull();
  expect(hote.textContent).toContain('BBC Unwind album témoin');
  expect(appels.filter(a => a.method !== 'GET')).toEqual([]);
});
