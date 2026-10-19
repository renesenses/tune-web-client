// @vitest-environment jsdom
/**
 * tune-server-rust#6482 (DidLyon, fils 2320 et 2321) — « Bibliothèque +
 * favoris » : la bascule de l'onglet Albums ajoute les albums favoris des
 * services à la grille, avec leur pastille de provenance, dans le même menu
 * « Source » ; la lecture d'une carte de service part par le service.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Library from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { currentProfileId } from '../stores/profile';
import type { Album } from '../types';
import { albumsDesFavorisDeService, cleCarteAlbum } from '../bibliothequeEtendue';

vi.setConfig({ testTimeout: 30_000 });

const catalogue: Album[] = [
  { id: 1, title: 'Disque local', artist_id: 10, artist_name: 'Artiste local', source: 'local' },
];
const favoris = [
  { id: 7, profile_id: 1, item_type: 'album', service: 'qobuz', service_id: '5099749522428', title: 'Kind Of Blue', artist: 'Miles Davis', cover_url: 'https://static.qobuz.com/x.jpg', first_seen_at: '2026-10-17T15:12:00Z' },
  { id: 8, profile_id: 1, item_type: 'album', service: 'qobuz', service_id: '0888880696069', title: 'Kind Of Blue (Legacy Edition)', artist: 'Miles Davis' },
  // Pas un album, ou en double : écartés.
  { id: 9, profile_id: 1, item_type: 'artist', service: 'qobuz', service_id: '6760', title: 'Miles Davis' },
  { id: 10, profile_id: 1, item_type: 'album', service: 'qobuz', service_id: '5099749522428', title: 'Kind Of Blue' },
];

let instance: ReturnType<typeof mount>;
let target: HTMLDivElement;
let lectures: any[];
let lecturesFavoris: number;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
const buttons = (selector = 'button') => [...target.querySelectorAll<HTMLButtonElement>(selector)];
const bascule = () => buttons('.filters button.chip').find((b) => b.textContent?.trim().startsWith('Bibliothèque + favoris'));
const titres = () => [...target.querySelectorAll('.card .ct')].map((e) => e.textContent?.trim());

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear(); libraryFolderScope.set(null); activeView.set('library'); currentZoneId.set(1); currentProfileId.set(1);
  lectures = []; lecturesFavoris = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url);
    let data: unknown = {};
    if (/\/profiles\/1\/favorites\/streaming\?item_type=album/.test(path)) { lecturesFavoris++; data = favoris; }
    else if (/\/profiles\/1\/favorites\/streaming/.test(path)) data = [];
    else if (/\/zones\/1\/play/.test(path)) { lectures.push(JSON.parse(String(init?.body))); data = {}; }
    else if (path.includes('/library/tracks')) data = [];
    else if (/\/zones|\/playlists|\/network/.test(path)) data = [];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  albums.set(catalogue);
  target = document.createElement('div'); document.body.appendChild(target);
  instance = mount(Library, { target }); await flush();
});
afterEach(async () => { await unmount(instance); target.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); activeView.set('home'); });

it('éteinte par défaut : la grille ne montre que la bibliothèque', async () => {
  expect(bascule(), 'la bascule est offerte sur l’onglet Albums').toBeTruthy();
  expect(titres()).toEqual(['Disque local']);
  expect(lecturesFavoris).toBe(0);
});

it('allumée : les albums favoris du service rejoignent la grille, avec leur pastille', async () => {
  bascule()!.click(); await flush();
  expect(titres()).toEqual(expect.arrayContaining(['Disque local', 'Kind Of Blue', 'Kind Of Blue (Legacy Edition)']));
  expect(titres()).toHaveLength(3);
  const carte = [...target.querySelectorAll('.card')].find((c) => c.querySelector('.ct')?.textContent?.trim() === 'Kind Of Blue')!;
  expect(carte.querySelector('.prov')?.textContent?.trim()).toBe('QOBUZ');
  const locale = [...target.querySelectorAll('.card')].find((c) => c.querySelector('.ct')?.textContent?.trim() === 'Disque local')!;
  expect(locale.querySelector('.prov')).toBeNull();
  // Le choix est retenu sur l'appareil.
  expect(localStorage.getItem('tune.bibliotheque.etendue')).toBe('1');
});

it('le menu Source compte la provenance du service', async () => {
  bascule()!.click(); await flush();
  buttons('.filters button.chip').find((b) => b.textContent?.trim().startsWith('Source'))!.click(); await flush();
  const entrees = buttons('.filters .drop.open .menu button').map((b) => b.textContent!.trim().replace(/\s+/g, ' '));
  expect(entrees).toEqual(expect.arrayContaining(['QOBUZ 2', 'Local 1']));
});

it('la carte d’un album de service se lit par le service', async () => {
  bascule()!.click(); await flush();
  const carte = [...target.querySelectorAll('.card')].find((c) => c.querySelector('.ct')?.textContent?.trim() === 'Kind Of Blue')!;
  const lire = [...carte.querySelectorAll<HTMLButtonElement>('button')].find((b) => /lire|play/i.test(b.getAttribute('aria-label') ?? b.title ?? ''));
  expect(lire, 'bouton Lire de la pochette').toBeTruthy();
  lire!.click(); await flush();
  expect(lectures).toEqual([expect.objectContaining({ streaming_album_id: '5099749522428', source: 'qobuz' })]);
});

it('conversion : albums seulement, dédoublonnés, clé de carte distincte', () => {
  const a = albumsDesFavorisDeService(favoris as any);
  expect(a.map((x) => x.source_id)).toEqual(['5099749522428', '0888880696069']);
  expect(a[0]).toEqual(expect.objectContaining({ id: null, source: 'qobuz', artist_name: 'Miles Davis', added_at: Date.parse('2026-10-17T15:12:00Z') / 1000 }));
  expect(new Set(a.map(cleCarteAlbum)).size).toBe(2);
});
