// @vitest-environment jsdom
//
// Retour de Rémi sur la rc11 (écran « Lecture en cours » d'une radio),
// décision de Bertrand du 14/11/2026 pour la rc12 :
//   1. la vignette de la barre de lecture, pour une RADIO : ni cœur ni
//      bargraphes (« on n'est pas chez Winamp ») ; la place va au titre ;
//   2. Lecture en cours d'une RADIO : un seul visuel (le spectre du bas),
//      plus la crête L/R sous la pochette ;
//   3. le petit logo de la station, en coin de pochette, ouvre la fiche de la
//      station (comme le nom).
// Chaque point a sa contre-épreuve sur une piste de MUSIQUE : rien n'y change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { oublierBadgesDeLecture } from '../ficheStation';

vi.setConfig({ testTimeout: 30_000 });

const FLUX = 'https://icecast.radiofrance.fr/francemusique-hifi.aac';
const LOGO = 'https://l/francemusique.png';
const RADIO = {
  title: 'Les Trésors de France Musique', artist_name: 'Renée Auphan', album_title: 'France Musique',
  source: 'radio', source_id: FLUX, duration_ms: 0, cover_path: 'https://c/auphan.jpg',
};
const MUSIQUE = {
  track_id: 77, album_id: 5, artist_id: 3, title: 'It’s No Good', artist_name: 'Depeche Mode',
  album_title: 'Ultra', source: 'local', duration_ms: 298000, format: 'FLAC', sample_rate: 44100, bit_depth: 16,
};
/** La fiche de la station (`RadioFicheModale`). */
const FICHE = '.panneau[role="dialog"]';
const MIENNE = { id: 7, name: 'France Musique', stream_url: FLUX, favorite: false, logo_url: LOGO };

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  if (/\/radios\/directory(\?|$)/.test(url)) corps = { total: 0, offset: 0, limit: 20, count: 0, items: [], countries: [], genres: [] };
  else if (/\/radios(\?|$)/.test(url)) corps = [MIENNE];
  else if (/\/radios\/7$/.test(url)) corps = { ...MIENNE, streams: [] };
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); flushSync(); };

async function poser(composant: any, piste: unknown): Promise<HTMLDivElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: piste, position_ms: 1000, online: true, volume: 0.4 }] as any);
  currentZoneId.set(1);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  return hote;
}

beforeEach(() => {
  locale.set('fr');
  oublierBadgesDeLecture();
  queueTracks.set([]);
  // Les réglages par défaut, explicites : crête et visualiseur de barre allumés.
  preferences.update((p) => ({ ...p, visualiseurBarre: true, peakMeterStyle: 'lamps', barreVuMetres: false }));
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Rémi rc11, point 1 — la vignette de la barre de lecture', () => {
  it('🔴 radio : ni cœur, ni crête, ni visualiseur ; le titre qui passe est là', async () => {
    const h = await poser(TransportBar, RADIO);
    const gauche = h.querySelector('.transport-left')!;
    expect(gauche, 'la barre n’a pas monté sa vignette').not.toBeNull();
    expect(gauche.querySelector('.fav-btn'), 'le cœur est encore sur la vignette d’une radio').toBeNull();
    expect(gauche.querySelector('.tb-crete'), 'la crête est encore sur la vignette d’une radio').toBeNull();
    expect(gauche.querySelector('.tb-mini-viz'), 'le visualiseur est encore sur la vignette d’une radio').toBeNull();
    expect(gauche.querySelector('.mini-title')?.textContent).toContain('Les Trésors de France Musique');
  });

  it('CONTRE-ÉPREUVE musique : cœur, crête et visualiseur restent', async () => {
    const h = await poser(TransportBar, MUSIQUE);
    const gauche = h.querySelector('.transport-left')!;
    expect(gauche.querySelector('.fav-btn')).not.toBeNull();
    expect(gauche.querySelector('.tb-crete')).not.toBeNull();
    expect(gauche.querySelector('.tb-mini-viz')).not.toBeNull();
  });

  it('CONTRE-ÉPREUVE musique : les réglages `visualiseurBarre` et `peakMeterStyle` décident toujours', async () => {
    preferences.update((p) => ({ ...p, visualiseurBarre: false, peakMeterStyle: 'off' }));
    const h = await poser(TransportBar, MUSIQUE);
    const gauche = h.querySelector('.transport-left')!;
    expect(gauche.querySelector('.tb-crete')).toBeNull();
    expect(gauche.querySelector('.tb-mini-viz')).toBeNull();
  });
});

describe('Rémi rc11, point 2 — Lecture en cours : un seul visuel pour une radio', () => {
  it('🔴 radio : plus de crête sous la pochette, le spectre du bas reste seul', async () => {
    const h = await poser(NowPlaying, RADIO);
    expect(h.querySelector('.np-crete'), 'la crête L/R est encore sous la pochette d’une radio').toBeNull();
    expect(h.querySelectorAll('.np-visualizer-row')).toHaveLength(1);
  });

  it('CONTRE-ÉPREUVE musique : la crête choisie et le spectre restent', async () => {
    const h = await poser(NowPlaying, MUSIQUE);
    expect(h.querySelector('.np-crete')).not.toBeNull();
    expect(h.querySelector('.np-visualizer-row')).not.toBeNull();
  });

  it('CONTRE-ÉPREUVE musique : `peakMeterStyle` = off éteint toujours la crête', async () => {
    preferences.update((p) => ({ ...p, peakMeterStyle: 'off' }));
    const h = await poser(NowPlaying, MUSIQUE);
    expect(h.querySelector('.np-crete')).toBeNull();
  });
});

describe('Rémi rc11, point 3 — le petit logo de la station ouvre sa fiche', () => {
  it('🔴 un clic sur le logo ouvre la fiche, pas l’agrandissement de la pochette', async () => {
    const h = await poser(NowPlaying, RADIO);
    const logo = h.querySelector<HTMLElement>('.np-logo-coin[data-logo-station]');
    expect(logo, 'pas de logo en coin de pochette').not.toBeNull();
    expect(logo!.tagName, 'le logo n’est pas un bouton').toBe('BUTTON');
    expect(document.querySelector(FICHE), 'une fiche était déjà ouverte').toBeNull();
    logo!.click();
    await respirer();
    expect(document.querySelector('.lightbox-overlay'), 'le clic sur le logo a ouvert l’agrandissement de la pochette').toBeNull();
    expect(document.querySelector(FICHE), 'le clic sur le logo n’a ouvert aucune fiche').not.toBeNull();
  });

  it('même geste que le nom de la station', async () => {
    const h = await poser(NowPlaying, RADIO);
    expect(document.querySelector(FICHE)).toBeNull();
    h.querySelector<HTMLButtonElement>('.radio-station-name')!.click();
    await respirer();
    expect(document.querySelector(FICHE)).not.toBeNull();
  });
});
