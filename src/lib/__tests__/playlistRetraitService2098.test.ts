// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// web#2098 (FabienM, fil forum 2236, point 10, 1.0.0-rc4) — « Il n'existe
// aucune action pour enlever un titre Qobuz d'une playlist Qobuz perso. Il
// faut ajouter une croix à cet effet comme c'est le cas pour une playlist
// locale ».
//
// Le serveur sait le faire (`POST /streaming/{service}/playlists/{id}/tracks/
// remove`). La fiche l'offre en mode Éditer, SEULEMENT sur une playlist dont
// le serveur dit `editable: true` (web#2097).
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
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';

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

const LIGNES = [
  { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791523' },
  { id: null, title: 'Grandma\'s Hands', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791524' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [
    ['/tracks/remove', { removed: 1 }],
    ['/streaming/qobuz/playlists/11/tracks', LIGNES],
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

async function ouvrirFiche(editable: boolean | undefined) {
  monte = mount(PlaylistDetailV2, {
    target: hote!,
    props: {
      item: { kind: 'streaming', service: 'qobuz',
        pl: { source_id: '11', name: 'Ma playlist', track_count: 2, editable } } as any,
      onClose: () => {},
    },
  });
  await attendreQue(() => (hote!.textContent ?? '').includes('Lovely Day'), 'les titres affichés');
}
const boutonEditer = () => [...hote!.querySelectorAll<HTMLButtonElement>('button')]
  .find((b) => (b.textContent ?? '').trim() === fr['v2.pl.edit']);
const croix = () => [...hote!.querySelectorAll<HTMLButtonElement>('button.retrait-service')];

describe('#2098 — retirer un titre d’une playlist Qobuz personnelle', () => {
  it('🔴 playlist à soi : Éditer, une croix par titre, et le retrait part chez le service', async () => {
    await ouvrirFiche(true);
    expect(boutonEditer(), 'le bouton Éditer manque sur une playlist Qobuz à soi').toBeTruthy();
    boutonEditer()!.click();
    await souffler();
    expect(croix().length).toBe(2);
    expect(croix()[0].getAttribute('aria-label'))
      .toBe(fr['v2.pl.removeFromService'].replace('{service}', 'qobuz'));
    croix()[0].click();
    await souffler();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.url).toMatch(/\/api\/v1\/streaming\/qobuz\/playlists\/11\/tracks\/remove$/);
    expect(w?.body).toEqual({ track_ids: ['4791523'] });
    await attendreQue(() => !(hote!.textContent ?? '').includes('Lovely Day'), 'le titre retiré de la liste');
    expect(hote!.textContent).toContain('Grandma');
  });

  it('playlist suivie (editable: false) ou serveur muet : lecture seule, aucune croix', async () => {
    await ouvrirFiche(false);
    expect(boutonEditer()).toBeUndefined();
    expect(croix().length).toBe(0);
    unmount(monte!); monte = null;
    await ouvrirFiche(undefined);
    expect(boutonEditer()).toBeUndefined();
  });
});
