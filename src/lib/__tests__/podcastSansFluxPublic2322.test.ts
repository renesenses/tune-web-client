// @vitest-environment jsdom
//
// web#2322 — « un podcast du palmarès sans flux public ne fait rien au clic,
// en silence » (suite de tune-server-rust#6770, PR serveur #6801).
//
// `openPodcast` et `toggleSub` commençaient par `if (!feed) return`. Un
// podcast du palmarès Apple dont `feed_url` est vide (exclusivité Apple, par
// exemple : 3 sur 50 au palmarès FR du 22/10) ne faisait donc rien au clic.
// Le serveur sait maintenant résoudre le flux depuis `source_id` (`apple-…`),
// ou répondre par un code stable : `podcast_sans_flux_public` (422),
// `podcast_introuvable` (404), `podcast_resolution_reseau` (502).
//
// L'écran est MONTÉ, `fetch` est simulé. On clique la tuile du palmarès et
// son bouton d'abonnement, et on lit ce qui part sur le réseau et ce que
// l'écran affiche.
//
// ⛔ N'établit pas le rendu dans un navigateur réel, ni la réponse d'un vrai
// serveur : celle-ci est copiée de `tune-server-rust` (`echec_de_resolution`,
// `tune-server/src/routes/podcasts.rs`, branche batch/bugs-rc8-20261022).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const EXCLU = { title: 'Exclusivité Apple', author: 'Studio', source_id: 'apple-1700000001', feed_url: '' };
const RESOLU = { title: 'Podcast résolu', author: 'Radio', source_id: 'apple-1700000002', feed_url: '' };

let appels: { url: string; init?: RequestInit }[];

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Unprocessable Entity',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

const SANS_FLUX = {
  error: "Ce podcast n'a pas de flux public : il ne peut être ni suivi ni écouté hors d'Apple Podcasts.",
  code: 'podcast_sans_flux_public',
};

function routeur(url: string, init?: RequestInit): Response {
  appels.push({ url, init });
  if (url.includes('/podcasts/top')) return reponse(200, { items: [EXCLU, RESOLU] });
  if (url.includes('/podcasts/subscriptions')) {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body));
      if (corps.source_id === EXCLU.source_id) return reponse(422, SANS_FLUX);
      return reponse(200, { id: 9, ...corps, feed_url: 'https://flux.test/resolu.xml' });
    }
    return reponse(200, []);
  }
  if (url.includes('/podcasts/episodes')) {
    if (url.includes(encodeURIComponent(EXCLU.source_id))) return reponse(422, SANS_FLUX);
    return reponse(200, { episodes: [{ title: 'Épisode 1', audio_url: 'https://flux.test/e1.mp3' }] });
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

async function tuile(nom: string): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
  // Le palmarès du pays est la section « Populaires » (`/podcasts/top`).
  const populaires = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('nav.sections button')].find((b) => b.textContent?.trim() === fr['v2.pod.secPopular']),
  );
  populaires.click();
  return attendre(() =>
    [...hote!.querySelectorAll<HTMLElement>('.pc')].find((c) => c.querySelector('.nm')?.textContent?.trim() === nom),
  );
}

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

describe('web#2322 — podcast du palmarès sans flux', () => {
  it('au clic, l’écran demande les épisodes par source_id et dit pourquoi il n’y en a pas', async () => {
    const carte = await tuile(EXCLU.title);
    carte.querySelector<HTMLButtonElement>('button.ouvrir')!.click();
    const bandeau = await attendre(() => hote!.querySelector('.err'));
    expect(bandeau.textContent).toContain(fr['v2.pod.noPublicFeed']);
    const demande = appels.find((a) => a.url.includes('/podcasts/episodes'));
    expect(demande?.url).toContain(`source_id=${encodeURIComponent(EXCLU.source_id)}`);
  });

  it('un podcast résolu par le serveur s’ouvre et montre ses épisodes', async () => {
    const carte = await tuile(RESOLU.title);
    carte.querySelector<HTMLButtonElement>('button.ouvrir')!.click();
    await attendre(() => [...hote!.querySelectorAll('button.ep')].find((b) => b.textContent?.includes('Épisode 1')));
    expect(hote!.querySelector('.err')).toBeNull();
  });

  it('le bouton d’abonnement n’est plus inerte : sans flux public, il le dit', async () => {
    const carte = await tuile(EXCLU.title);
    const bouton = carte.querySelector<HTMLButtonElement>('button.sub')!;
    expect(bouton.disabled).toBe(false);
    bouton.click();
    const bandeau = await attendre(() => hote!.querySelector('.err'));
    expect(bandeau.textContent).toContain(fr['v2.pod.noPublicFeed']);
    const post = appels.find((a) => a.url.includes('/podcasts/subscriptions') && a.init?.method === 'POST');
    expect(JSON.parse(String(post!.init!.body)).source_id).toBe(EXCLU.source_id);
  });
});
