// @vitest-environment jsdom
//
// Tune Circle T5 dans la scène (demande de Bertrand du 24/10/2026) : les
// playlists partagées en petites lunes sur l'anneau de leur cercle (24/10 au soir),
// un accès en haut de la scène, et « Lire » depuis la ligne d'une playlist,
// sur la zone courante, sans l'ouvrir.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import { currentZoneId } from '../stores/zones';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let greffonT5 = true;
let toile = false;

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

const PLAYLISTS = [
  { id: 'pl-1', name: 'Noël', owner: { user_id: 1, name: 'Moi' }, count: 3, version: 1, updated_at: null, mine: true, circle_id: 7 },
  { id: 'pl-2', name: 'Dimanche', owner: { user_id: 12, name: 'Alice' }, count: 2, version: 1, updated_at: null, mine: false, circle_id: null },
];

function cloud(chemin: string, method: string): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, {
      members: [{ user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' }],
      sent: [], received: [], circles: [{ id: 7, name: 'Famille', member_ids: [12] }],
    });
  }
  if (chemin === '/library-sync') return reponse(200, { last_sync: null });
  if (chemin === '/shared-with-me') return reponse(200, []);
  if (chemin === '/me/location') return reponse(204);
  if (chemin === '/contacts/locations') return reponse(200, []);
  if (!greffonT5) return reponse(404, { error: 'not_found' });
  if (chemin === '/playlists' && method === 'GET') return reponse(200, PLAYLISTS);
  if (chemin === '/recoverable-playlists') return reponse(200, []);
  const m = chemin.match(/^\/playlists\/([^/]+)(\/play|\/resolve)?$/);
  if (m && m[2] === '/play' && method === 'POST') return reponse(200, { ok: true, zone_id: 2, queued: 3, missing: [] });
  if (m && m[2] === '/resolve') return reponse(200, []);
  if (m && !m[2] && method === 'GET') {
    const p = PLAYLISTS.find((x) => x.id === decodeURIComponent(m[1]))!;
    return reponse(200, { id: p.id, name: p.name, version: 1, mine: p.mine, items: [] });
  }
  return reponse(404, { error: 'not_found' });
}

/** Une toile 2D factice et un ResizeObserver : de quoi lancer le moteur sous jsdom. */
function poserToile() {
  const ctx = new Proxy({}, {
    get: (_c, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as any);
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  greffonT5 = true;
  toile = false;
  circlePlugin.set(null);
  currentZoneId.set(2);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method);
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', installed: true, enabled: true }]);
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
async function poser(): Promise<HTMLDivElement> {
  if (toile) poserToile();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const lectures = () => appels.filter((a) => a.method === 'POST' && /\/ext\/circle\/playlists\/[^/]+\/play$/.test(a.url));
async function cliquer(el: Element | null) { (el as HTMLButtonElement).click(); await laisserFaire(); }

describe('T5 — l\'accès en haut de la scène', () => {
  it('« Playlists partagées · 2 », replié ; déplié : chaque playlist, Lire et Ouvrir', async () => {
    const el = await poser();
    const acces = el.querySelector('button.sc-acces-playlists')!;
    expect(texte(acces)).toBe('Playlists partagées · 2');
    expect(acces.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.sc-playlists')).toBeNull();
    await cliquer(acces);
    expect(acces.getAttribute('aria-expanded')).toBe('true');
    expect([...el.querySelectorAll('.sc-playlist .sc-pl-nom')].map(texte)).toEqual(['Noël', 'Dimanche']);
    expect(texte(el.querySelectorAll('.sc-playlist')[1])).toContain('de Alice');
  });

  it('Lire : la playlist sur la zone COURANTE, sans l\'ouvrir', async () => {
    const el = await poser();
    await cliquer(el.querySelector('button.sc-acces-playlists'));
    await cliquer(el.querySelector('.sc-playlist button.sc-lire-playlist'));
    expect(lectures()).toHaveLength(1);
    expect(lectures()[0].url).toContain('/playlists/pl-1/play');
    expect(lectures()[0].body).toEqual({ zone_id: 2 });
    expect(el.querySelector('.playlist-cercle .nom-playlist')).toBeNull();
  });

  it('Ouvrir : la vue de la playlist', async () => {
    const el = await poser();
    await cliquer(el.querySelector('button.sc-acces-playlists'));
    await cliquer(el.querySelectorAll('.sc-playlist button.sc-ouvrir-playlist')[1]);
    expect(texte(el.querySelector('.nom-playlist'))).toBe('Dimanche');
  });

  it('greffon d\'avant T5 (404 sur /playlists) : ni accès, ni lune', async () => {
    greffonT5 = false;
    const el = await poser();
    expect(el.querySelector('button.sc-acces-playlists')).toBeNull();
    expect(el.querySelector('.sc-lune')).toBeNull();
  });
});

describe('T5 — Lire depuis la ligne d\'une playlist', () => {
  it('le bloc « Playlists partagées » : Lire à côté d\'Ouvrir, sur la zone courante', async () => {
    const el = await poser();
    const ligne = [...el.querySelectorAll('li.playlist-cercle')].find((li) => texte(li.querySelector('.nom')) === 'Dimanche')!;
    const lire = ligne.querySelector('button.lire-playlist-ligne')!;
    expect(lire.getAttribute('aria-label')).toBe('Lire la playlist Dimanche');
    await cliquer(lire);
    expect(lectures().map((a) => a.url.replace(/^.*\/playlists\//, ''))).toEqual(['pl-2/play']);
  });

  it('sans zone choisie : rien ne part', async () => {
    currentZoneId.set(null);
    const el = await poser();
    await cliquer(el.querySelector('li.playlist-cercle button.lire-playlist-ligne'));
    expect(lectures()).toHaveLength(0);
  });
});

describe('T5 — les lunes', () => {
  it('une lune par playlist, accrochée à l\'anneau de son cercle (la mienne) ou de son propriétaire', async () => {
    toile = true;
    const el = await poser();
    const lunes = [...el.querySelectorAll('.sc-noeuds button.sc-lune')];
    // « Noël » : mon cercle Famille, en vue Réseau (k:7) ET en vue Solo (ks:7) ;
    // « Dimanche » : la planète d'Alice.
    expect(lunes.map((b) => b.getAttribute('aria-label'))).toEqual(expect.arrayContaining([
      'Ouvrir la playlist Noël', 'Ouvrir la playlist Dimanche',
    ]));
    expect(lunes.filter((b) => b.getAttribute('title') === 'Dimanche')).toHaveLength(1);
  });

  it('anneaux (24/10) : le nom du cercle est un bouton qui dit « Cercle Famille : Alice, vous »', async () => {
    toile = true;
    const el = await poser();
    const anneaux = [...el.querySelectorAll('.sc-noeuds button.sorte-ring')];
    expect(anneaux.length).toBeGreaterThan(0);
    for (const b of anneaux) {
      expect(b.getAttribute('aria-label')).toBe('Cercle Famille : Alice, vous');
      expect(b.getAttribute('data-mode')).toBe('ring');
    }
    expect(el.querySelector('.sc-noeuds button.sorte-circle')).toBeNull();
  });

  it('clic sur une lune : la playlist s\'ouvre', async () => {
    toile = true;
    const el = await poser();
    const lune = [...el.querySelectorAll('button.sc-lune')].find((b) => b.getAttribute('title') === 'Dimanche')!;
    await cliquer(lune);
    expect(texte(el.querySelector('.nom-playlist'))).toBe('Dimanche');
  });
});
