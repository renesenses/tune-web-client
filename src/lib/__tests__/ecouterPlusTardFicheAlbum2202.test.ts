// @vitest-environment jsdom
//
// web#2202 — Sandro (fil 2285, rc4) et Patatorz (fil 2325) : pas
// d'« Écouter plus tard » sur la FICHE d'un album. Le geste de web#1653
// n'existait que dans le menu « … » des vignettes et des pistes ; la fiche n'a
// pas de menu « … ». Patatorz le demande pour les albums locaux, Qobuz et
// Tidal.
//
// Le témoin MONTE la fiche (album de la bibliothèque, puis album Qobuz, puis
// album d'un dépôt Tune distant) avec un serveur simulé, clique, et lit la
// requête qui part vraiment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { CLE_REGLAGE, NOM_ETIQUETTE, oublierSas, sasEcouterPlusTard } from '../ecouterPlusTard';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });
const fr = dictionnaire('fr');
const TAG = 7;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let membresAlbums: unknown[] = [];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const souffler = async (n = 12) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

beforeEach(() => {
  requetes = [];
  membresAlbums = [];
  locale.set('fr');
  oublierSas();
  currentProfileId.set(1);
  currentZoneId.set(1);
  activeView.set('library');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    let charge: unknown = [];
    if (url.includes('/profiles/1/settings')) charge = { [CLE_REGLAGE]: TAG };
    else if (url.includes(`/tags/${TAG}/albums`)) charge = { albums: membresAlbums, count: membresAlbums.length };
    else if (url.includes(`/tags/${TAG}/tracks`)) charge = { tracks: [], count: 0 };
    else if (url.includes(`/tags/${TAG}/playlists`)) charge = { playlists: [], count: 0 };
    else if (method === 'GET' && /\/tags\/?(\?|$)/.test(url)) charge = [{ id: TAG, name: NOM_ETIQUETTE, color: '#808080' }];
    else if (method !== 'GET') charge = {};
    return {
      ok: true, status: method === 'POST' ? 201 : 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  oublierSas();
  vi.unstubAllGlobals();
});

async function ouvrir(props: Record<string, unknown>): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, ...props } as any });
  await souffler();
  return hote;
}
const bouton = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('.actions button[data-ecouter-plus-tard]');
const libelle = (b: HTMLElement | null) => (b?.textContent ?? '').trim();

describe('web#2202 — « Écouter plus tard » sur la fiche d’un album', () => {
  it('🔴 album de la bibliothèque : le bouton dépose l’album, puis le retire', async () => {
    const h = await ouvrir({ album: { id: 959, title: 'Akalé Wubé', artist_name: 'Akalé Wubé' } });
    const b = bouton(h);
    expect(b, 'aucun bouton « Écouter plus tard » sur la fiche').not.toBeNull();
    expect(libelle(b)).toBe(fr['v2.later.add']);
    expect(b!.getAttribute('aria-pressed')).toBe('false');
    expect(b!.getAttribute('title')).toBe(fr['v2.later.albumAddTip']);

    b!.click();
    await souffler();
    const depot = requetes.find((r) => r.method === 'POST' && r.url.includes(`/tags/${TAG}/items`));
    expect(depot, 'le clic n’a rien déposé').toBeTruthy();
    expect(depot!.body).toMatchObject({ item_type: 'album', item_id: 959 });
    expect(libelle(bouton(h))).toBe(fr['v2.later.remove']);
    expect(bouton(h)!.getAttribute('aria-pressed')).toBe('true');

    bouton(h)!.click();
    await souffler();
    expect(requetes.some((r) => r.method === 'DELETE' && r.url.includes(`/tags/${TAG}/items/album/959`))).toBe(true);
    expect(libelle(bouton(h))).toBe(fr['v2.later.add']);
  });

  it('un album déjà dans le sas s’ouvre sur « Retirer »', async () => {
    membresAlbums = [{ id: 959, title: 'Akalé Wubé' }];
    const h = await ouvrir({ album: { id: 959, title: 'Akalé Wubé', artist_name: 'Akalé Wubé' } });
    expect(get(sasEcouterPlusTard).charge).toBe(true);
    expect(libelle(bouton(h))).toBe(fr['v2.later.remove']);
  });

  it('🔴 album Qobuz : le bouton est là, et dépose par la route des services', async () => {
    const h = await ouvrir({
      album: { id: null, title: 'Kind of Blue', artist_name: 'Miles Davis', source: 'qobuz', source_id: '0074646593624' },
      service: 'qobuz',
    });
    const b = bouton(h);
    expect(b, 'aucun bouton sur la fiche d’un album Qobuz').not.toBeNull();
    b!.click();
    await souffler();
    const depot = requetes.find((r) => r.method === 'POST' && r.url.includes(`/tags/${TAG}/streaming-items`));
    expect(depot, 'le clic n’a rien déposé').toBeTruthy();
    expect(JSON.stringify(depot!.body)).toContain('0074646593624');
  });

  it('album d’un dépôt Tune distant : pas de bouton (il ne se désigne pas ici)', async () => {
    const h = await ouvrir({
      album: { id: 12, title: 'Ailleurs', artist_name: 'X' },
      depot: { base: 'http://autre:8888/api/v1', nom: 'Autre', hote: 'autre:8888' },
    });
    expect(bouton(h)).toBeNull();
  });

  it.each(ONZE_LANGUES)('%s porte les deux bulles', (code) => {
    const d = dictionnaire(code);
    expect(d['v2.later.albumAddTip']).toBeTruthy();
    expect(d['v2.later.albumRemoveTip']).toBeTruthy();
    expect(d['v2.later.albumRemoveTip']).not.toBe(d['v2.later.remove']);
  });
});
