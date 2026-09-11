// @vitest-environment jsdom
//
// #1361 — « Retrouver l'album Qobuz en cours de lecture », Cyrille Moutia,
// demandé le 30/06/2026 et redemandé le 09/08.
//
// 🔴 CE TÉMOIN EXISTE PARCE QUE LE PRÉCÉDENT ÉTAIT FAUX.
//
// La PR #832 croyait fermer #1361 en lisant `displayTrack.album_id` pour y
// trouver l'identifiant de l'album chez le service. Ce champ est un `i64` de
// la table `albums` — le type du client le dit lui-même : « Absents pour une
// radio ou un flux, qui n'ont pas d'entrée en bibliothèque. » Sur une piste
// Qobuz qu'on ne possède pas il vaut `null`, et le détournement ne se
// produisait JAMAIS.
//
// Les six témoins d'alors nourrissaient `destinationAlbum` d'une CHAÎNE qu'ils
// fournissaient eux-mêmes. Ils éprouvaient la décision ; ils n'établissaient
// jamais ce que l'appelant lui passe. Un test qui réplique le code ne le garde
// pas.
//
// Celui-ci part donc de la charge utile RÉELLE — `album_id: null`, comme le
// serveur l'envoie — et regarde ce qui PART SUR LE RÉSEAU.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NowPlaying from '../../components/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { gestesNavigationService, activeView } from '../stores/navigation';

/** Une piste Qobuz qui joue, telle que le serveur la publie vraiment. */
const PISTE_QOBUZ = {
  track_id: null,
  // 🔴 LE POINT DE TOUT LE TÉMOIN : l'identifiant d'album de la bibliothèque
  // est NUL sur une piste de service. C'est la réalité que #832 ignorait.
  album_id: null,
  artist_id: null,
  title: 'The Price',
  artist_name: 'Leprous',
  album_title: 'Malina',
  source: 'qobuz',
  source_id: 'q-piste-1',
  duration_ms: 321000,
};

const ZONE = { id: 1, name: 'Salon', state: 'playing', current_track: PISTE_QOBUZ, position_ms: 1000 };

let urls: string[] = [];
let reponseAlbum: { corps: unknown; statut: number } = { corps: null, statut: 404 };
let ouvertures: any[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(url: string) {
  if (url.includes('/album-en-cours')) {
    const ok = reponseAlbum.statut === 200;
    return {
      ok, status: reponseAlbum.statut, statusText: ok ? 'OK' : 'Not Found',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => reponseAlbum.corps,
      text: async () => JSON.stringify(reponseAlbum.corps),
    } as unknown as Response;
  }
  const corps = /\/(zones|profiles|devices|playlists|shortcuts|search)/.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function poser(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  return hote;
}
const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  urls = [];
  ouvertures = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(String(url)); return reponse(String(url)); }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  zones.set([ZONE] as any);
  currentZoneId.set(1);
  activeView.set('nowplaying');
  gestesNavigationService.set({
    ouvrirAlbum: (c) => ouvertures.push(c),
    ouvrirArtiste: () => {},
  });
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  gestesNavigationService.set(null);
  vi.unstubAllGlobals();
});

describe("#1361 — l'album de ce qui joue se demande au SERVEUR", () => {
  it('le clic sur le titre d’album interroge /zones/{id}/album-en-cours', async () => {
    reponseAlbum = { statut: 200, corps: {
      zone_id: 1, kind: 'streaming', service: 'qobuz',
      album_id: 'q-album-7', artist_id: null,
      path: '/api/v1/streaming/qobuz/albums/q-album-7', origin: 'service_lookup',
    } };
    const h = poser();
    await respirer();
    const lien = h.querySelector<HTMLElement>('.track-album');
    expect(lien, 'le titre d’album n’est pas rendu — témoin sans objet').not.toBeNull();
    urls = [];
    lien!.click();
    await respirer(120);

    expect(
      urls.some((u) => u.includes('/zones/1/album-en-cours')),
      `la route n’a pas été appelée ; URL vues : ${urls.join(' | ')}`,
    ).toBe(true);
  });

  it('une réponse `streaming` ouvre la fiche du SERVICE, avec son identifiant', async () => {
    reponseAlbum = { statut: 200, corps: {
      zone_id: 1, kind: 'streaming', service: 'qobuz',
      album_id: 'q-album-7', artist_id: null,
      path: '/api/v1/streaming/qobuz/albums/q-album-7', origin: 'session_context',
    } };
    const h = poser();
    await respirer();
    h.querySelector<HTMLElement>('.track-album')!.click();
    await respirer(120);

    expect(ouvertures.length, 'aucune fiche ouverte').toBe(1);
    expect(ouvertures[0]).toMatchObject({ service: 'qobuz', albumId: 'q-album-7' });
  });

  it('🔴 un 404 est une réponse NORMALE : on retombe sur le geste d’avant, sans erreur', async () => {
    // Radio, flux, piste sans identifiant. Le corps porte `reason`.
    reponseAlbum = { statut: 404, corps: { zone_id: 1, album_id: null, reason: 'source_sans_fiche_album' } };
    const h = poser();
    await respirer();
    h.querySelector<HTMLElement>('.track-album')!.click();
    await respirer(150);

    expect(ouvertures.length, 'une fiche a été ouverte sur un 404').toBe(0);
    // Le repli d'avant : la recherche en bibliothèque par titre.
    expect(
      urls.some((u) => /\/search|\/library/.test(u)),
      `aucun repli après le 404 ; URL vues : ${urls.join(' | ')}`,
    ).toBe(true);
  });
});
