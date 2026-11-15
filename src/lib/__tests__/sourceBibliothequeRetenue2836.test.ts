// @vitest-environment jsdom
//
// renesenses/tune-web-client#2836 — Didier, fil 2753, rc11 : Source = « Local »
// dans la Bibliothèque, un détour par Streaming › Qobuz, et au retour la
// Bibliothèque est revenue à « Toutes les sources ». `fProvenance` était un
// simple état du composant, remis à `null` à chaque montage.
//
// Ces témoins montent la VRAIE Bibliothèque, choisissent une source, la
// démontent (ce que fait `ShellV2` en changeant d'écran) et la remontent.
//
// Contre-épreuve : `LibraryV2.svelte` remis à `origin/main` fait rougir les
// témoins « retient Local », « serveur encore indexé » et « serveur retiré
// réécrit le stockage ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Library from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { CLE_SOURCE_BIBLIOTHEQUE, relireProvenance, verdictProvenanceRetenue } from '../provenanceBibliotheque';
import { _remiseAZeroPourTests as oublierLesPistes } from '../stores/pistesEntieres';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const CLE_STOCKAGE = 'tune_v2_ecran_' + CLE_SOURCE_BIBLIOTHEQUE;
const catalogue: Album[] = [
  { id: 1, title: 'Disque local', artist_id: 10, artist_name: 'Artiste A', source: 'local' },
  { id: 2, title: 'Disque Sonos', artist_id: 20, artist_name: 'Artiste B', source: 'upnp', source_id: 'uuid:sonos|b' },
];

let instance: ReturnType<typeof mount> | null = null;
let target: HTMLDivElement;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); flushSync(); };
const buttons = (selector: string) => [...target.querySelectorAll<HTMLButtonElement>(selector)];
async function click(selector: string, text: string) {
  const b = buttons(selector).find(x => x.textContent?.trim().startsWith(text));
  expect(b, `${selector} : ${text}`).toBeTruthy(); b!.click(); await flush();
}
async function source(text: string) { await click('.filters button.chip', 'Source'); await click('.filters .drop.open .menu button', text); }
const pilule = () => buttons('.filters button.chip').find(b => b.textContent?.trim().startsWith('Source'))!.textContent!.replace(/\s+/g, ' ').trim();
const corps = () => target.querySelector('.body')!.textContent!;
async function monter() { instance = mount(Library, { target }); await flush(); }
async function demonter() { if (instance) await unmount(instance); instance = null; }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear(); libraryFolderScope.set(null); activeView.set('library'); currentZoneId.set(1);
  oublierLesPistes();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const path = String(url);
    let data: unknown = {};
    if (path.includes('/network/library-sources')) data = { items: [{ udn: 'uuid:sonos' }] };
    else if (path.includes('/network/media-servers')) data = [{ id: 'uuid:sonos', name: 'Sonos', reachable: true }];
    else if (path.includes('/library/artists')) data = [];
    else if (path.includes('/library/tracks')) data = [];
    else if (path.includes('/library/stats')) data = { tracks: 0 };
    else if (/\/zones|\/playlists/.test(path)) data = [];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  albums.set(catalogue);
  target = document.createElement('div'); document.body.appendChild(target);
});
afterEach(async () => {
  await demonter(); target.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  vi.restoreAllMocks(); localStorage.clear(); activeView.set('home');
});

describe('web#2836 — la Source de la Bibliothèque survit à un changement d’écran', () => {
  it('retient « Local » : au retour, la pilule et la grille sont toujours filtrées', async () => {
    await monter();
    await source('Local');
    expect(corps()).not.toContain('Disque Sonos');
    await demonter();
    await monter();
    expect(pilule()).toContain('Local');
    expect(corps()).toContain('Disque local');
    expect(corps()).not.toContain('Disque Sonos');
  });

  it('« Toutes les sources » choisi à la main est retenu aussi', async () => {
    localStorage.setItem(CLE_STOCKAGE, 'local');
    await monter();
    await source('Toutes les sources');
    await demonter();
    await monter();
    expect(corps()).toContain('Disque Sonos');
    expect(corps()).toContain('Disque local');
  });

  it('un serveur UPnP encore indexé reste choisi', async () => {
    localStorage.setItem(CLE_STOCKAGE, 'upnp:uuid:sonos');
    await monter();
    expect(pilule()).toContain('Sonos');
    expect(corps()).toContain('Disque Sonos');
    expect(corps()).not.toContain('Disque local');
  });

  it('un serveur UPnP retiré depuis vaut « Toutes les sources », sans grille vide', async () => {
    localStorage.setItem(CLE_STOCKAGE, 'upnp:uuid:retire');
    await monter();
    expect(corps()).toContain('Disque local');
    expect(corps()).toContain('Disque Sonos');
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe('');
  });

  it('une source de service retenue (Qobuz) survit au remontage, même avant ses albums', async () => {
    localStorage.setItem(CLE_STOCKAGE, 'qobuz');
    await monter();
    expect(pilule()).toContain('QOBUZ');
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe('qobuz');
  });

  it('un stockage indisponible ne casse pas l’écran : toutes les sources', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqué'); });
    await monter();
    expect(corps()).toContain('Disque local');
    expect(corps()).toContain('Disque Sonos');
    await source('Local');
    expect(corps()).not.toContain('Disque Sonos');
  });
});

describe('web#2836 — relecture et verdict', () => {
  it('relit une clé, rend « Toutes » pour le vide ou le démesuré', () => {
    expect(relireProvenance('local')).toBe('local');
    expect(relireProvenance('  upnp:uuid:x ')).toBe('upnp:uuid:x');
    expect(relireProvenance('')).toBeNull();
    expect(relireProvenance(null)).toBeNull();
    expect(relireProvenance('x'.repeat(201))).toBeNull();
  });

  it('garde les entrées fixes, attend ce qui n’est pas arrivé, oublie un serveur retiré', () => {
    expect(verdictProvenanceRetenue('local', { presentes: null, serveurs: null })).toBe('garder');
    expect(verdictProvenanceRetenue('upnp', { presentes: [], serveurs: [] })).toBe('garder');
    expect(verdictProvenanceRetenue('upnp:a', { presentes: null, serveurs: null })).toBe('attendre');
    expect(verdictProvenanceRetenue('upnp:a', { presentes: [], serveurs: null })).toBe('attendre');
    expect(verdictProvenanceRetenue('upnp:a', { presentes: null, serveurs: ['upnp:a'] })).toBe('garder');
    expect(verdictProvenanceRetenue('upnp:a', { presentes: ['upnp:a'], serveurs: null })).toBe('garder');
    expect(verdictProvenanceRetenue('upnp:a', { presentes: ['local'], serveurs: ['upnp:b'] })).toBe('oublier');
    // Une source de service n'arrive qu'avec les favoris, plus tard : jamais oubliée.
    expect(verdictProvenanceRetenue('qobuz', { presentes: ['local'], serveurs: [] })).toBe('garder');
  });
});
