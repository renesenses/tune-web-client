// @vitest-environment jsdom
//
// tune-server-rust#8170 — depuis la fiche d'un podcast, CHAQUE épisode
// commencé repart à sa position, pas seulement le dernier écouté.
// « Continuer l'écoute » n'en rend qu'un par podcast ; `GET /podcasts/positions`
// rend celle de chaque épisode, reconnu par l'adresse de son média. Le réseau
// est un `fetch` factice : aucun son.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';
import { progressionEpisode, cleEpisode } from '../reprisePodcast';

vi.setConfig({ testTimeout: 60_000 });

const FLUX = 'https://media.podcast.test/rss';
const ABONNEMENT = { id: 7, title: 'Le sept neuf', feed_url: FLUX };
const EPISODES = [
  { title: 'Commencé', audio_url: 'https://media.podcast.test/a.mp3', duration_ms: 1_800_000 },
  { title: 'Terminé', audio_url: 'https://media.podcast.test/b.mp3', duration_ms: 1_800_000 },
  { title: 'Neuf', audio_url: 'https://media.podcast.test/c.mp3', duration_ms: 1_800_000 },
];
// « Continuer l'écoute » : UNE reprise pour le podcast, le dernier épisode
// écouté (« Neuf », renommé ici pour la clarté : il a été commencé aussi).
const LIGNES = [
  { context_type: 'podcast', title: 'Le sept neuf', last_track_title: 'Neuf', position_ms: 300_000 },
];
// `/podcasts/positions` : chaque épisode commencé, par son adresse.
const POSITIONS = [
  { audio_url: 'https://media.podcast.test/c.mp3', position_ms: 300_000, duration_ms: 1_800_000 },
  { audio_url: 'https://media.podcast.test/a.mp3#t=1', position_ms: 600_000, duration_ms: 1_800_000 },
];
let avecPositions = true;

let corps: Record<string, unknown>[];
let rewind: number | undefined;

function rep(c: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'application/json' }), json: async () => c, text: async () => JSON.stringify(c) } as unknown as Response;
}
function routeur(url: string, init?: RequestInit): Response {
  if (url.includes('/podcasts/play/')) { corps.push(JSON.parse(String(init?.body))); return rep({}); }
  if (url.includes('/podcasts/subscriptions')) return rep([ABONNEMENT]);
  if (url.includes('/podcasts/episodes')) return rep({ episodes: EPISODES });
  if (url.includes('/home/continue-listening')) return rep(LIGNES);
  if (url.includes('/podcasts/positions')) {
    if (!avecPositions) return { ok: false, status: 404, statusText: 'Not Found', headers: new Headers(), json: async () => ({}), text: async () => '' } as unknown as Response;
    return rep({ positions: POSITIONS });
  }
  if (url.includes('/system/config')) return rep(rewind === undefined ? {} : { continue_listening_rewind_seconds: rewind });
  return rep(/\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {});
}
const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function attendre<T>(lire: () => T | null | undefined, ms = 3000): Promise<T> {
  const fin = Date.now() + ms;
  for (;;) {
    flushSync();
    const v = lire();
    if (v) return v;
    if (Date.now() > fin) throw new Error('élément jamais apparu');
    await respirer(20);
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function ouvrirFiche(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
  const onglet = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('nav.tabs button')].find((b) => b.textContent?.trim() === fr['v2.pod.tabSubs']),
  );
  onglet.click();
  (await attendre(() => hote!.querySelector<HTMLButtonElement>('.pc button.ouvrir'))).click();
  await attendre(() => hote!.querySelectorAll('button.ep').length === EPISODES.length || null);
  // Les reprises arrivent après la liste des épisodes.
  await attendre(() => hote!.querySelector('.prog'));
  return hote!;
}
const ligne = (h: HTMLElement, i: number) => h.querySelectorAll<HTMLElement>('.eprow')[i];

beforeEach(() => {
  corps = []; rewind = undefined; avecPositions = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => routeur(String(url), init)));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  zones.set([{ id: 1, name: 'Salon', state: 'stopped' }] as never);
  currentZoneId.set(1);
  locale.set('fr');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals();
});

describe('#8170 — chaque épisode commencé reprend à sa position', () => {
  it('le premier épisode, qui n’est plus le dernier écouté, reprend aussi', async () => {
    const h = await ouvrirFiche();
    ligne(h, 0).querySelector<HTMLButtonElement>('button.ep')!.click();
    await attendre(() => corps.length > 0);
    expect(corps[0].audio_url).toBe(EPISODES[0].audio_url);
    expect(corps[0].seek_ms).toBe(590_000);
  });

  it('le dernier écouté reprend toujours', async () => {
    const h = await ouvrirFiche();
    ligne(h, 2).querySelector<HTMLButtonElement>('button.ep')!.click();
    await attendre(() => corps.length > 0);
    expect(corps[0].seek_ms).toBe(290_000);
  });

  it('l’épisode jamais commencé part du début', async () => {
    const h = await ouvrirFiche();
    expect(ligne(h, 1).querySelector('.prog')).toBeNull();
    ligne(h, 1).querySelector<HTMLButtonElement>('button.ep')!.click();
    await attendre(() => corps.length > 0);
    expect('seek_ms' in corps[0]).toBe(false);
  });

  it('serveur antérieur (pas de route) : le dernier écouté reprend, comme avant', async () => {
    avecPositions = false;
    const h = await ouvrirFiche();
    expect(ligne(h, 0).querySelector('.prog')).toBeNull();
    ligne(h, 2).querySelector<HTMLButtonElement>('button.ep')!.click();
    await attendre(() => corps.length > 0);
    expect(corps[0].seek_ms).toBe(290_000);
  });
});

describe('#8170 — logique pure', () => {
  const ep = { title: 'Même titre', audio_url: 'https://h.test/x.mp3', duration_ms: 1_000_000 };
  it('une ligne à adresse se rapproche par l’adresse, jamais par le titre', () => {
    const autre = { context_type: 'podcast', audio_url: 'https://h.test/y.mp3', last_track_title: 'Même titre', position_ms: 5000 };
    expect(progressionEpisode(ep, 'P', [autre])).toBeNull();
    const la = { context_type: 'podcast', audio_url: 'https://h.test/x.mp3#t=3', position_ms: 5000 };
    expect(progressionEpisode(ep, 'P', [la])?.positionMs).toBe(5000);
  });
  it('la clé d’un épisode ignore espaces et fragment', () => {
    expect(cleEpisode('  https://h.test/x.mp3?id=2#t=10 ')).toBe('https://h.test/x.mp3?id=2');
  });
});
