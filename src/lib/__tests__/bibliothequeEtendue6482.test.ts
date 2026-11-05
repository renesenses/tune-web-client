// @vitest-environment jsdom
/**
 * tune-server-rust#6482 (DidLyon, fils 2320 et 2321) — les albums favoris des
 * services rejoignent la grille de l'onglet Albums, avec leur pastille de
 * provenance, dans le même menu « Source » ; la lecture d'une carte de service
 * part par le service.
 *
 * tune-server-rust#7780 (fil 2635) — ce n'est plus un bouton « Bibliothèque +
 * favoris » mais le réglage « Bibliothèque élargie aux favoris des services »
 * du profil, tenu par le serveur et ACTIVÉ par défaut.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Library from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { currentProfileId } from '../stores/profile';
import type { Album } from '../types';
import { albumsDesFavorisDeService, bibliothequeEtendueActive, cleCarteAlbum, reglageEtendueLu } from '../bibliothequeEtendue';

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
/** Ce que rend `GET /profiles/1/settings/bibliotheque-etendue` ; `null` : route absente (serveur ancien). */
let reglage: boolean | null;
let urlsFavoris: string[];
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
const buttons = (selector = 'button') => [...target.querySelectorAll<HTMLButtonElement>(selector)];
const titres = () => [...target.querySelectorAll('.card .ct')].map((e) => e.textContent?.trim());

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear(); libraryFolderScope.set(null); activeView.set('library'); currentZoneId.set(1); currentProfileId.set(1);
  lectures = []; lecturesFavoris = 0; urlsFavoris = [];
  bibliothequeEtendueActive.set(true); reglageEtendueLu.set(false);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url);
    let data: unknown = {};
    if (/\/profiles\/1\/settings\/bibliotheque-etendue/.test(path)) {
      if (reglage === null) return new Response('{"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      data = { enabled: reglage };
    }
    else if (/\/profiles\/1\/favorites\/streaming\?item_type=album/.test(path)) { lecturesFavoris++; urlsFavoris.push(path); data = favoris; }
    else if (/\/profiles\/1\/favorites\/streaming/.test(path)) data = [];
    else if (/\/zones\/1\/play/.test(path)) { lectures.push(JSON.parse(String(init?.body))); data = {}; }
    else if (path.includes('/library/tracks')) data = [];
    else if (/\/zones|\/playlists|\/network/.test(path)) data = [];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  albums.set(catalogue);
  target = document.createElement('div'); document.body.appendChild(target);
});
async function monter(valeur: boolean | null) {
  reglage = valeur;
  instance = mount(Library, { target }); await flush();
}
afterEach(async () => { if (instance) await unmount(instance); target.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); activeView.set('home'); });

it('#7780 — le bouton « Bibliothèque + favoris » a disparu', async () => {
  await monter(true);
  expect(buttons('.filters button.chip').some((b) => /Bibliothèque \+ favoris|Library \+ favorites/.test(b.textContent ?? ''))).toBe(false);
});

it('#7780 — réglage activé : les albums favoris du service rejoignent la grille, avec leur pastille', async () => {
  await monter(true);
  expect(titres()).toEqual(expect.arrayContaining(['Disque local', 'Kind Of Blue', 'Kind Of Blue (Legacy Edition)']));
  expect(titres()).toHaveLength(3);
  const carte = [...target.querySelectorAll('.card')].find((c) => c.querySelector('.ct')?.textContent?.trim() === 'Kind Of Blue')!;
  expect(carte.querySelector('.prov')?.textContent?.trim()).toBe('QOBUZ');
  const locale = [...target.querySelectorAll('.card')].find((c) => c.querySelector('.ct')?.textContent?.trim() === 'Disque local')!;
  expect(locale.querySelector('.prov')).toBeNull();
  // L'appel est marqué « pour la Bibliothèque » : le serveur le vide si le réglage est désactivé.
  expect(urlsFavoris.every((u) => u.includes('pour=bibliotheque'))).toBe(true);
});

it('#7780 — activé par défaut : un serveur qui ne connaît pas le réglage montre aussi les favoris', async () => {
  await monter(null);
  expect(titres()).toHaveLength(3);
});

it('#7780 — réglage désactivé : seule la bibliothèque locale apparaît', async () => {
  await monter(false);
  expect(titres()).toEqual(['Disque local']);
  expect(lecturesFavoris).toBe(0);
});

it('#7780 — réglage activé : le menu Source compte le service et filtre dessus', async () => {
  await monter(true);
  const source = () => buttons('.filters button.chip').find((b) => b.textContent?.trim().startsWith('Source'))!;
  source().click(); await flush();
  const menu = () => buttons('.filters .drop.open .menu button');
  const entrees = menu().map((b) => b.textContent!.trim().replace(/\s+/g, ' '));
  expect(entrees).toEqual(expect.arrayContaining(['QOBUZ 2', 'Local 1']));
  menu().find((b) => b.textContent!.trim().startsWith('QOBUZ'))!.click(); await flush();
  expect(titres().sort()).toEqual(['Kind Of Blue', 'Kind Of Blue (Legacy Edition)']);
});

it('la carte d’un album de service se lit par le service', async () => {
  await monter(true);
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

it('#7780 — changer le réglage l’écrit pour le profil, et revient en arrière si le serveur refuse', async () => {
  const { changerReglageEtendue } = await import('../bibliothequeEtendue');
  const { get } = await import('svelte/store');
  const ecrits: unknown[] = [];
  let refuser = false;
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    if (/\/profiles\/1\/settings\/bibliotheque-etendue/.test(String(url)) && init?.method === 'PUT') {
      ecrits.push(JSON.parse(String(init.body)));
      if (refuser) return new Response('{"error":"x"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      return new Response(String(init.body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  await changerReglageEtendue(1, false);
  expect(ecrits).toEqual([{ enabled: false }]);
  expect(get(bibliothequeEtendueActive)).toBe(false);
  refuser = true;
  await expect(changerReglageEtendue(1, true)).rejects.toBeTruthy();
  expect(get(bibliothequeEtendueActive), 'refus du serveur : la valeur d’avant revient').toBe(false);
});
