// @vitest-environment jsdom
//
// Un épisode commencé, lancé depuis la fiche du podcast, reprend à sa position ;
// « Depuis le début » le relance à 0 ; un épisode terminé ou jamais commencé
// part du début. Le réseau est un `fetch` factice : aucun son.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';
import { progressionEpisode, positionDeLancement, reculDeLaConfig, formatPosition } from '../reprisePodcast';

vi.setConfig({ testTimeout: 60_000 });

const FLUX = 'https://media.podcast.test/rss';
const ABONNEMENT = { id: 7, title: 'Le sept neuf', feed_url: FLUX };
const EPISODES = [
  { title: 'Commencé', audio_url: 'https://media.podcast.test/a.mp3', duration_ms: 1_800_000 },
  { title: 'Terminé', audio_url: 'https://media.podcast.test/b.mp3', duration_ms: 1_800_000 },
  { title: 'Neuf', audio_url: 'https://media.podcast.test/c.mp3', duration_ms: 1_800_000 },
];
const LIGNES = [
  { context_type: 'podcast', title: 'Le sept neuf', last_track_title: 'Commencé', position_ms: 600_000 },
  { context_type: 'podcast', title: 'Le sept neuf', last_track_title: 'Terminé', position_ms: 1_795_000 },
  { context_type: 'album', title: 'Commencé', position_ms: 5 },
];

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
  corps = []; rewind = undefined;
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

describe('fiche du podcast — reprise d’un épisode', () => {
  it('épisode commencé : la position (moins le recul de 10 s) est transmise', async () => {
    const h = await ouvrirFiche();
    ligne(h, 0).querySelector<HTMLButtonElement>('button.ep')!.click();
    await attendre(() => corps.length > 0);
    expect(corps[0].seek_ms).toBe(590_000);
    expect(corps[0].audio_url).toBe(EPISODES[0].audio_url);
  });

  it('le recul réglé au serveur est celui qui est retiré', async () => {
    rewind = 30;
    const h = await ouvrirFiche();
    ligne(h, 0).querySelector<HTMLButtonElement>('button.ep')!.click();
    await attendre(() => corps.length > 0);
    expect(corps[0].seek_ms).toBe(570_000);
  });

  it('« Depuis le début » relance à 0', async () => {
    const h = await ouvrirFiche();
    const bouton = ligne(h, 0).querySelector<HTMLButtonElement>('button.depuis')!;
    expect(bouton.textContent?.trim()).toBe(fr['v2.pod.fromStart']);
    bouton.click();
    await attendre(() => corps.length > 0);
    expect(corps[0].seek_ms).toBe(0);
  });

  it('épisode terminé ou jamais commencé : pas de position, pas de « Depuis le début »', async () => {
    const h = await ouvrirFiche();
    for (const i of [1, 2]) {
      expect(ligne(h, i).querySelector('.prog')).toBeNull();
      expect(ligne(h, i).querySelector('button.depuis')).toBeNull();
      ligne(h, i).querySelector<HTMLButtonElement>('button.ep')!.click();
    }
    await attendre(() => corps.length === 2);
    expect(corps.every((c) => !('seek_ms' in c))).toBe(true);
  });

  it('la progression est affichée sur l’épisode commencé', async () => {
    const h = await ouvrirFiche();
    expect(ligne(h, 0).querySelector('.prog small')?.textContent).toBe(fr['v2.pod.resumeAt'].replace('{pos}', '10:00'));
    expect(ligne(h, 0).querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('33');
  });
});

describe('reprisePodcast — logique pure', () => {
  const ep = { title: 'Un épisode', duration_ms: 1_000_000 };
  it('ignore les lignes d’un autre podcast ou d’un autre type', () => {
    expect(progressionEpisode(ep, 'A', [{ context_type: 'podcast', title: 'B', last_track_title: 'Un épisode', position_ms: 5000 }])).toBeNull();
    expect(progressionEpisode(ep, 'A', [{ context_type: 'album', title: 'A', last_track_title: 'Un épisode', position_ms: 5000 }])).toBeNull();
  });
  it('un épisode à moins de 15 s de la fin ou à 97 % est terminé', () => {
    const l = (p: number) => [{ context_type: 'podcast', last_track_title: 'Un épisode', position_ms: p }];
    expect(progressionEpisode(ep, 'A', l(990_000))).toBeNull();
    expect(progressionEpisode(ep, 'A', l(500_000))?.pourcent).toBe(50);
  });
  it('position de lancement : 0 explicite, position moins recul, bornée à 0', () => {
    expect(positionDeLancement({ positionMs: 5000, pourcent: 1 }, 10, false)).toBe(0);
    expect(positionDeLancement({ positionMs: 60_000, pourcent: 1 }, 10, false)).toBe(50_000);
    expect(positionDeLancement({ positionMs: 60_000, pourcent: 1 }, 10, true)).toBe(0);
    expect(positionDeLancement(null, 10, false)).toBeUndefined();
  });
  it('recul de la config et format', () => {
    expect(reculDeLaConfig({})).toBe(10);
    expect(reculDeLaConfig({ continue_listening_rewind_seconds: 300 })).toBe(60);
    expect(formatPosition(3_729_000)).toBe('1:02:09');
  });
});
