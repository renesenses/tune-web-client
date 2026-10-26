// @vitest-environment jsdom
//
// renesenses/tune-server-rust#6468 — un épisode de podcast refusé par
// l'enceinte ne doit pas s'afficher « en lecture ».
//
// FabienM, fil 2302 point 13 : sur sa zone DLNA, l'épisode ne jouait pas, et
// l'écran faisait comme si. Depuis la PR serveur 6656, `POST /podcasts/play`
// répond 502 (`podcast_sortie_refuse`) ou 503 (`podcast_sortie_introuvable`)
// et repasse la zone à l'arrêt.
//
// Ce témoin joue le geste : il monte le VRAI `PodcastsV2`, ouvre un
// abonnement, CLIQUE l'épisode, et lit l'écran — le bandeau d'erreur et la
// classe `live` du bouton de l'épisode. Le réseau est un `fetch` factice :
// rien ne sort, aucun son n'est produit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { get } from 'svelte/store';
import { fr, vi as viDict } from './onzeDictionnaires';
import { lancerEpisode, messageEchecEpisode } from '../lectureEpisode';

vi.setConfig({ testTimeout: 60_000 });

const EPISODE = 'https://media.podcast.test/le-sept-neuf/episode.mp3';
const ABONNEMENT = { id: 7, title: 'Le sept neuf', feed_url: 'https://media.podcast.test/rss' };

type Reponse = { status: number; corps: unknown };
let reponseLecture: Reponse;
let appelsLecture: string[];

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 502 ? 'Bad Gateway' : 'Service Unavailable',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

function routeur(url: string): Response {
  if (url.includes('/podcasts/play/')) {
    appelsLecture.push(url);
    return reponse(reponseLecture.status, reponseLecture.corps);
  }
  if (url.includes('/podcasts/subscriptions')) return reponse(200, [ABONNEMENT]);
  if (url.includes('/podcasts/episodes')) {
    return reponse(200, { episodes: [{ title: 'Le sept neuf du lundi', audio_url: EPISODE }] });
  }
  return reponse(200, /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {});
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

/** Monte l'écran, ouvre l'abonnement, et clique l'épisode. */
async function cliquerEpisode(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
  const onglet = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('nav.tabs button')].find((b) => b.textContent?.trim() === fr['v2.pod.tabSubs']),
  );
  onglet.click();
  const ouvrir = await attendre(() => hote!.querySelector<HTMLButtonElement>('.pc button.ouvrir'));
  ouvrir.click();
  const ep = await attendre(() => hote!.querySelector<HTMLButtonElement>('button.ep'));
  ep.click();
  await attendre(() => appelsLecture.length > 0);
  // La réponse traverse `fetchJSON`, puis l'écran se met à jour.
  await respirer(80);
  flushSync();
  return hote!.querySelector<HTMLButtonElement>('button.ep')!;
}

beforeEach(() => {
  appelsLecture = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => routeur(String(url))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  zones.set([{ id: 1, name: 'Salon', state: 'stopped' }] as never);
  currentZoneId.set(1);
  locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  locale.set('fr');
  vi.unstubAllGlobals();
});

describe('#6468 — épisode refusé par la sortie', () => {
  it('502 podcast_sortie_refuse : la phrase traduite s’affiche, l’épisode n’est pas « en lecture »', async () => {
    reponseLecture = {
      status: 502,
      corps: {
        zone_id: 1,
        output_sent: false,
        code: 'podcast_sortie_refuse',
        error: 'Output device error: SOAP fault (UPnP code 701)',
        state: { state: 'stopped' },
      },
    };
    const ep = await cliquerEpisode();
    // L'état « en lecture » d'abord : c'est ce que le testeur a vu à tort.
    expect(ep.classList.contains('live'), 'épisode affiché « en lecture » malgré le 502').toBe(false);
    const bandeau = hote!.querySelector('.err');
    expect(bandeau, 'aucun bandeau d’erreur sur l’écran Podcasts').not.toBeNull();
    expect(bandeau!.textContent).toContain(fr['v2.pod.playOutputRefused']);
    // Pas de bandeau global « Server error: Output device error… » en anglais.
    const toasts = get(notifications).map((n) => n.message);
    expect(toasts.some((m) => m.includes('Output device error'))).toBe(false);
  });

  it('200 : comportement inchangé, l’épisode s’allume et aucun bandeau d’erreur', async () => {
    reponseLecture = {
      status: 200,
      corps: { zone_id: 1, output_sent: true, error: null, code: null, state: { state: 'playing' } },
    };
    const ep = await cliquerEpisode();
    expect(hote!.querySelector('.err')).toBeNull();
    expect(ep.classList.contains('live')).toBe(true);
  });
});

describe('#6468 — lancerEpisode et ses messages', () => {
  const corpsEchec = (code: string | null, error: string) => ({ zone_id: 1, output_sent: false, code, error });

  it('503 podcast_sortie_introuvable : phrase traduite (vietnamien compris)', async () => {
    reponseLecture = { status: 503, corps: corpsEchec('podcast_sortie_introuvable', 'Device not yet discovered.') };
    expect(await lancerEpisode(1, { audio_url: EPISODE })).toEqual({ ok: false, message: fr['v2.pod.playOutputNotFound'] });
    locale.set('vi');
    expect(await lancerEpisode(1, { audio_url: EPISODE })).toEqual({ ok: false, message: viDict['v2.pod.playOutputNotFound'] });
  });

  it('code inconnu : repli générique traduit, sans le texte brut du serveur (#2417)', async () => {
    reponseLecture = { status: 502, corps: corpsEchec('autre_chose', 'upstream timeout') };
    const issue = await lancerEpisode(1, { audio_url: EPISODE });
    expect(issue).toEqual({ ok: false, message: fr['v2.pod.playFailed'] });
    expect(messageEchecEpisode(null)).toBe(fr['v2.pod.playFailed']);
  });

  it('200 : succès', async () => {
    reponseLecture = { status: 200, corps: { zone_id: 1, output_sent: true, error: null } };
    expect(await lancerEpisode(1, { audio_url: EPISODE })).toEqual({ ok: true });
  });
});
