// @vitest-environment jsdom
//
// web#3239 et web#3346 — la page Podcasts se fige (ajout du flux RSS « Zoom
// Zoom Zen » par rss-rf.aerion.me ; fiches de flux Radio France).
//
// Cause établie sur le vrai flux (relevé le 24/11) : sur ses 100 épisodes,
// trois paires partagent la MÊME adresse audio (rediffusions), et la 50e
// reprend la 40e. La fiche demande 50 épisodes et les rendait dans
// `{#each episodes as ep, i (ep.audio_url ?? i)}` : deux clés identiques,
// Svelte lève `each_key_duplicate` pendant le rendu (aussi en production), le
// DOM reste sur « Chargement des épisodes… » ou sur la pochette, et le graphe
// d'effets s'arrête : plus rien ne répond, seul un rechargement en sort.
//
// L'écran est MONTÉ, `fetch` est simulé.
// ⛔ N'établit pas le rendu dans un navigateur réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { currentZoneId, zones } from '../stores/zones';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const FLUX = 'https://rss-rf.aerion.me/rss/zoom-zoom-zen';
const ZEN = { title: 'Zoom Zoom Zen', author: 'France Inter', source_id: 'rss-zen', feed_url: FLUX };
const AUTRE = { title: 'Autre podcast', author: 'Radio', source_id: 'rss-autre', feed_url: 'https://flux.test/autre.xml' };

/** 50 épisodes, le 50e reprend l'adresse du 40e (comme le vrai flux). */
function episodesAvecRediffusion() {
  const eps = Array.from({ length: 50 }, (_, i) => ({
    title: `Épisode ${i + 1}`,
    audio_url: `https://media.test/zen-${i + 1}.m4a`,
    duration_ms: 1_200_000,
  }));
  eps[49] = { ...eps[49], audio_url: eps[39].audio_url };
  return eps;
}

function reponse(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let abonnements: any[] = [];

function routeur(url: string, init?: RequestInit): Response {
  if (url.includes('/podcasts/top')) return reponse(200, { items: [ZEN, AUTRE] });
  if (url.includes('/podcasts/subscriptions')) {
    if (init?.method === 'POST') {
      const cree = { id: 2, ...ZEN };
      abonnements = [cree];
      return reponse(200, cree);
    }
    return reponse(200, abonnements);
  }
  if (url.includes('/podcasts/episodes')) {
    if (url.includes(encodeURIComponent(FLUX)) || url.includes('/podcasts/episodes/2')) {
      return reponse(200, { episodes: episodesAvecRediffusion() });
    }
    return reponse(200, { episodes: [{ title: 'Épisode autre', audio_url: 'https://media.test/autre.m4a' }] });
  }
  return reponse(200, /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {});
}

const respirer = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function attendre<T>(lire: () => T | null | undefined | false, ms = 4000): Promise<T> {
  const fin = Date.now() + ms;
  for (;;) {
    flushSync();
    const v = lire();
    if (v) return v as T;
    if (Date.now() > fin) throw new Error('jamais arrivé');
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let erreurs: unknown[] = [];
const surErreur = (e: ErrorEvent) => { erreurs.push(e.error ?? e.message); e.preventDefault(); };
const surRejet = (e: PromiseRejectionEvent) => { erreurs.push(e.reason); e.preventDefault(); };

async function monter(): Promise<void> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PodcastsV2, { target: hote, props: {} as never });
  flushSync();
}

async function ouvrirDepuisPopulaires(nom: string): Promise<void> {
  const populaires = await attendre(() =>
    [...hote!.querySelectorAll<HTMLButtonElement>('nav.sections button')].find((b) => b.textContent?.trim() === fr['v2.pod.secPopular']),
  );
  populaires.click();
  const carte = await attendre(() =>
    [...hote!.querySelectorAll<HTMLElement>('.pc')].find((c) => c.querySelector('.nm')?.textContent?.trim() === nom),
  );
  carte.querySelector<HTMLButtonElement>('button.ouvrir')!.click();
  await attendre(() => hote!.querySelector('.detail h1')?.textContent?.trim() === nom);
}

const lignes = () => hote!.querySelectorAll('.detail .eprow').length;

beforeEach(() => {
  abonnements = [];
  erreurs = [];
  window.addEventListener('error', surErreur);
  window.addEventListener('unhandledrejection', surRejet);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => routeur(String(url), init)));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  zones.set([{ id: 1, name: 'Salon', state: 'stopped' }] as never);
  currentZoneId.set(1);
  locale.set('fr');
});

afterEach(() => {
  window.removeEventListener('error', surErreur);
  window.removeEventListener('unhandledrejection', surRejet);
  try { if (monte) unmount(monte); } catch { /* écran déjà mort : rien à démonter */ }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Podcasts — un flux qui répète une adresse audio ne fige plus l’écran (#3239, #3346)', () => {
  it('la fiche affiche les épisodes, une seule ligne pour la rediffusion', async () => {
    await monter();
    await ouvrirDepuisPopulaires(ZEN.title);
    await attendre(() => lignes() > 0);
    expect(lignes()).toBe(49);
    expect(hote!.querySelector('.detail')?.textContent).not.toContain(fr['v2.pod.loadingEpisodes']);
    expect(erreurs).toEqual([]);
  });

  it('l’écran reste vivant : on ferme la fiche et on en ouvre une autre', async () => {
    await monter();
    await ouvrirDepuisPopulaires(ZEN.title);
    await attendre(() => lignes() > 0);
    hote!.querySelector<HTMLButtonElement>('.detail button.close')!.click();
    await attendre(() => !hote!.querySelector('.detail'));
    await ouvrirDepuisPopulaires(AUTRE.title);
    await attendre(() => hote!.querySelector('.detail .eprow')?.textContent?.includes('Épisode autre'));
    expect(erreurs).toEqual([]);
  });

  it('ajout par adresse RSS : le podcast rejoint les abonnements et sa fiche s’affiche', async () => {
    await monter();
    hote!.querySelector<HTMLButtonElement>('button.ajout-rss')!.click();
    flushSync();
    const champ = await attendre(() => hote!.querySelector<HTMLInputElement>('form.ajout-rss-form input'));
    champ.value = FLUX;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    hote!.querySelector<HTMLFormElement>('form.ajout-rss-form')!.requestSubmit();
    await attendre(() => lignes() > 0);
    expect(lignes()).toBe(49);
    hote!.querySelector<HTMLButtonElement>('.detail button.close')!.click();
    await attendre(() => !hote!.querySelector('.detail'));
    await attendre(() =>
      [...hote!.querySelectorAll<HTMLElement>('.pc .nm')].some((n) => n.textContent?.trim() === ZEN.title),
    );
    expect(erreurs).toEqual([]);
  });
});
