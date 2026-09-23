// @vitest-environment jsdom
//
// #1232 — ÉTAPE 1 : la fiche artiste ÉLUE accepte un artiste de la
// BIBLIOTHÈQUE.
//
// Arbitrage de FabienM du 18/09/2026, cité dans renesenses/tune-server-rust#4330
// et repris par Bertrand le 23/09 : « une seule page quel que soit l'endroit du
// clic, la page de streaming servant de référence ».
//
// Le relevé de #1478 (`docs/mesures/1232-qui-ouvre-quelle-fiche-artiste.md`) a
// montré pourquoi il n'était PAS appliqué — et pas « mal » appliqué : aucune des
// dix origines de clic ne choisit une fiche, toutes choisissent d'après la
// NATURE de l'objet cliqué, et la fiche élue ne savait montrer qu'un artiste
// distant. C'est ce trou-là que cette étape bouche, et rien d'autre : la
// convergence du routage est l'étape 3, volontairement laissée de côté tant que
// la fiche élue ne sait pas tout montrer.
//
// 🔴 CE TÉMOIN APPELLE, IL NE LIT PAS LE SOURCE. On monte la VRAIE coquille, on
// pose la cible telle que l'étape 3 la posera, et on regarde les URL que
// `fetch` a réellement reçues. Avant le correctif, `service: null` partait dans
// la branche de streaming et fabriquait `/streaming/null/artists/51` — une
// route morte, sans une erreur à l'écran.
//
// Le second témoin garde la branche de SERVICE inchangée : l'étape 1 ne doit
// rien bouger sous le testeur, qui n'atteint encore que celle-là.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

const ID_LOCAL = 51;
const ARTISTE_LOCAL = {
  id: ID_LOCAL,
  name: 'Dionne Warwick',
  image_path: null,
  bio: null,
  musicbrainz_id: null,
  sort_name: 'Warwick, Dionne',
};
const ALBUMS_LOCAUX = [
  { id: 900, title: 'Promises, Promises', artist_name: 'Dionne Warwick', year: 1968, cover_path: null },
];

const ARTISTE_SERVICE = { id: null, name: 'Leprous', source: 'qobuz', source_id: 'q-42', image_path: null };
const TOP_SERVICE = [
  { source_id: 't1', title: 'The Price', artist_name: 'Leprous', album_title: 'Malina', duration_ms: 321000 },
];
const ALBUMS_SERVICE = [{ id: null, title: 'Malina', source: 'qobuz', source_id: 'a-9', year: 2017, cover_path: null }];

let urls: string[] = [];

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  let corps: unknown;
  // 🔴 Du plus précis au plus large : `/library/artists/51/albums` contient
  // `/library/artists/51`, et l'ordre inverse rendrait l'artiste à la place de
  // ses albums.
  if (url.includes(`/library/artists/${ID_LOCAL}/albums`)) corps = ALBUMS_LOCAUX;
  else if (url.includes(`/library/artists/${ID_LOCAL}/bio`)) corps = { bio: null };
  else if (url.includes(`/library/artists/${ID_LOCAL}`)) corps = ARTISTE_LOCAL;
  else if (url.includes('/artists/q-42/top-tracks')) corps = TOP_SERVICE;
  else if (url.includes('/artists/q-42/albums')) corps = ALBUMS_SERVICE;
  else if (url.includes('/streaming/qobuz/artists/q-42')) corps = ARTISTE_SERVICE;
  else corps = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return reponsePour(String(url));
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1232 étape 1 — la fiche élue sait montrer un artiste local', () => {
  it("interroge la BIBLIOTHÈQUE, jamais une route de service fabriquée sur `null`", async () => {
    const hote = poserLaCoquille();
    ficheArtisteService.set({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' });
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();

    // Le repli « À venir » de la coquille signerait une vue non montée.
    expect(hote.textContent).not.toMatch(/À venir|Coming soon/i);

    expect(urls.some((u) => /\/library\/artists\/51(\?|$)/.test(u))).toBe(true);
    expect(urls.some((u) => u.includes('/library/artists/51/albums'))).toBe(true);
    // 🔴 L'assertion qui rougit avant le correctif : `service: null` partait
    // dans `getStreamingArtist(null, '51')`.
    expect(urls.filter((u) => u.includes('/streaming/') && u.includes('/artists/51'))).toEqual([]);
    expect(urls.filter((u) => u.includes('null'))).toEqual([]);
  });

  it("rend le nom de l'artiste et sa discographie locale", async () => {
    const hote = poserLaCoquille();
    ficheArtisteService.set({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' });
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();

    expect(hote.textContent).toContain('Dionne Warwick');
    expect(hote.textContent).toContain('Promises, Promises');
    // L'en-tête dit d'où vient la fiche, et ce n'est pas un service.
    const provenance = hote.querySelector('.prov')?.textContent ?? '';
    expect(provenance).not.toMatch(/qobuz|tidal|deezer|spotify/i);
    expect(provenance.trim()).not.toBe('');
  });

  it("ne change RIEN pour un artiste de SERVICE — les trois routes restent", async () => {
    const hote = poserLaCoquille();
    ficheArtisteService.set({ service: 'qobuz', id: 'q-42', nom: 'Leprous' });
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();

    const vues = urls.filter((u) => u.includes('/streaming/qobuz/artists/q-42'));
    expect(vues.some((u) => u.endsWith('/artists/q-42'))).toBe(true);
    expect(vues.some((u) => u.includes('/top-tracks'))).toBe(true);
    expect(vues.some((u) => u.includes('/albums'))).toBe(true);
    expect(hote.textContent).toContain('Leprous');
  });
});
