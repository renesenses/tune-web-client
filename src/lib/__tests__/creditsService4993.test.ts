// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// tune-server-rust#4993 — les crédits d'un titre et d'un album de SERVICE
// (FabienM, fil forum 1921). Le serveur (srv#5041) sert
//
//     GET /streaming/{service}/tracks/{source_id}/credits
//     GET /streaming/{service}/albums/{album_source_id}/credits
//
// dans la forme des routes de bibliothèque, avec `id` et `artist_id` nuls et
// `track_id` en CHAÎNE. Qobuz seul ; les autres répondent 501, un serveur
// antérieur 404.
//
// Cette garde MONTE les surfaces (barre v2, menu du client actuel, fiche
// album) contre des réponses simulées : une entrée écrite mais pas branchée,
// une clé de `{#each}` en double ou un refus qui ferait planter le tiroir y
// seraient rouges.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import CreditsTiroir from '../../components/partages/CreditsTiroir.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import {
  SERVICES_AVEC_CREDITS,
  creditsAlbumDeServiceDe,
  creditsDeServiceDe,
  oublierRefusDeCredits,
} from '../creditsService';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;
const VOIR = fr['credits.see'];
const BOUTON_ALBUM = fr['artist.credits'];

const QOBUZ = {
  id: null, source: 'qobuz', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: 'atua1kxxk4tis', duration_ms: 360000,
};
const TIDAL = { ...QOBUZ, source: 'tidal', source_id: '77001', album_id: '77000' };

/** `GET /streaming/qobuz/tracks/441078583/credits` — la forme de srv#5041. */
const CREDITS_PISTE_QOBUZ = [
  { id: null, track_id: '441078583', artist_id: null, artist_name: 'Neil Young', role: 'composer', instrument: null, position: 0 },
  { id: null, track_id: '441078583', artist_id: null, artist_name: 'Neil Young', role: 'performer', instrument: 'guitar', position: 1 },
  { id: null, track_id: '441078583', artist_id: null, artist_name: 'Ben Keith', role: 'performer', instrument: 'pedal steel', position: 2 },
  { id: null, track_id: '441078583', artist_id: null, artist_name: 'Neil Young', role: 'vocal', instrument: null, position: 3 },
];

/**
 * `GET /streaming/qobuz/albums/atua1kxxk4tis/credits` : triés disque, piste,
 * position ; la même personne sur trois pistes, deux interprètes sans
 * `artist_id` sur la même ligne — le cas qui ferait des clés en double.
 */
const CREDITS_ALBUM_QOBUZ = [
  { id: null, track_id: '441078581', artist_id: null, artist_name: 'Neil Young', role: 'composer', instrument: null, position: 0, track_title: 'First', track_number: 1, disc_number: 1 },
  { id: null, track_id: '441078581', artist_id: null, artist_name: 'Ben Keith', role: 'performer', instrument: 'pedal steel', position: 1, track_title: 'First', track_number: 1, disc_number: 1 },
  { id: null, track_id: '441078582', artist_id: null, artist_name: 'Neil Young', role: 'composer', instrument: null, position: 0, track_title: 'Second', track_number: 2, disc_number: 1 },
  { id: null, track_id: '441078582', artist_id: null, artist_name: 'Ben Keith', role: 'performer', instrument: 'pedal steel', position: 1, track_title: 'Second', track_number: 2, disc_number: 1 },
  { id: null, track_id: '441078582', artist_id: null, artist_name: 'Tim Drummond', role: 'performer', instrument: 'pedal steel', position: 2, track_title: 'Second', track_number: 2, disc_number: 1 },
  { id: null, track_id: '441078585', artist_id: null, artist_name: 'Neil Young', role: 'composer', instrument: null, position: 0, track_title: 'Fifth', track_number: 5, disc_number: 1 },
];

interface Requete { method: string; url: string }
let requetes: Requete[] = [];
let reponses: [string, unknown, number?][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(condition: () => boolean, limiteMs = 20_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let montes: { hote: HTMLDivElement; monte: Record<string, any> }[] = [];
function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const monte = mount(composant, { target: hote, props: props as any });
  montes.push({ hote, monte });
  flushSync();
  return hote;
}
function toutDemonter() {
  for (const { hote, monte } of montes) { unmount(monte); hote.remove(); }
  montes = [];
  document.body.innerHTML = '';
}

function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
}
function menuV1(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(MenuPisteV1, { piste });
  el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item'));
}
const entreeVoir = (items: HTMLButtonElement[]) =>
  items.find((b) => (b.textContent ?? '').trim() === VOIR);

const fiche = () => document.querySelector<HTMLElement>('[data-credits]');
const texteFiche = () => fiche()?.textContent ?? '';
const lignes = () =>
  [...document.querySelectorAll<HTMLElement>('[data-credits] .ligne')].map((l) =>
    `${l.querySelector('.role')!.textContent!.trim()} = ${l.querySelector('.noms')!.textContent!.replace(/\s+/g, ' ').trim()}`);

let erreursConsole: unknown[][] = [];

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  oublierRefusDeCredits();
  requetes = [];
  erreursConsole = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erreursConsole.push(a); });
  reponses = [
    ['/streaming/qobuz/tracks/441078583/credits', CREDITS_PISTE_QOBUZ],
    ['/streaming/qobuz/albums/atua1kxxk4tis/credits', CREDITS_ALBUM_QOBUZ],
    ['/streaming/tidal/', { detail: 'Not Implemented' }, 501],
  ];
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree.toString();
    requetes.push({ method: (init?.method ?? 'GET').toUpperCase(), url });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const statut = trouve?.[2] ?? 200;
    const corps = trouve ? trouve[1] : [];
    return {
      ok: statut < 400, status: statut, statusText: statut < 400 ? 'OK' : 'Error',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});

afterEach(() => {
  toutDemonter();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  oublierRefusDeCredits();
});

const erreurDeCle = () =>
  erreursConsole.flat().some((x) => /each_key_duplicate|duplicate key/i.test(String((x as any)?.message ?? x)));

describe('#4993 — « Voir les crédits » sur un titre de service', () => {
  it('barre v2 : PRÉSENTE pour un titre Qobuz', () => {
    expect(entreeVoir(menuV2(QOBUZ))).toBeTruthy();
  });
  it('client actuel : PRÉSENTE pour un titre Qobuz', () => {
    expect(entreeVoir(menuV1(QOBUZ))).toBeTruthy();
  });
  it('Tidal (501) : ABSENTE des deux menus, et aucune requête de crédits', () => {
    expect(entreeVoir(menuV2(TIDAL))).toBeUndefined();
    toutDemonter();
    expect(entreeVoir(menuV1(TIDAL))).toBeUndefined();
    expect(requetes.some((r) => r.url.includes('/credits'))).toBe(false);
  });

  it('🔴 le clic ouvre la fiche, groupée par rôle, depuis la route du SERVICE', async () => {
    entreeVoir(menuV2(QOBUZ))!.click();
    flushSync();
    expect(await attendreQue(() => texteFiche().includes('Ben Keith'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/streaming/qobuz/tracks/441078583/credits'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/library/tracks/'))).toBe(false);
    expect(fiche()!.dataset.credits).toBe('piste');
    expect(lignes()).toEqual([
      `${fr['credits.composer']} = Neil Young`,
      'Guitar = Neil Young',
      'Pedal steel = Ben Keith',
      `${fr['credits.vocal']} = Neil Young`,
    ]);
    // `artist_id` nul : du texte, jamais un lien qui n'ouvrirait rien.
    expect(fiche()!.querySelectorAll('button.lien').length).toBe(0);
    expect(erreurDeCle()).toBe(false);
  });

  it('client actuel : le clic ouvre la même fiche', async () => {
    entreeVoir(menuV1(QOBUZ))!.click();
    flushSync();
    expect(await attendreQue(() => texteFiche().includes('Ben Keith'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/streaming/qobuz/tracks/441078583/credits'))).toBe(true);
  });

  it('🔴 serveur antérieur (404) : message clair, puis l’entrée DISPARAÎT', async () => {
    reponses = [['/streaming/qobuz/tracks/441078583/credits', { detail: 'Not Found' }, 404]];
    entreeVoir(menuV2(QOBUZ))!.click();
    flushSync();
    expect(await attendreQue(() => !!document.querySelector('[data-credits-indisponible]'))).toBe(true);
    expect(texteFiche()).toContain(fr['credits.serviceUnavailable']);
    toutDemonter();
    expect(entreeVoir(menuV2(QOBUZ))).toBeUndefined();
    toutDemonter();
    expect(entreeVoir(menuV1(QOBUZ))).toBeUndefined();
  });

  it('501 reçu malgré la liste : message clair, pas de plantage', async () => {
    reponses = [['/streaming/qobuz/', { detail: 'Not Implemented' }, 501]];
    poser(CreditsTiroir, {
      cible: { type: 'piste', trackId: null, service: { service: 'qobuz', sourceId: '1' }, titre: 'X' },
      onClose: () => {},
    });
    expect(await attendreQue(() => !!document.querySelector('[data-credits-indisponible]'))).toBe(true);
    expect(texteFiche()).toContain(fr['credits.serviceUnavailable']);
    expect(creditsDeServiceDe(QOBUZ)).toBeNull();
  });

  it('réponse vide : le dit, sans proposer MusicBrainz (il n’écrit que la bibliothèque)', async () => {
    reponses = [['/streaming/qobuz/tracks/9/credits', []]];
    poser(CreditsTiroir, {
      cible: { type: 'piste', trackId: null, service: { service: 'qobuz', sourceId: '9' } },
      onClose: () => {},
    });
    expect(await attendreQue(() => !!document.querySelector('[data-credits-vide]'))).toBe(true);
    expect(texteFiche()).toContain(fr['credits.noneService']);
    expect(document.querySelector('button.enrichir')).toBeNull();
  });
});

describe('#4993 — le bouton « Crédits » de la fiche d’un album de service', () => {
  const ALBUM_QOBUZ = {
    id: null, title: 'Second Song', artist_name: 'Neil Young',
    source: 'qobuz', source_id: 'atua1kxxk4tis',
  } as unknown as Album;
  const ALBUM_TIDAL = { ...ALBUM_QOBUZ, source: 'tidal', source_id: '77000' } as unknown as Album;
  const boutonCredits = (hote: HTMLElement) =>
    [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === BOUTON_ALBUM);

  it('🔴 album Qobuz : bouton présent ; chaque nom une fois, suivi de ses pistes', async () => {
    const hote = poser(AlbumDetailV2, { album: ALBUM_QOBUZ, service: 'qobuz', onClose: () => {} });
    await attendreQue(() => !!boutonCredits(hote), 5_000);
    const b = boutonCredits(hote);
    expect(b, 'la fiche d’un album Qobuz n’a pas de bouton Crédits').toBeTruthy();
    b!.click();
    flushSync();
    expect(await attendreQue(() => texteFiche().includes('Tim Drummond'))).toBe(true);
    expect(fiche()!.dataset.credits).toBe('album');
    expect(requetes.some((r) => r.url.includes('/streaming/qobuz/albums/atua1kxxk4tis/credits'))).toBe(true);
    expect(requetes.some((r) => r.url.includes('/library/albums/'))).toBe(false);

    const compo = [...document.querySelectorAll<HTMLElement>('[data-credits] .ligne')]
      .find((l) => l.dataset.role === 'composer')!;
    expect(compo.querySelectorAll('.nom').length).toBe(1);
    expect(compo.querySelector('.pistes')!.textContent).toBe(fr['credits.onTracks'].replace('{liste}', '1, 2, 5'));
    const steel = [...document.querySelectorAll<HTMLElement>('[data-credits] .ligne')]
      .find((l) => l.dataset.role === 'performer')!;
    expect([...steel.querySelectorAll('.nom')].map((n) => n.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      `Ben Keith ${fr['credits.onTracks'].replace('{liste}', '1, 2')}`,
      `Tim Drummond ${fr['credits.onTracks'].replace('{liste}', '2')}`,
    ]);
    // `track_id` en chaîne, `id` et `artist_id` nuls : aucune clé en double.
    expect(erreurDeCle()).toBe(false);
  });

  it('album Tidal (501) : pas de bouton', async () => {
    const hote = poser(AlbumDetailV2, { album: ALBUM_TIDAL, service: 'tidal', onClose: () => {} });
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(boutonCredits(hote)).toBeUndefined();
  });

  it('album Qobuz, serveur antérieur (404) : message, puis plus de bouton', async () => {
    reponses = [['/streaming/qobuz/albums/atua1kxxk4tis/credits', { detail: 'Not Found' }, 404]];
    const hote = poser(AlbumDetailV2, { album: ALBUM_QOBUZ, service: 'qobuz', onClose: () => {} });
    await attendreQue(() => !!boutonCredits(hote), 5_000);
    boutonCredits(hote)!.click();
    flushSync();
    expect(await attendreQue(() => !!document.querySelector('[data-credits-indisponible]'))).toBe(true);
    // Le tiroir reste ouvert pour le dire ; le bouton, lui, est retiré.
    expect(boutonCredits(hote)).toBeUndefined();
  });
});

describe('#4993 — la règle, en pur', () => {
  it('Qobuz seul, et une liste facile à étendre', () => {
    expect([...SERVICES_AVEC_CREDITS]).toEqual(['qobuz']);
    expect(creditsDeServiceDe(QOBUZ)).toEqual({ service: 'qobuz', sourceId: '441078583' });
    expect(creditsDeServiceDe(TIDAL)).toBeNull();
    expect(creditsDeServiceDe({ ...QOBUZ, source: 'radio' })).toBeNull();
    expect(creditsAlbumDeServiceDe('qobuz', 'atua1kxxk4tis')).toEqual({ service: 'qobuz', albumId: 'atua1kxxk4tis' });
    expect(creditsAlbumDeServiceDe('qobuz', '')).toBeNull();
    expect(creditsAlbumDeServiceDe('bandcamp', 'https://x.bandcamp.com/album/y')).toBeNull();
    expect(creditsAlbumDeServiceDe(null, 'x')).toBeNull();
  });
});
