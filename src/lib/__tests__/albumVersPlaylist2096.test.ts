// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// web#2096 (FabienM, fil forum 2236, point 7, 1.0.0-rc4) — « Il faut pouvoir
// ajouter un album à une playlist, je ne vois aucun bouton permettant de le
// faire ».
//
//   (a) le menu « … » d'un album (local ET de service) porte l'entrée
//       « Ajouter à une playlist » ;
//   (b) le geste ouvre la fenêtre partagée avec TOUTES les pistes, et
//       l'écriture part en une requête, chez Tune comme chez le service.
//
// Banc repris de : tune-server-rust#4889 — « Playlists Tune : pouvoir y ranger un titre de
// service (Bandcamp, Qobuz, Tidal…) ».
//
// Le serveur ENREGISTRE désormais un titre de service dans une playlist Tune
// (`POST /playlists/{id}/tracks` avec `streaming_tracks`), le rend par `GET`
// (`id: null`, `source`, `source_id`) et réordonne par RANGS
// (`PUT … { positions }`). Ce banc tient les trois moitiés côté client :
//
//   (a) la fenêtre propose les playlists TUNE pour un titre Bandcamp, et
//       Tune + le service pour un titre Qobuz, en deux groupes titrés ;
//   (b) l'entrée « Ajouter à une playlist » existe pour un titre Bandcamp —
//       au menu comme dans la barre d'actions ;
//   (c) le réordonnancement envoie `positions`, et déplace aussi une ligne de
//       service (id nul) que l'ancienne forme `track_ids` laissait clouée.
//
// On MONTE les composants et on lit les requêtes réellement émises.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AddToPlaylistModal from '../../components/partages/AddToPlaylistModal.svelte';
import AjoutAlbumPlaylistV2 from '../../components/v2/AjoutAlbumPlaylistV2.svelte';
import { get } from 'svelte/store';
import { entreesObjet, objetAlbum } from '../gestesObjet';
import { demandeAjoutPlaylist } from '../demandeAjoutPlaylist';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/** Réponse par motif d'URL — le premier motif contenu dans l'URL gagne. */
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}

const PLAYLISTS_QOBUZ = [
  { cover_path: null, description: null, name: 'Soirées jazz', owner: null, source_id: '69142842', track_count: 3 },
  { cover_path: null, description: null, name: 'Route', owner: null, source_id: '68857313', track_count: 2 },
];
const PLAYLISTS_TUNE = [{ id: 7, name: 'Liste Tune', track_count: 4 }];
const PISTES_QOBUZ = [
  { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie', album_id: 'q-alb-1', source: 'qobuz', source_id: '4791523' },
  { id: null, title: 'It Ain\'t Love', artist_name: 'Bill Withers', album_title: 'Menagerie', album_id: 'q-alb-1', source: 'qobuz', source_id: '4791524' },
];
const PISTES_LOCALES = [
  { id: 601, title: 'Un', artist_name: 'X', source: 'local' },
  { id: 602, title: 'Deux', artist_name: 'X', source: 'local' },
];

const BANDCAMP = {
  id: null, title: 'Morceau', artist_name: 'Artiste', album_title: 'Album',
  album_id: 'bc-album-12', source: 'bandcamp',
  source_id: 'https://artiste.bandcamp.com/track/morceau', duration_ms: 200000,
  cover_path: 'https://f4.bcbits.com/img/a1_10.jpg',
} as unknown as Track;
const QOBUZ = {
  id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
  album_id: 'q-alb-1', source: 'qobuz', source_id: '4791523', duration_ms: 255000,
} as unknown as Track;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [
    ['/streaming/qobuz/albums/q-alb-1/tracks', PISTES_QOBUZ],
    ['/library/albums/60/tracks', PISTES_LOCALES],
    ['/streaming/qobuz/playlists', PLAYLISTS_QOBUZ],
    ['/playlists', PLAYLISTS_TUNE],
  ];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const charge = trouve ? trouve[1] : {};
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond, .modal-backdrop').forEach((e) => e.remove());
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

async function ouvrirFenetre(track: Track) {
  monte = mount(AddToPlaylistModal, { target: hote!, props: { track, onClose: () => {} } });
  await attendreQue(() => !!document.querySelector('.modal .modal-body .playlist-list'), 'la liste des playlists');
  await souffler();
}
const groupes = () =>
  [...document.querySelectorAll<HTMLElement>('.playlist-list .pl-groupe')].map((e) => e.dataset.groupe);
const noms = (ou?: string) =>
  [...document.querySelectorAll<HTMLElement>(`.playlist-option${ou ? `[data-ou="${ou}"]` : ''} .pl-name`)]
    .map((e) => (e.textContent ?? '').trim());

const cles = (album: any) => entreesObjet(objetAlbum(album), (k) => k).map((e) => e.cle);

describe('(a) #2096 — le menu « … » d’un album porte « Ajouter à une playlist »', () => {
  it('🔴 album de la bibliothèque', () => {
    expect(cles({ id: 60, title: 'Aphelion', artist_name: 'Leprous' })).toContain('playlist.addToPlaylist');
  });
  it('🔴 album de service', () => {
    expect(cles({ id: null, title: 'Menagerie', source: 'qobuz', source_id: 'q-alb-1', artist_name: 'Bill Withers' }))
      .toContain('playlist.addToPlaylist');
  });
});

async function geste(album: any) {
  demandeAjoutPlaylist.set(null);
  const entree = entreesObjet(objetAlbum(album), (k) => k).find((e) => e.cle === 'playlist.addToPlaylist')!;
  entree.faire();
  const d = get(demandeAjoutPlaylist);
  expect(d, 'le geste n’a posé aucune demande').toBeTruthy();
  monte = mount(AjoutAlbumPlaylistV2, { target: hote!, props: { demande: d!, onClose: () => {} } });
  await attendreQue(() => !!document.querySelector('.modal .modal-body .playlist-list'), 'la liste des playlists');
  await souffler();
}
const choisir = (ou: string, nom: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`.playlist-option[data-ou="${ou}"]`)]
    .find((b) => b.textContent?.includes(nom))!.click();

describe('(b) #2096 — l’album entier part en une requête', () => {
  it('🔴 album Qobuz vers la playlist Qobuz : les deux titres, dans l’ordre', async () => {
    await geste({ id: null, title: 'Menagerie', source: 'qobuz', source_id: 'q-alb-1', artist_name: 'Bill Withers' });
    choisir('service', 'Soirées jazz');
    await souffler();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.url).toMatch(/\/streaming\/qobuz\/playlists\/69142842\/tracks$/);
    expect(w?.body).toEqual({ track_ids: ['4791523', '4791524'] });
  });

  it('🔴 album Qobuz vers une playlist Tune : deux `streaming_tracks`', async () => {
    await geste({ id: null, title: 'Menagerie', source: 'qobuz', source_id: 'q-alb-1', artist_name: 'Bill Withers' });
    choisir('tune', 'Liste Tune');
    await souffler();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.url).toMatch(/\/api\/v1\/playlists\/7\/tracks$/);
    expect(w?.body?.track_ids).toEqual([]);
    expect(w?.body?.streaming_tracks?.map((x: any) => x.source_id)).toEqual(['4791523', '4791524']);
  });

  it('🔴 album local vers une playlist Tune : les `track_ids` de tout l’album', async () => {
    await geste({ id: 60, title: 'Aphelion', artist_name: 'Leprous' });
    choisir('tune', 'Liste Tune');
    await souffler();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.body?.track_ids).toEqual([601, 602]);
  });

  it('un titre seul garde sa forme d’avant', async () => {
    monte = mount(AddToPlaylistModal, { target: hote!, props: { track: QOBUZ, onClose: () => {} } });
    await attendreQue(() => !!document.querySelector('.modal .modal-body .playlist-list'), 'la liste');
    await souffler();
    choisir('service', 'Route');
    await souffler();
    expect(requetes.find((r) => r.method === 'POST')?.body).toEqual({ track_ids: ['4791523'] });
  });
});
