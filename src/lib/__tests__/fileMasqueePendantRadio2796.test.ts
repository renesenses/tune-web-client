// @vitest-environment jsdom
//
// web#2796 — fil 2746 (rc11, macOS, Chrome) : dans « Lecture en cours »,
// pendant l'écoute d'une radio, la file d'attente restait affichée. Une radio
// joue sans fin : la file n'a rien à y montrer.
//
// Le bouton « File d'attente » était déjà retiré pour une radio, mais pas le
// reste : l'aperçu « À suivre » (`.up-next`), et le panneau de la file s'il
// était ouvert avant que la radio démarre (il gardait aussi sa réserve à
// droite).
//
// Le témoin monte l'écran en disposition large, avec une file de trois
// pistes : d'abord sur une piste locale (aperçu présent, panneau ouvrable :
// le témoin a un objet), puis la zone passe sur une radio.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks, queuePosition, queueLength } from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

const PISTE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};
const RADIO = {
  title: 'FIP', artist_name: '', album_title: 'FIP', source: 'radio', source_id: 'fip', duration_ms: 0,
};
const FILE = [
  { id: 77, title: 'Video Games', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 281000 },
  { id: 78, title: 'Blue Jeans', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 210000 },
  { id: 79, title: 'Radio', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 214000 },
];

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

function poserZone(piste: unknown) {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: piste, position_ms: 1000 }] as any);
}

function poserFile() {
  queueTracks.set(FILE as any);
  queuePosition.set(0);
  queueLength.set(FILE.length);
}

async function poser(piste: unknown): Promise<HTMLElement> {
  poserZone(piste);
  currentZoneId.set(1);
  poserFile();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  poserFile();
  flushSync();
  const racine = hote.querySelector<HTMLElement>('.now-playing');
  expect(racine, 'racine de l’écran introuvable — témoin sans objet').not.toBeNull();
  expect(racine!.classList.contains('wide'), 'disposition large non atteinte — témoin sans objet').toBe(true);
  return racine!;
}

function reserve(racine: HTMLElement): number {
  const m = /--np-reserve-file:\s*(\d+)px/.exec(racine.getAttribute('style') ?? '');
  expect(m, 'réserve de la file introuvable — témoin sans objet').not.toBeNull();
  return Number(m![1]);
}

beforeAll(() => {
  largeurAvant = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
});

afterAll(() => {
  if (largeurAvant) Object.defineProperty(HTMLElement.prototype, 'clientWidth', largeurAvant);
});

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  preferences.update((p) => ({ ...p, dispositionFile: 'droite' }));
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
  queueLength.set(0);
  vi.unstubAllGlobals();
});

describe('web#2796 — pas de file d’attente pendant une radio', () => {
  it('témoin : sur une piste locale, l’aperçu « À suivre » et le panneau de la file existent', async () => {
    const racine = await poser(PISTE);
    expect(racine.querySelector('.up-next'), 'aperçu « À suivre » absent — témoin sans objet').not.toBeNull();
    expect(racine.querySelector('.queue-sheet-toggle')).not.toBeNull();
    expect(racine.querySelector('.queue-sheet')).not.toBeNull();
  });

  it('🔴 radio dès l’arrivée : ni aperçu « À suivre », ni panneau, ni bouton', async () => {
    const racine = await poser(RADIO);
    expect(racine.querySelector('.up-next'), 'l’aperçu de la file s’affiche pendant la radio').toBeNull();
    expect(racine.querySelector('.queue-sheet'), 'le panneau de la file existe pendant la radio').toBeNull();
    expect(racine.querySelector('.queue-sheet-toggle')).toBeNull();
    expect(reserve(racine)).toBe(0);
  });

  it('🔴 file ouverte, puis une radio démarre : la file se referme et rend sa place', async () => {
    const racine = await poser(PISTE);
    racine.querySelector<HTMLButtonElement>('.queue-sheet-toggle')!.click();
    flushSync();
    await respirer();
    flushSync();
    expect(reserve(racine), 'la file ne s’est pas ouverte — témoin sans objet').toBeGreaterThan(0);

    poserZone(RADIO);
    flushSync();
    await respirer();
    flushSync();

    expect(racine.querySelector('.queue-sheet'), 'le panneau de la file reste affiché pendant la radio').toBeNull();
    expect(racine.querySelector('.up-next')).toBeNull();
    expect(reserve(racine), 'la colonne de la file garde sa place pendant la radio').toBe(0);
    expect(racine.classList.contains('queue-open')).toBe(false);
  });
});
