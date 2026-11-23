// @vitest-environment jsdom
//
// Forum, relevé du 21/11 (rc13) — trois défauts de la liste d'épisodes :
//
//  1. `getPodcastEpisodes` n'avait ni délai ni annulation : un serveur qui ne
//     répond pas laissait la fiche sur « Chargement des épisodes… », sans
//     erreur ni bouton « Réessayer » (Thierry).
//  2. `openPodcast` rangeait la réponse quelle qu'elle soit : la réponse
//     tardive d'une fiche quittée écrasait les épisodes de la fiche ouverte.
//  3. `data.episodes || data` : un serveur d'avant tune-server-rust#9317
//     répond 200 `{podcast_id, error}` ; l'erreur était avalée et l'écran
//     disait « Aucun épisode ».
//
// L'écran est MONTÉ, `fetch` est simulé (réponses copiées de
// `tune-server/src/routes/podcasts.rs`, `podcast_episodes`).
//
// ⛔ N'établit pas le rendu dans un navigateur réel, ni la réponse d'un vrai
// serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { getPodcastEpisodes } from '../api';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const LENT = { title: 'Podcast lent', author: 'Studio', source_id: 'rss-lent', feed_url: 'https://flux.test/lent.xml' };
const VIF = { title: 'Podcast vif', author: 'Radio', source_id: 'rss-vif', feed_url: 'https://flux.test/vif.xml' };

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Gateway',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

const liste = (nom: string) => ({ episodes: [{ title: `Épisode de ${nom}`, audio_url: `https://flux.test/${nom}.mp3` }] });

/** Les épisodes du flux lent ne partent qu'à `libererLent()`. */
let libererLent: (() => void) | null = null;
/** Ce que répond le flux vif ; change d'un test à l'autre. */
let reponseVif: () => Response;

function routeur(url: string, init?: RequestInit): Promise<Response> | Response {
  if (url.includes('/podcasts/top')) return reponse(200, { items: [LENT, VIF] });
  if (url.includes('/podcasts/subscriptions')) return reponse(200, []);
  if (url.includes('/podcasts/episodes')) {
    if (url.includes(encodeURIComponent(LENT.feed_url))) {
      // Le vrai `fetch` ignore l'annulation pour cette réponse : le défaut 2
      // se voit même si l'annulation n'arrive pas à temps.
      return new Promise((r) => { libererLent = () => r(reponse(200, liste('lent'))); });
    }
    return reponseVif();
  }
  void init;
  return reponse(200, /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {});
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function attendre<T>(lire: () => T | null | undefined | false, ms = 4000): Promise<T> {
  const fin = Date.now() + ms;
  for (;;) {
    flushSync();
    const v = lire();
    if (v) return v as T;
    if (Date.now() > fin) throw new Error('jamais arrivé');
    await respirer(20);
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function monter(): Promise<void> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
  const populaires = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('nav.sections button')].find((b) => b.textContent?.trim() === fr['v2.pod.secPopular']),
  );
  populaires.click();
}

async function ouvrir(nom: string): Promise<void> {
  const carte = await attendre(() =>
    [...hote!.querySelectorAll<HTMLElement>('.pc')].find((c) => c.querySelector('.nm')?.textContent?.trim() === nom),
  );
  carte.querySelector<HTMLButtonElement>('button.ouvrir')!.click();
  await attendre(() => hote!.querySelector('.detail h1')?.textContent?.trim() === nom);
}

beforeEach(() => {
  libererLent = null;
  reponseVif = () => reponse(200, liste('vif'));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => routeur(String(url), init)));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  zones.set([{ id: 1, name: 'Salon', state: 'stopped' }] as never);
  currentZoneId.set(1);
  locale.set('fr');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getPodcastEpisodes — délai, annulation, réponse d’erreur', () => {
  it('une demande sans réponse finit en erreur après le délai', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_r, rejeter) => {
      init?.signal?.addEventListener('abort', () => rejeter(new DOMException('aborted', 'AbortError')));
    })));
    const promesse = getPodcastEpisodes('https://flux.test/muet.xml', 50, undefined, undefined, undefined, undefined, { delaiMs: 50 });
    await expect(promesse).rejects.toMatchObject({ code: 'podcast_episodes_delai' });
  });

  it('l’appelant peut annuler la demande', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_r, rejeter) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => rejeter(new DOMException('aborted', 'AbortError')));
    })));
    const ctrl = new AbortController();
    const promesse = getPodcastEpisodes('https://flux.test/muet.xml', 50, undefined, undefined, undefined, undefined, { signal: ctrl.signal });
    ctrl.abort();
    await expect(promesse).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });

  it('un 200 {podcast_id, error} d’un serveur d’avant #9317 est un échec, pas une liste vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(200, { podcast_id: '7', error: 'podcast feed HTTP 404 Not Found' })));
    await expect(getPodcastEpisodes('', 50, undefined, 7)).rejects.toMatchObject({ code: 'podcast_episodes_indisponibles' });
  });

  it('le 502 de #9317 garde son code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(502, { error: 'podcast feed HTTP 404 Not Found', code: 'podcast_episodes_indisponibles' })));
    await expect(getPodcastEpisodes('', 50, undefined, 7)).rejects.toMatchObject({ code: 'podcast_episodes_indisponibles', status: 502 });
  });

  it('contre-témoin : une liste, et « absent des abonnements » (episodes: []), restent des listes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(200, liste('vif'))));
    expect(await getPodcastEpisodes('', 50, undefined, 7)).toHaveLength(1);
    vi.stubGlobal('fetch', vi.fn(async () => reponse(200, { podcast_id: '7', episodes: [], error: 'podcast not found in subscriptions' })));
    expect(await getPodcastEpisodes('', 50, undefined, 7)).toEqual([]);
  });
});

describe('fiche podcast — réponse tardive et Réessayer', () => {
  it('la réponse tardive d’une fiche quittée n’écrase pas les épisodes de la fiche ouverte', async () => {
    await monter();
    await ouvrir(LENT.title);
    await attendre(() => libererLent);
    hote!.querySelector<HTMLButtonElement>('.detail button.close')!.click();
    flushSync();
    await ouvrir(VIF.title);
    await attendre(() => [...hote!.querySelectorAll('button.ep')].find((b) => b.textContent?.includes('Épisode de vif')));
    libererLent!();
    await respirer(150);
    flushSync();
    const titres = [...hote!.querySelectorAll('button.ep')].map((b) => b.textContent ?? '');
    expect(hote!.querySelector('.detail h1')?.textContent?.trim()).toBe(VIF.title);
    expect(titres.some((t) => t.includes('Épisode de lent'))).toBe(false);
    expect(titres.some((t) => t.includes('Épisode de vif'))).toBe(true);
  });

  it('un flux en échec s’affiche DANS la fiche avec « Réessayer », qui recharge', async () => {
    reponseVif = () => reponse(502, { error: 'podcast feed HTTP 404 Not Found', code: 'podcast_episodes_indisponibles' });
    await monter();
    await ouvrir(VIF.title);
    const encart = await attendre(() => hote!.querySelector('.detail .ep-erreur'));
    expect(encart.textContent).toContain(fr['v2.pod.episodesUnavail']);
    expect(hote!.querySelector('.detail')!.textContent).not.toContain(fr['v2.pod.noEpisode']);
    reponseVif = () => reponse(200, liste('vif'));
    encart.querySelector<HTMLButtonElement>('button.relancer')!.click();
    await attendre(() => [...hote!.querySelectorAll('button.ep')].find((b) => b.textContent?.includes('Épisode de vif')));
    expect(hote!.querySelector('.detail .ep-erreur')).toBeNull();
  });

  it('un 200 {error} d’un serveur d’avant #9317 ne dit plus « Aucun épisode »', async () => {
    reponseVif = () => reponse(200, { podcast_id: 'rss-vif', error: 'podcast feed HTTP 404 Not Found' });
    await monter();
    await ouvrir(VIF.title);
    await attendre(() => hote!.querySelector('.detail .ep-erreur'));
    expect(hote!.querySelector('.detail')!.textContent).not.toContain(fr['v2.pod.noEpisode']);
  });
});
