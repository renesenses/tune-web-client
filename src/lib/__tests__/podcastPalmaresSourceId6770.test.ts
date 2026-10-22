// @vitest-environment jsdom
//
// renesenses/tune-server-rust#6770 — s'abonner et écouter depuis le palmarès.
//
// FabienM, fil 2379 point 3 : « impossible de s'abonner et de lire des
// podcasts des onglets "Populaires" et "Tous" ». Le palmarès Apple rend
// `feed_url: ''` et un `source_id` (`apple-…`). L'écran ne connaissait que le
// flux : sans lui, ouvrir ne faisait rien et le bouton d'abonnement restait
// grisé, alors que le serveur sait résoudre le flux depuis `source_id`.
//
// Ce témoin monte le VRAI `PodcastsV2`, ouvre « Populaires » puis « Tous »,
// et joue les deux gestes sur une entrée du palmarès. Le réseau est un
// `fetch` factice : rien ne sort, aucun son n'est produit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';
import { abonnementDe, cleDe, cleEchecResolution } from '../podcastPalmares';

vi.setConfig({ testTimeout: 60_000 });

const ENTREE = {
  name: 'Chroniques criminelles',
  artist: 'TF1',
  feed_url: '',
  cover_url: '',
  source_id: 'apple-1509742508',
};
const FLUX_RESOLU = 'https://flux.exemple.test/chroniques.xml';

type Appel = { url: string; methode: string; corps: any };
let appels: Appel[];
let reponseAbonnement: { status: number; corps: unknown };

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Erreur',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

function routeur(url: string, init?: RequestInit): Response {
  const methode = init?.method ?? 'GET';
  appels.push({ url, methode, corps: init?.body ? JSON.parse(String(init.body)) : null });
  if (url.includes('/podcasts/top')) return reponse(200, [ENTREE]);
  if (url.includes('/podcasts/subscriptions')) {
    return methode === 'POST' ? reponse(reponseAbonnement.status, reponseAbonnement.corps) : reponse(200, []);
  }
  if (url.includes('/podcasts/episodes')) {
    return reponse(200, { episodes: [{ title: 'Épisode 1', audio_url: 'https://media.exemple.test/1.mp3' }] });
  }
  if (url.includes('/podcasts/discover')) return reponse(200, { curated: [], top: [] });
  return reponse(200, /\/(zones|profiles|devices|playlists|shortcuts|search|library|genres)/.test(url) ? [] : {});
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function attendre<T>(lire: () => T | null | undefined | false, ms = 3000): Promise<T> {
  const fin = Date.now() + ms;
  for (;;) {
    flushSync();
    const v = lire();
    if (v) return v as T;
    if (Date.now() > fin) throw new Error('élément jamais apparu');
    await respirer(20);
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

/** Monte l'écran et ouvre la section du palmarès demandée. */
async function ouvrirSection(libelle: string): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
  const bouton = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('nav.sections button')].find((b) => b.textContent?.trim() === libelle),
  );
  bouton.click();
  return attendre(() =>
    [...hote!.querySelectorAll<HTMLElement>('.pc')].find((pc) => pc.textContent?.includes(ENTREE.name)),
  );
}

beforeEach(() => {
  appels = [];
  reponseAbonnement = { status: 201, corps: { id: 9, created: true, feed_url: FLUX_RESOLU, title: ENTREE.name } };
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

describe('#6770 — une entrée du palmarès s’abonne et s’écoute', () => {
  for (const section of ['v2.pod.secPopular', 'v2.pod.secAll'] as const) {
    it(`${fr[section]} : l’abonnement part avec source_id et pays`, async () => {
      const tuile = await ouvrirSection(fr[section]);
      const plus = tuile.querySelector<HTMLButtonElement>('button.sub')!;
      expect(plus.disabled, 'bouton d’abonnement grisé sur une entrée du palmarès').toBe(false);
      plus.click();
      const post = await attendre(() => appels.find((a) => a.methode === 'POST' && a.url.includes('/podcasts/subscriptions')));
      expect(post.corps.source_id).toBe(ENTREE.source_id);
      expect(post.corps.country, 'le pays du palmarès doit accompagner la résolution').toBeTruthy();
      await respirer();
      flushSync();
      expect(plus.classList.contains('on'), 'l’entrée doit se dire abonnée après la réponse').toBe(true);
    });

    it(`${fr[section]} : ouvrir demande les épisodes par source_id`, async () => {
      const tuile = await ouvrirSection(fr[section]);
      tuile.querySelector<HTMLButtonElement>('button.ouvrir')!.click();
      const get = await attendre(() => appels.find((a) => a.url.includes('/podcasts/episodes')));
      expect(get.url).toContain(`source_id=${ENTREE.source_id}`);
      expect(get.url).toContain('country=');
      await attendre(() => hote!.querySelector('button.ep'));
    });
  }

  it('aucun flux public : la phrase traduite s’affiche', async () => {
    reponseAbonnement = { status: 422, corps: { code: 'podcast_sans_flux_public', error: 'no public feed' } };
    const tuile = await ouvrirSection(fr['v2.pod.secAll']);
    tuile.querySelector<HTMLButtonElement>('button.sub')!.click();
    const bandeau = await attendre(() => hote!.querySelector('.err'));
    expect(bandeau.textContent).toContain(fr['v2.pod.noPublicFeed']);
  });
});

describe('#6770 — identité d’un podcast', () => {
  it('le flux, sinon l’identifiant Apple', () => {
    expect(cleDe({ feed_url: 'https://a/rss', source_id: 'apple-1' })).toBe('https://a/rss');
    expect(cleDe({ feed_url: '', source_id: 'apple-1' })).toBe('apple-1');
    expect(cleDe({ feed_url: '', source_id: 'rf-2' })).toBeNull();
  });

  it('un abonnement se retrouve par le flux résolu ou par l’identifiant Apple', () => {
    const subs = [{ id: 1, feed_url: FLUX_RESOLU, source_id: ENTREE.source_id }];
    expect(abonnementDe(subs, ENTREE)?.id).toBe(1);
    expect(abonnementDe(subs, { feed_url: FLUX_RESOLU })?.id).toBe(1);
    expect(abonnementDe(subs, { feed_url: '', source_id: 'apple-2' })).toBeUndefined();
  });

  it('les codes du serveur ont une phrase', () => {
    expect(cleEchecResolution('podcast_sans_flux_public')).toBe('v2.pod.noPublicFeed');
    expect(cleEchecResolution('podcast_introuvable')).toBe('v2.pod.notFoundAtApple');
    expect(cleEchecResolution('autre')).toBeNull();
  });
});
