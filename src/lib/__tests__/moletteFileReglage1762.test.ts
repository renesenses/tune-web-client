// @vitest-environment jsdom
//
// web#1762 — Bertrand, réunion du 28/09/2026 : « Lecture en cours : ajouter un
// réglage pour que la file d'attente soit fermée à l'ouverture, par défaut. »
//
// La feuille de la file est déjà repliée à chaque ouverture ; ce qui l'ouvrait
// « toute seule », c'est la MOLETTE : 130 px de défilement vers le bas la
// faisaient passer en `peek`. Décision du 29/09/2026 : le geste devient un
// réglage, « Ouvrir la file en faisant défiler », DÉCOCHÉ par défaut.
//
// Le témoin MONTE l'écran, fait tourner la molette sur sa racine et lit le
// DOM (`.now-playing.queue-open`) — pas une garde de texte.
//
// CONTRE-ÉPREUVE : sans la garde de `handleNpWheel`, le témoin « sans
// réglage » rougit (la file s'ouvre).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

const PISTE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};
const FILE = [
  { id: 77, title: 'Video Games', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 281000 },
  { id: 78, title: 'Blue Jeans', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 210000 },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

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

async function poser(): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as any);
  currentZoneId.set(1);
  queueTracks.set(FILE as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  queueTracks.set(FILE as any);
  flushSync();
  const racine = hote.querySelector<HTMLElement>('.now-playing');
  expect(racine, 'racine de l’écran introuvable — témoin sans objet').not.toBeNull();
  return racine!;
}

/** Un vrai geste : 200 px vers le bas, au-delà du seuil de 130 px. */
function molette(racine: HTMLElement): void {
  racine.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, deltaMode: 0, bubbles: true, cancelable: true }));
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  try { localStorage.clear(); } catch { /* ignore */ }
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
  preferences.update((p) => ({ ...p, ouvrirFileAuDefilement: false }));
  vi.unstubAllGlobals();
});

describe('web#1762 — la molette n’ouvre la file que si on l’a demandé', () => {
  it('le réglage existe et vaut « désactivé » par défaut', async () => {
    vi.resetModules();
    const neuf = await import('../stores/preferences');
    expect(get(neuf.preferences).ouvrirFileAuDefilement).toBe(false);
  });

  it('🔴 sans réglage, la molette laisse la file FERMÉE', async () => {
    preferences.update((p) => ({ ...p, ouvrirFileAuDefilement: false }));
    const racine = await poser();
    expect(racine.classList.contains('queue-open')).toBe(false);
    molette(racine);
    expect(racine.classList.contains('queue-open'),
      'la molette a ouvert la file alors que le réglage est désactivé').toBe(false);
  });

  it('réglage activé, la même molette ouvre la file', async () => {
    preferences.update((p) => ({ ...p, ouvrirFileAuDefilement: true }));
    const racine = await poser();
    expect(racine.classList.contains('queue-open')).toBe(false);
    molette(racine);
    expect(racine.classList.contains('queue-open'),
      'réglage activé : la molette devait ouvrir la file — témoin sans objet sinon').toBe(true);
  });
});
