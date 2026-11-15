// @vitest-environment jsdom
//
// web#2761 — Alex Campbell (VIP, rc11) : quitter le Mode grand écran (Échap
// ou clic) ramenait aux Playlists au lieu de « Lecture en cours ».
//
// Cause : « Lecture en cours » s'ouvre aussi en CALQUE (`mobileNowPlayingOpen`,
// `ShellV2` `.np-overlay`) par-dessus la vue courante, sans changer
// `activeView`. La sortie (`TvView.exitTv`) lisait `previousView` et rendait
// la vue d'en dessous SANS le calque.
//
// Attendu (issue) : retrouver « Lecture en cours » ouvert COMME AVANT
// l'entrée — ici, le calque sur Playlists — puis un Retour qui referme le
// calque sur Playlists (relecture de #2763 : ouvrir la vue `nowplaying` en
// plein, puis Retour, menait à la Bibliothèque, repli de `tv`).
//
// Les témoins montent la VRAIE coquille `ShellV2` : le calque, son
// `NowPlaying`, le bouton Grand écran du calque ET celui de la grappe
// (`ShellV2.modeTv`), le `TvView` rendu par la coquille.
//
// Contre-épreuve : sur `origin/main`, la sortie rend `playlists` sans calque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView, mobileNowPlayingOpen, vueAvantGrandEcran } from '../stores/navigation';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 90_000 });

const PISTE = {
  track_id: 12, album_id: 55, artist_id: 994,
  title: 'The Price', artist_name: 'Leprous', album_title: 'Malina',
  source: 'library', duration_ms: 321000,
};
const ZONE = { id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 };
const COLLECTIONS =
  /\/(zones|profiles|devices|playlists|shortcuts|search|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|credits|plays)(\?|\/|$)/;

function reponse(url: string): Response {
  let corps: unknown = COLLECTIONS.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = async (ms = 80) => { await new Promise((r) => setTimeout(r, ms)); flushSync(); };
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => reponse(String(typeof u === 'string' ? u : (u as Request)?.url ?? u))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  if (!('IntersectionObserver' in globalThis)) {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  }
  vueAvantGrandEcran.set(null);
  mobileNowPlayingOpen.set(false);
  activeView.set('home');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  mobileNowPlayingOpen.set(false);
  preferences.update((p) => ({ ...p, lienLectureVersSource: false }));
  zones.set([]);
  vi.unstubAllGlobals();
});

async function monterCoquille(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote }) as Record<string, unknown>;
  flushSync();
  await respirer(150);
  // La zone APRÈS le montage : le chargement initial de la coquille la relit.
  zones.set([ZONE] as never);
  currentZoneId.set(1);
  activeView.set('playlists');
  await respirer();
  return hote;
}

/** Playlists à l'écran, « Lecture en cours » en calque par-dessus. */
async function ouvrirCalque(h: HTMLElement) {
  mobileNowPlayingOpen.set(true);
  await respirer(150);
  expect(h.querySelector('.np-overlay'), 'calque non rendu par la coquille').not.toBeNull();
}

function echap() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flushSync();
}

describe('web#2761 — coquille montée : sortir du Grand écran rend Lecture en cours comme avant', () => {
  it('🔴 bouton Grand écran DU CALQUE → Échap : Playlists + calque rouvert ; Retour referme le calque', async () => {
    const h = await monterCoquille();
    await ouvrirCalque(h);
    const tv = h.querySelector<HTMLButtonElement>('.np-overlay .np-tv-btn');
    expect(tv, 'bouton Grand écran absent du calque — témoin sans objet').not.toBeNull();
    tv!.click();
    await respirer();
    expect(get(activeView)).toBe('tv');
    expect(h.querySelector('.np-overlay'), 'le calque reste sous le Grand écran').toBeNull();

    echap();
    await respirer(150);
    expect(get(activeView), 'la vue d’en dessous').toBe('playlists');
    expect(get(mobileNowPlayingOpen), 'Lecture en cours n’est pas rouvert comme avant (#2761)').toBe(true);
    expect(h.querySelector('.np-overlay')).not.toBeNull();

    // Le Retour du calque : on retrouve Playlists, pas la Bibliothèque.
    h.querySelector<HTMLButtonElement>('.np-overlay .np-back-btn')!.click();
    await respirer();
    expect(get(mobileNowPlayingOpen)).toBe(false);
    expect(get(activeView), 'Retour après le Grand écran (relecture #2763)').toBe('playlists');
  });

  it('🔴 clic sur le Grand écran, même chemin', async () => {
    const h = await monterCoquille();
    await ouvrirCalque(h);
    h.querySelector<HTMLButtonElement>('.np-overlay .np-tv-btn')!.click();
    await respirer();
    const ecran = h.querySelector<HTMLElement>('.tv-root');
    expect(ecran, 'Grand écran non rendu par la coquille').not.toBeNull();
    ecran!.click();
    await respirer(150);
    expect(get(activeView)).toBe('playlists');
    expect(get(mobileNowPlayingOpen)).toBe(true);
  });

  it('🔴 bouton de la GRAPPE (ShellV2.modeTv) depuis « Lecture en cours » en vue : la sortie y revient, sans calque', async () => {
    const h = await monterCoquille();
    activeView.set('nowplaying');
    await respirer(150);
    const grappe = h.querySelector<HTMLButtonElement>('button.raccourci.tv');
    expect(grappe, 'bouton Grand écran de la grappe absent — témoin sans objet').not.toBeNull();
    grappe!.click();
    await respirer();
    expect(get(activeView)).toBe('tv');
    expect(get(vueAvantGrandEcran)).toEqual({ vue: 'nowplaying', calque: false });
    echap();
    await respirer(150);
    expect(get(activeView)).toBe('nowplaying');
    expect(get(mobileNowPlayingOpen)).toBe(false);
    expect(get(vueAvantGrandEcran), 'la porte est consommée').toBeNull();
  });

  it('🔴 bouton de la GRAPPE sur Playlists (« lien → source »), calque ouvert : retenu, puis rouvert à la sortie', async () => {
    const h = await monterCoquille();
    preferences.update((p) => ({ ...p, lienLectureVersSource: true }));
    await ouvrirCalque(h);
    const grappe = h.querySelector<HTMLButtonElement>('button.raccourci.tv');
    expect(grappe, 'bouton de la grappe absent avec le réglage — témoin sans objet').not.toBeNull();
    grappe!.click();
    await respirer();
    expect(get(vueAvantGrandEcran)).toEqual({ vue: 'playlists', calque: true });
    expect(get(mobileNowPlayingOpen)).toBe(false);
    echap();
    await respirer(150);
    expect(get(activeView)).toBe('playlists');
    expect(get(mobileNowPlayingOpen)).toBe(true);
  });
});
