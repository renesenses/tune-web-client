// @vitest-environment jsdom
//
// Forum, fil 2972 — un épisode dont le fichier a disparu chez l'éditeur
// (404). Tune faisait semblant de démarrer, sans son ni message. Le serveur
// répond désormais `episode_unavailable` au clic, et marque l'épisode
// `unavailable: true` dans les listes.
//
// Ce témoin monte le VRAI `PodcastsV2`, ouvre un abonnement, et lit l'écran :
//  1. un clic refusé (`episode_unavailable`) affiche « Épisode indisponible
//     chez l'éditeur » et grise l'épisode, avec son info-bulle ;
//  2. un épisode que la liste marque `unavailable: true` est grisé dès
//     l'affichage ; son voisin ne l'est pas ;
//  3. la phrase existe dans les vingt langues, sans double encodage.
// Le réseau est un `fetch` factice : rien ne sort, aucun son n'est produit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { get } from 'svelte/store';
import { fr, en, dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { lancerEpisode } from '../lectureEpisode';
import { traductionDuCode } from '../messageServeur';

vi.setConfig({ testTimeout: 60_000 });

const EPISODE = 'https://media.radiofrance.test/concert/absent.mp3';
const VOISIN = 'https://media.radiofrance.test/concert/present.mp3';
const ABONNEMENT = { id: 7, title: "Le concert de l'après-midi", feed_url: 'https://media.radiofrance.test/rss' };

type Reponse = { status: number; corps: unknown };
let reponseLecture: Reponse;
let appelsLecture: string[];
let episodesDeLaListe: unknown[];

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Bad Gateway',
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
    return reponse(200, { episodes: episodesDeLaListe });
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

/** Monte l'écran et ouvre l'abonnement ; rend les boutons des épisodes. */
async function ouvrirFiche(): Promise<HTMLButtonElement[]> {
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
  await attendre(() => hote!.querySelector<HTMLButtonElement>('button.ep'));
  return [...hote!.querySelectorAll<HTMLButtonElement>('button.ep')];
}

/** Ouvre la fiche et clique le premier épisode. */
async function cliquerEpisode(): Promise<HTMLElement> {
  const [ep] = await ouvrirFiche();
  ep.click();
  await attendre(() => appelsLecture.length > 0);
  // La réponse traverse `fetchJSON`, puis l'écran se met à jour.
  await respirer(80);
  flushSync();
  return hote!.querySelector<HTMLButtonElement>('button.ep')!;
}

beforeEach(() => {
  appelsLecture = [];
  episodesDeLaListe = [
    { title: 'Tugan Sokhiev : premier concert', audio_url: EPISODE },
    { title: 'Live à Fip', audio_url: VOISIN },
  ];
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

const REFUS_404 = {
  status: 404,
  corps: {
    zone_id: 1,
    output_sent: false,
    code: 'episode_unavailable',
    error: 'Episode unavailable at the publisher (HTTP 404)',
    params: { status: 404, title: 'Tugan Sokhiev : premier concert' },
    unavailable: true,
  },
};

describe('fil 2972 — épisode indisponible chez l’éditeur', () => {
  it('clic refusé (404 episode_unavailable) : le message dit « indisponible chez l’éditeur », l’épisode se grise', async () => {
    reponseLecture = REFUS_404;
    const ep = await cliquerEpisode();
    const bandeau = hote!.querySelector('.err');
    expect(bandeau, 'aucun bandeau d’erreur sur l’écran Podcasts').not.toBeNull();
    expect(bandeau!.textContent).toContain(fr['erreursServeur.episode_unavailable']);
    expect(fr['erreursServeur.episode_unavailable']).toBe('Épisode indisponible chez l\'éditeur.');
    expect(ep.classList.contains('live'), 'épisode affiché « en lecture » malgré le refus').toBe(false);
    expect(ep.classList.contains('indisponible'), 'l’épisode refusé doit se griser').toBe(true);
    expect(ep.getAttribute('title')).toBe(fr['v2.pod.episodeUnavailableTip']);
    // Son voisin n'est pas touché.
    const voisin = [...hote!.querySelectorAll<HTMLButtonElement>('button.ep')][1];
    expect(voisin.classList.contains('indisponible')).toBe(false);
    expect(voisin.getAttribute('title')).toBeNull();
  });

  it('liste : l’épisode marqué `unavailable: true` est grisé dès l’affichage, avec son info-bulle', async () => {
    episodesDeLaListe = [
      { title: 'Tugan Sokhiev : premier concert', audio_url: EPISODE, unavailable: true },
      { title: 'Live à Fip', audio_url: VOISIN, unavailable: false },
    ];
    const [absent, present] = await ouvrirFiche();
    expect(absent.classList.contains('indisponible')).toBe(true);
    expect(absent.getAttribute('title')).toBe(fr['v2.pod.episodeUnavailableTip']);
    // Les lecteurs d'écran l'entendent aussi ; le bouton reste utilisable.
    expect(absent.querySelector('.sr-only')?.textContent).toBe(fr['v2.pod.episodeUnavailableTip']);
    expect(absent.disabled).toBe(false);
    expect(present.classList.contains('indisponible')).toBe(false);
    expect(present.getAttribute('title')).toBeNull();
    expect(present.querySelector('.sr-only')).toBeNull();
    // Aucune lecture n'a été demandée : l'affichage ne sonde rien.
    expect(appelsLecture).toEqual([]);
  });

  it('épisode disponible : comportement inchangé, ni grisé ni bandeau', async () => {
    reponseLecture = { status: 200, corps: { zone_id: 1, output_sent: true, error: null, code: null } };
    const ep = await cliquerEpisode();
    expect(hote!.querySelector('.err')).toBeNull();
    expect(ep.classList.contains('indisponible')).toBe(false);
    expect(ep.classList.contains('live')).toBe(true);
  });

  it('lancerEpisode et le bandeau `zone.playback_error` disent la même phrase, traduite', async () => {
    reponseLecture = REFUS_404;
    expect(await lancerEpisode(1, { audio_url: EPISODE })).toMatchObject({
      ok: false,
      message: fr['erreursServeur.episode_unavailable'],
      indisponible: true,
    });
    expect(traductionDuCode('episode_unavailable', { status: 404 })).toBe(fr['erreursServeur.episode_unavailable']);
    locale.set('en');
    expect(await lancerEpisode(1, { audio_url: EPISODE })).toMatchObject({ ok: false, message: en['erreursServeur.episode_unavailable'] });
  });

  it('les deux phrases existent dans les vingt langues, sans double encodage', () => {
    expect(ONZE_LANGUES.length).toBe(20);
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of ['erreursServeur.episode_unavailable', 'v2.pod.episodeUnavailableTip']) {
        const texte = d[cle];
        expect(texte, `${langue} : ${cle} manquante`).toBeTruthy();
        expect(texte, `${langue} : ${cle} doublement encodée`).not.toMatch(/Ã|Â|â€/);
      }
      if (langue !== 'en') {
        expect(d['erreursServeur.episode_unavailable'], `${langue} : non traduite`).not.toBe(en['erreursServeur.episode_unavailable']);
      }
    }
  });
});
