// @vitest-environment jsdom
//
// tune-server-rust#7819 — ajouter un podcast à la main, par l'adresse de son
// flux RSS. L'écran Podcasts porte une action « Ajouter par adresse RSS » :
// un champ, un bouton, l'erreur dite à côté du champ, puis l'ouverture du
// podcast ajouté.
//
// L'écran est MONTÉ, `fetch` est simulé. Les réponses sont copiées de la
// route serveur (`subscribe`, tune-server/src/routes/podcasts.rs, branche
// batch/bugs-rc11-20261101) : 201 avec la fiche lue dans le flux, 422
// `podcast_pas_un_flux`, 502 `podcast_flux_injoignable`.
//
// ⛔ N'établit ni le rendu dans un navigateur réel, ni la réponse d'un vrai
// serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const FLUX = 'https://flux.test/banc.xml';
const AJOUTE = {
  id: 42, created: true, title: 'Le Podcast du Banc', author: 'Équipe Tune',
  image_url: 'https://flux.test/couverture.jpg', description: 'Un flux.', feed_url: FLUX, cover_url: null,
};

let appels: { url: string; init?: RequestInit }[];

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

function routeur(url: string, init?: RequestInit): Response {
  appels.push({ url, init });
  if (url.includes('/podcasts/subscriptions')) {
    if (init?.method === 'POST') {
      const { feed_url } = JSON.parse(String(init.body));
      if (feed_url.includes('page.html')) {
        return reponse(422, { error: "Cette adresse ne mène pas à un flux de podcast (RSS ou Atom).", code: 'podcast_pas_un_flux' });
      }
      if (feed_url.includes('injoignable')) {
        return reponse(502, { error: 'Impossible de joindre cette adresse.', code: 'podcast_flux_injoignable' });
      }
      return reponse(201, AJOUTE);
    }
    return reponse(200, []);
  }
  if (url.includes('/podcasts/episodes')) {
    return reponse(200, { episodes: [{ title: 'Épisode du banc', audio_url: 'https://flux.test/e1.mp3' }] });
  }
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

/** Monte l'écran, ouvre l'action, saisit `adresse` et valide. */
async function ajouter(adresse: string) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
  const action = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === fr['v2.pod.addRss']),
  );
  action.click();
  const champ = await attendre(() => hote!.querySelector<HTMLInputElement>('form.ajout-rss-form input'));
  expect(champ.placeholder).toBe(fr['v2.pod.addRssPlaceholder']);
  const valider = hote!.querySelector<HTMLButtonElement>('form.ajout-rss-form button[type="submit"]')!;
  expect(valider.disabled, 'sans adresse, rien à envoyer').toBe(true);
  champ.value = adresse;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(valider.disabled).toBe(false);
  valider.click();
}

const posts = () => appels.filter((a) => a.url.includes('/podcasts/subscriptions') && a.init?.method === 'POST');

beforeEach(() => {
  appels = [];
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
});

describe('tune-server-rust#7819 — ajouter un podcast par adresse RSS', () => {
  it('envoie la seule adresse, puis ouvre le podcast ajouté avec ses épisodes', async () => {
    await ajouter(`  ${FLUX} `);

    // La fiche du podcast ajouté s'ouvre, sous le titre lu dans le flux.
    await attendre(() => [...hote!.querySelectorAll('h1')].find((h) => h.textContent?.trim() === AJOUTE.title));
    await attendre(() => [...hote!.querySelectorAll('button.ep')].find((b) => b.textContent?.includes('Épisode du banc')));

    expect(posts()).toHaveLength(1);
    expect(JSON.parse(String(posts()[0].init!.body))).toEqual({ feed_url: FLUX });
    const episodes = appels.find((a) => a.url.includes('/podcasts/episodes'));
    expect(episodes?.url).toContain(encodeURIComponent(FLUX));
    // Le champ s'est refermé, sans erreur.
    expect(hote!.querySelector('form.ajout-rss-form')).toBeNull();
    expect(hote!.querySelector('.ajout-rss-err')).toBeNull();
  });

  it('une page qui n’est pas un flux est refusée par une phrase lisible, à côté du champ', async () => {
    await ajouter('https://site.test/page.html');

    const erreur = await attendre(() => hote!.querySelector('.ajout-rss-err'));
    expect(erreur.textContent).toBe(fr['v2.pod.rssNotAFeed']);
    // Le champ reste là, avec l'adresse, pour la corriger.
    expect(hote!.querySelector<HTMLInputElement>('form.ajout-rss-form input')!.value).toBe('https://site.test/page.html');
    expect(appels.some((a) => a.url.includes('/podcasts/episodes'))).toBe(false);
  });

  it('une adresse injoignable le dit aussi', async () => {
    await ajouter('https://injoignable.test/flux.xml');

    const erreur = await attendre(() => hote!.querySelector('.ajout-rss-err'));
    expect(erreur.textContent).toBe(fr['v2.pod.rssUnreachable']);
  });
});
