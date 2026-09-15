// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Library from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import type { Album, Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const catalogue: Album[] = [
  { id: 1, title: 'Disque local', artist_id: 10, artist_name: 'Artiste partagé', source: 'local' },
  { id: 2, title: 'Disque Asset', artist_id: 10, artist_name: 'Artiste partagé', source: 'upnp', source_id: 'uuid:asset|a' },
  { id: 3, title: 'Disque Sonos', artist_id: 10, artist_name: 'Artiste partagé', source: 'upnp', source_id: 'uuid:sonos|b' },
  { id: 4, title: 'Compilation', artist_id: 20, artist_name: 'Divers', source: 'upnp', source_id: 'uuid:asset|c' },
];
const morceaux: Track[] = [
  { id: 1, title: 'Ballade locale', artist_id: 10, artist_name: 'Artiste partagé', album_id: 1 },
  { id: 2, title: 'Ballade Asset', artist_id: 10, artist_name: 'Artiste partagé', album_id: 2, source: 'upnp', source_id: 'uuid:asset|x' },
  { id: 3, title: 'Ballade Sonos', artist_id: 10, artist_name: 'Artiste partagé', album_id: 3, source: 'upnp', source_id: 'uuid:sonos|y' },
  { id: 4, title: 'Solo compilation', artist_id: 30, artist_name: 'Soliste invité', album_id: 4, source: 'upnp', source_id: 'uuid:asset|z' },
];
let pistes: Track[];
let instance: ReturnType<typeof mount>;
let target: HTMLDivElement;
let lectures: any[];
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); flushSync(); };
const buttons = (selector = 'button') => [...target.querySelectorAll<HTMLButtonElement>(selector)];
const click = async (selector: string, text: string) => {
  const button = buttons(selector).find(b => b.textContent?.trim().startsWith(text));
  expect(button, `${selector} : ${text}`).toBeTruthy(); button!.click(); await flush();
};
const tab = (text: string) => click('button.tab', text);
async function source(text: string) { await click('.filters button.chip', 'Source'); await click('.filters .drop.open .menu button', text); }
async function comptes() { await click('.filters button.chip', 'Source'); return buttons('.filters .drop.open .menu button').map(b => b.textContent!.trim().replace(/\s+/g, ' ')); }
const corps = () => target.querySelector('.body')!.textContent!;

beforeEach(async () => {
  localStorage.clear(); libraryFolderScope.set(null); activeView.set('library'); currentZoneId.set(1);
  pistes = [...morceaux]; lectures = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url);
    let data: unknown = {};
    if (path.includes('/network/library-sources')) data = { items: [{ udn: 'uuid:asset' }, { udn: 'uuid:sonos' }, { udn: 'uuid:absent' }] };
    else if (path.includes('/network/media-servers')) data = [{ id: 'uuid:asset', name: 'Asset' }, { id: 'uuid:sonos', name: 'Sonos' }, { id: 'uuid:absent', name: 'Absent' }];
    else if (/\/artists\/10\/albums/.test(path)) data = catalogue.slice(0, 3);
    else if (/\/artists\/10\/tracks/.test(path)) data = morceaux.slice(0, 3);
    else if (path.includes('/library/artists')) data = [{ id: 10, name: 'Artiste partagé' }, { id: 20, name: 'Divers' }, { id: 30, name: 'Soliste invité' }, { id: 40, name: 'Sans album' }];
    else if (path.includes('/library/tracks')) data = pistes;
    else if (path.includes('/library/stats')) data = { tracks: pistes.length };
    else if (/\/zones\/1\/play/.test(path)) { lectures.push(JSON.parse(String(init?.body))); data = {}; }
    else if (/\/zones|\/playlists/.test(path)) data = [];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  albums.set(catalogue);
  target = document.createElement('div'); document.body.appendChild(target);
  instance = mount(Library, { target }); await flush();
});
afterEach(async () => { await unmount(instance); target.remove(); vi.unstubAllGlobals(); libraryFolderScope.set(null); });

it('garde Source en passant aux pistes, filtre avant la limite de 500 et compte des pistes', async () => {
  pistes = [...Array.from({ length: 501 }, (_, i) => ({ ...morceaux[0], id: 100 + i })), morceaux[1]];
  await source('Asset'); await tab('Pistes');
  expect(corps()).toContain('Ballade Asset');
  expect(corps()).not.toContain('Ballade locale');
  expect(target.querySelector('.filters .count')?.textContent).toContain('1');
  expect(await comptes()).toEqual(expect.arrayContaining(['Toutes les sources 502', 'Local 501', 'UPNP 1', 'Asset 1', 'Absent 0']));
});

it('cumule recherche et source, conserve les choix à zéro et ignore les filtres des albums', async () => {
  await source('Asset'); await tab('Pistes');
  const input = target.querySelector<HTMLInputElement>('.v2-rech input')!;
  input.value = 'solo'; input.dispatchEvent(new Event('input', { bubbles: true })); await flush();
  expect(corps()).toContain('Solo compilation'); expect(corps()).not.toContain('Ballade Asset');
  expect(await comptes()).toEqual(expect.arrayContaining(['Toutes les sources 1', 'Asset 1', 'Local 0', 'Sonos 0']));
  await click('.filters .drop.open .menu button', 'Sonos');
  expect(corps()).not.toContain('Solo compilation');
  expect(corps()).not.toContain('Votre bibliothèque est vide');
  await source('Toutes les sources'); expect(corps()).toContain('Solo compilation');
});

it('compte un artiste partagé une seule fois dans UPnP et inclut les solistes de compilations', async () => {
  await tab('Artistes');
  expect(await comptes()).toEqual(expect.arrayContaining(['Toutes les sources 4', 'Local 1', 'UPNP 3', 'Asset 3', 'Sonos 1']));
  await click('.filters .drop.open .menu button', 'Asset');
  expect(corps()).toContain('Artiste partagé'); expect(corps()).toContain('Soliste invité'); expect(corps()).not.toContain('Sans album');
  await source('Sonos');
  expect(corps()).toContain('Artiste partagé'); expect(corps()).not.toContain('Soliste invité');
  await source('Toutes les sources'); expect(corps()).toContain('Sans album');
});

it('la recherche d’artistes compte les noms d’artistes et la sélection survit au changement d’onglet', async () => {
  await tab('Artistes');
  const input = target.querySelector<HTMLInputElement>('.v2-rech input')!;
  input.value = 'soliste'; input.dispatchEvent(new Event('input', { bubbles: true })); await flush();
  expect(await comptes()).toEqual(expect.arrayContaining(['Toutes les sources 1', 'UPNP 1', 'Asset 1', 'Sonos 0']));
  await click('.filters .drop.open .menu button', 'Asset');
  await tab('Pistes'); expect(corps()).toContain('Solo compilation');
  await tab('Artistes'); expect(corps()).toContain('Soliste invité');
});

it('la fiche artiste et sa lecture restent dans la source choisie', async () => {
  await source('Sonos'); await tab('Artistes');
  await click('.body button', 'Artiste partagé');
  expect(corps()).toContain('Disque Sonos'); expect(corps()).not.toContain('Disque local'); expect(corps()).not.toContain('Disque Asset');
  await click('.body button.fab', 'Toutes les pistes');
  expect(lectures).toEqual([expect.objectContaining({ track_ids: [3], context_type: 'artist' })]);
});


it('UPnP regroupe les serveurs et l’aléatoire exclut les pistes locales', async () => {
  await source('UPNP'); await tab('Pistes');
  expect(corps()).toContain('Ballade Asset'); expect(corps()).toContain('Ballade Sonos');
  expect(corps()).not.toContain('Ballade locale');
  await click('button', 'Aléatoire');
  expect(lectures).toHaveLength(1);
  expect(lectures[0].track_ids.sort()).toEqual([2, 3, 4]);
});
