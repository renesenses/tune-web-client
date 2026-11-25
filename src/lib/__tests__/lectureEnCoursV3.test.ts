// @vitest-environment jsdom
//
// Design v3 de Levente (§10.5, §10.6) — décision de Bertrand du 22/11/2026.
//
// 1. L'ORDRE des actions : Crédits → Paroles → Partager → Ajouter à une
//    playlist → (File → Plus), pour celles que l'écran offre. Les réglages de
//    zone (EQ, sommeil, crossfeed, réveil, bannir) viennent APRÈS.
// 2. Les icônes de ces actions sont des composants Lucide (`@lucide/svelte`),
//    pas des tracés recopiés.
// 3. La pilule Paroles est un déclencheur de panneau : `aria-expanded` suit
//    l'état, `aria-controls` nomme un panneau qui existe quand il est ouvert,
//    et fermé il ne laisse rien dans le DOM.
// 4. « À suivre » dit combien il en reste dans TOUTE la file et offre
//    « Voir la file ».
//
// Le banc MONTE l'écran (disposition large), comme `apercuASuivre1836`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks, queuePosition } from '../stores/queue';
import { locale } from '../i18n';

const FILE = Array.from({ length: 12 }, (_, i) => ({
  id: 700 + i,
  title: `Titre ${i + 1}`,
  artist_name: 'Pink Floyd',
  source: 'local',
  duration_ms: 180_000,
}));

const PISTE = {
  track_id: 700, album_id: 4, artist_id: 2,
  title: 'Titre 1', artist_name: 'Pink Floyd', album_title: 'The Wall',
  source: 'local', duration_ms: 180_000, format: 'flac', sample_rate: 44100, bit_depth: 16,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let largeurAvant: PropertyDescriptor | undefined;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: FILE, position: 0, length: FILE.length };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function monter(): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as any);
  currentZoneId.set(1);
  queueTracks.set(FILE as any);
  queuePosition.set(0);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: { onAddToPlaylist: () => {} } as any });
  flushSync();
  await respirer();
  queueTracks.set(FILE as any);
  queuePosition.set(0);
  flushSync();
  const racine = hote.querySelector<HTMLElement>('.now-playing');
  expect(racine, 'écran introuvable — banc sans objet').not.toBeNull();
  return racine!;
}

beforeAll(() => {
  largeurAvant = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
});
afterAll(() => {
  if (largeurAvant) Object.defineProperty(HTMLElement.prototype, 'clientWidth', largeurAvant);
});
beforeEach(() => {
  locale.set('en');
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  activeView.set('nowplaying');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  queueTracks.set([]);
  queuePosition.set(0);
  vi.unstubAllGlobals();
});

const ORDRE_V3 = ['credits', 'lyrics', 'share', 'playlist', 'queue', 'more'];

describe('Lecture en cours v3 — la rangée des actions', () => {
  it('suit l’ordre Crédits → Paroles → Partager → Ajouter à une playlist, réglages de zone ensuite', async () => {
    const racine = await monter();
    const rangee = racine.querySelector('[data-np-actions]');
    expect(rangee, 'rangée des actions absente').not.toBeNull();
    const vues = [...rangee!.querySelectorAll<HTMLElement>('[data-np-action]')].map((e) => e.dataset.npAction!);
    // Les quatre premières, celles que cet écran offre, dans l'ordre v3.
    expect(vues.slice(0, 4)).toEqual(['credits', 'lyrics', 'share', 'playlist']);
    // Toute action v3 présente respecte l'ordre relatif de la référence.
    const v3 = vues.filter((v) => ORDRE_V3.includes(v));
    expect(v3).toEqual([...v3].sort((a, b) => ORDRE_V3.indexOf(a) - ORDRE_V3.indexOf(b)));
    // Les réglages de zone ne passent jamais devant une action v3.
    const premierReglage = vues.findIndex((v) => !ORDRE_V3.includes(v));
    if (premierReglage > -1) expect(premierReglage).toBeGreaterThanOrEqual(v3.length);
  });

  it('chaque action porte une icône Lucide (et aucune icône n’est lue)', async () => {
    const racine = await monter();
    const actions = racine.querySelectorAll<HTMLElement>('[data-np-actions] [data-np-action]');
    expect(actions.length).toBeGreaterThanOrEqual(4);
    for (const a of actions) {
      if (a.dataset.npAction === 'ban') continue; // icône partagée de `menuPiste` (§3)
      const svg = a.querySelector('svg');
      expect(svg, `${a.dataset.npAction} sans icône`).not.toBeNull();
      expect(svg!.getAttribute('class') ?? '', `${a.dataset.npAction} : icône hors Lucide`).toMatch(/\blucide\b/);
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
    }
    // L'en-tête aussi : le retour.
    expect(racine.querySelector('.np-back-btn svg')?.getAttribute('class') ?? '').toMatch(/\blucide\b/);
  });

  it('la pilule Paroles est un déclencheur de panneau, fermé par défaut', async () => {
    const racine = await monter();
    const paroles = racine.querySelector<HTMLButtonElement>('[data-np-action="lyrics"]')!;
    expect(paroles.getAttribute('aria-expanded')).toBe('false');
    const id = paroles.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(racine.querySelector(`[id="${id}"]`), 'fermé, le panneau ne doit pas rester dans le DOM').toBeNull();

    paroles.click();
    flushSync();
    expect(paroles.getAttribute('aria-expanded')).toBe('true');
    expect(paroles.classList.contains('active')).toBe(true);
    expect(racine.querySelector(`[id="${id}"]`), 'ouvert, `aria-controls` vise un panneau absent').not.toBeNull();

    paroles.click();
    flushSync();
    expect(paroles.getAttribute('aria-expanded')).toBe('false');
    expect(racine.querySelector(`[id="${id}"]`)).toBeNull();
  });
});

describe('Lecture en cours v3 — en-tête et « À suivre »', () => {
  it('l’en-tête porte le titre de l’écran à côté du retour', async () => {
    const racine = await monter();
    expect(racine.querySelector('h1.np-titre-ecran')?.textContent?.trim()).toBe('Now Playing');
  });

  it('« À suivre » dit ce qui reste dans toute la file et mène à la file', async () => {
    const racine = await monter();
    const tete = racine.querySelector('.up-next .up-next-label');
    expect(tete?.textContent).toContain('11 tracks remaining');
    const voir = racine.querySelector<HTMLButtonElement>('.up-next [data-voir-file]');
    expect(voir?.textContent?.trim()).toBe('View queue');
    voir!.click();
    expect(get(activeView)).toBe('queue');
  });
});
