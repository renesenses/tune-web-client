// @vitest-environment jsdom
//
// web#2761 — Alex Campbell (VIP, rc11) : quitter le Mode grand écran (Échap
// ou clic) ramenait aux Playlists au lieu de « Lecture en cours ».
//
// Cause : « Lecture en cours » s'ouvre aussi en CALQUE (`mobileNowPlayingOpen`,
// barre de lecture cliquée en fenêtre étroite) par-dessus la vue courante, sans
// changer `activeView`. Son bouton Grand écran (`NowPlaying.enterTvMode`)
// passait à `'tv'` : `previousView` valait alors la vue d'EN DESSOUS
// (Playlists), et `TvView.exitTv` y renvoyait.
//
// Les témoins montent le VRAI `NowPlaying` (en calque : sans
// `tvDansLaCoquille`, comme `ShellV2` le monte dans `.np-overlay`), cliquent
// son bouton Grand écran, puis montent le VRAI `TvView` et le quittent.
//
// Contre-épreuve : sur `origin/main`, l'Échap et le clic ramènent à
// `'playlists'`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import TvView from '../../components/v2-heritage/TvView.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView, mobileNowPlayingOpen, vueAvantGrandEcran } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const PISTE = {
  track_id: 12, album_id: 55, artist_id: 994,
  title: 'The Price', artist_name: 'Leprous', album_title: 'Malina',
  source: 'library', duration_ms: 321000,
};
const ZONE = { id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 };

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const montes: { c: Record<string, unknown>; h: HTMLElement }[] = [];

function monter(composant: typeof NowPlaying | typeof TvView): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const c = mount(composant as never, { target: h, props: {} as never }) as Record<string, unknown>;
  montes.push({ c, h });
  flushSync();
  return h;
}
function demonter(h: HTMLElement) {
  const i = montes.findIndex((m) => m.h === h);
  if (i < 0) return;
  unmount(montes[i].c);
  montes[i].h.remove();
  montes.splice(i, 1);
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => reponse(String(typeof u === 'string' ? u : (u as Request)?.url ?? u))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  zones.set([ZONE] as never);
  currentZoneId.set(1);
  vueAvantGrandEcran.set(null);
  mobileNowPlayingOpen.set(false);
  activeView.set('home');
  activeView.set('playlists');
});

afterEach(() => {
  while (montes.length) demonter(montes[0].h);
  mobileNowPlayingOpen.set(false);
  zones.set([]);
  vi.unstubAllGlobals();
});

/** Playlists à l'écran, « Lecture en cours » en calque, bouton Grand écran. */
async function entrerDepuisLeCalque(): Promise<HTMLDivElement> {
  mobileNowPlayingOpen.set(true);
  const calque = monter(NowPlaying);
  await respirer();
  const bouton = calque.querySelector<HTMLButtonElement>('.np-tv-btn');
  expect(bouton, 'bouton Grand écran absent du calque — témoin sans objet').not.toBeNull();
  bouton!.click();
  flushSync();
  expect(get(activeView)).toBe('tv');
  demonter(calque);
  const tv = monter(TvView);
  await respirer();
  return tv;
}

describe('web#2761 — sortir du Grand écran ramène à « Lecture en cours »', () => {
  it('🔴 Échap, entré depuis Lecture en cours ouvert en calque sur Playlists', async () => {
    await entrerDepuisLeCalque();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(get(activeView), 'la sortie a ramené à la vue d’en dessous (#2761)').toBe('nowplaying');
    expect(get(mobileNowPlayingOpen), 'le calque recouvrirait la vue rendue').toBe(false);
  });

  it('🔴 clic, même chemin', async () => {
    const tv = await entrerDepuisLeCalque();
    (tv.firstElementChild as HTMLElement).click();
    flushSync();
    expect(get(activeView)).toBe('nowplaying');
  });

  it('la porte est consommée : une sortie suivante ne la relit pas', async () => {
    await entrerDepuisLeCalque();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(get(vueAvantGrandEcran)).toBeNull();
  });
});
