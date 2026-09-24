// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// tune-server-rust#4889 — « Playlists Tune : pouvoir y ranger un titre de
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
import PisteActions from '../../components/v2/PisteActions.svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { reorderPlaylistTracks } from '../api';
import { entreesMenuPiste } from '../menuPiste';
import { rangeableEnPlaylist } from '../pisteFile';
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

describe('(a) #4889 — la fenêtre « Ajouter à une playlist » d’un titre de service', () => {
  it('🔴 Bandcamp : les playlists TUNE, sous leur titre — et l’écriture part chez Tune', async () => {
    await ouvrirFenetre(BANDCAMP);
    expect(groupes(), 'le groupe « Playlists Tune » manque').toEqual(['tune']);
    expect(document.querySelector('.pl-groupe[data-groupe="tune"]')?.textContent?.trim())
      .toBe(fr['playlist.groupTune']);
    expect(noms('tune')).toEqual(['Liste Tune']);
    [...document.querySelectorAll<HTMLButtonElement>('.playlist-option')]
      .find((b) => b.textContent?.includes('Liste Tune'))!.click();
    await souffler();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.url).toMatch(/\/api\/v1\/playlists\/7\/tracks$/);
    expect(w?.body?.track_ids).toEqual([]);
    expect(w?.body?.streaming_tracks).toEqual([expect.objectContaining({
      source: 'bandcamp', source_id: 'https://artiste.bandcamp.com/track/morceau',
      title: 'Morceau', album_id: 'bc-album-12',
    })]);
  });

  it('🔴 Qobuz : Tune ET Qobuz, deux groupes titrés, chacun écrit chez lui', async () => {
    await ouvrirFenetre(QOBUZ);
    expect(groupes()).toEqual(['tune', 'service']);
    expect(document.querySelector('.pl-groupe[data-groupe="service"]')?.textContent?.trim())
      .toBe(fr['playlist.servicePlaylistsOf'].replace('{service}', 'Qobuz'));
    expect(noms('tune')).toEqual(['Liste Tune']);
    expect(noms('service')).toEqual(['Soirées jazz', 'Route']);
    // Choisir la playlist TUNE : le titre Qobuz y entre par `streaming_tracks`.
    [...document.querySelectorAll<HTMLButtonElement>('.playlist-option[data-ou="tune"]')][0].click();
    await souffler();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.url).toMatch(/\/api\/v1\/playlists\/7\/tracks$/);
    expect(w?.body?.streaming_tracks?.[0]).toEqual(expect.objectContaining({ source: 'qobuz', source_id: '4791523' }));
    expect(requetes.some((r) => r.method === 'POST' && r.url.includes('/streaming/qobuz/'))).toBe(false);
  });

  it('une piste de la bibliothèque : rien ne change, pas de titre de groupe', async () => {
    await ouvrirFenetre({ id: 12, title: 'X', artist_name: 'Y', source: 'local' } as unknown as Track);
    expect(groupes()).toEqual([]);
    expect(noms()).toEqual(['Liste Tune']);
  });
});

describe('(b) #4889 — l’entrée « Ajouter à une playlist » existe pour un titre Bandcamp', () => {
  it('🔴 au menu : la règle, appelée', () => {
    const base = { jouable: true, idBibliotheque: null, artistId: null, albumId: null };
    const cles = entreesMenuPiste(
      { ...base, rangeableEnPlaylist: rangeableEnPlaylist(BANDCAMP) },
      { ajouterAPlaylist: () => {} },
    ).map((e) => e.cle);
    expect(cles).toContain('nowplaying.addToPlaylist');
  });

  it('🔴 au menu « … » MONTÉ de la barre d’un titre Bandcamp', async () => {
    currentZoneId.set(1);
    monte = mount(PisteActions, { target: hote!, props: { piste: BANDCAMP } });
    await souffler();
    hote!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await souffler();
    const libelles = [...document.querySelectorAll<HTMLElement>('button[role="menuitem"]')]
      .map((b) => (b.textContent ?? '').trim());
    expect(libelles.some((l) => l.includes(fr['nowplaying.addToPlaylist'])),
      '« Ajouter à une playlist » absent pour un titre Bandcamp').toBe(true);
  });

  it('🔴 dans la barre : la case playlist d’un titre Bandcamp porte son bouton', async () => {
    currentZoneId.set(1);
    monte = mount(PisteActions, { target: hote!, props: { piste: BANDCAMP } });
    await souffler();
    expect(hote!.querySelector(`button.pa[aria-label="${fr['v2.pa.playlist']}"]`),
      'la case playlist Bandcamp est vide').toBeTruthy();
  });
});

describe('(c) #4889 — le réordonnancement parle en RANGS', () => {
  it('🔴 `api.reorderPlaylistTracks` envoie `{ positions }`', async () => {
    await reorderPlaylistTracks(7, [2, 0, 1]);
    const w = requetes.find((r) => r.method === 'PUT');
    expect(w?.url).toMatch(/\/api\/v1\/playlists\/7\/tracks$/);
    expect(w?.body).toEqual({ positions: [2, 0, 1] });
  });

  it('🔴 la fiche playlist déplace une ligne de SERVICE et envoie la permutation', async () => {
    const LIGNES = [
      { id: 5, title: 'Locale A', artist_name: 'X', source: 'local' },
      { id: null, title: 'Titre Bandcamp', artist_name: 'Y', source: 'bandcamp',
        source_id: 'https://y.bandcamp.com/track/t', album_id: 'bc-1', cover_path: 'https://f4.bcbits.com/img/x.jpg' },
      { id: 9, title: 'Locale B', artist_name: 'Z', source: 'local' },
    ];
    reponses = [['/playlists/77/tracks', LIGNES], ['/playlists', PLAYLISTS_TUNE]];
    monte = mount(PlaylistDetailV2, {
      target: hote!,
      props: { item: { kind: 'local', pl: { id: 77, name: 'Mixte' } } as any, onClose: () => {} },
    });
    await attendreQue(() => (hote!.textContent ?? '').includes('Titre Bandcamp'), 'la ligne Bandcamp affichée');
    // Mode édition, puis « descendre » sur la ligne Bandcamp (rang 1).
    [...hote!.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => (b.textContent ?? '').trim() === fr['v2.pl.edit'])!.click();
    await souffler();
    const descendre = [...hote!.querySelectorAll<HTMLButtonElement>(`button[aria-label="${fr['playlist.moveDown']}"]`)];
    expect(descendre.length, 'une flèche par ligne, ligne de service comprise').toBe(3);
    descendre[1].click();
    await souffler();
    const w = requetes.find((r) => r.method === 'PUT');
    expect(w?.url).toMatch(/\/api\/v1\/playlists\/77\/tracks$/);
    expect(w?.body).toEqual({ positions: [0, 2, 1] });
  });
});
