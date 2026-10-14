// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// web#2097 (FabienM, fil forum 2236, point 8, 1.0.0-rc4) — « Il ne faut pas
// pouvoir ajouter un titre Qobuz à une playlist éditoriale de Qobuz.
// Uniquement une playlist Qobuz créée par soi peut accepter un ajout. »
//
// Le serveur dit maintenant `editable` pour chaque playlist du service. La
// fenêtre n'offre que celles qui ne sont pas `editable: false`.
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
import { estModifiable, playlistsModifiables } from '../playlistsModifiables';
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
  { cover_path: null, description: null, name: 'Ma playlist', owner: 'fabien', editable: true, source_id: '11', track_count: 3 },
  { cover_path: null, description: null, name: 'Qobuz : Jazz Essentials', owner: 'Qobuz', editable: false, source_id: '22', track_count: 40 },
  { cover_path: null, description: null, name: 'Ancien serveur', owner: null, source_id: '33', track_count: 2 },
];
const PLAYLISTS_TUNE = [{ id: 7, name: 'Liste Tune', track_count: 4 }];

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

describe('#2097 — la fenêtre n’offre que les playlists Qobuz modifiables', () => {
  it('🔴 une playlist suivie (editable: false) n’est pas proposée', async () => {
    await ouvrirFenetre(QOBUZ);
    expect(noms('service')).toEqual(['Ma playlist', 'Ancien serveur']);
    expect(noms('service')).not.toContain('Qobuz : Jazz Essentials');
    // les playlists Tune ne sont pas touchées
    expect(noms('tune')).toEqual(['Liste Tune']);
  });

  it('un serveur qui ne dit rien : la playlist reste proposée, comme avant', () => {
    expect(estModifiable({})).toBe(true);
    expect(estModifiable({ editable: null })).toBe(true);
    expect(estModifiable({ editable: false })).toBe(false);
    expect(playlistsModifiables(null)).toEqual([]);
  });
});
