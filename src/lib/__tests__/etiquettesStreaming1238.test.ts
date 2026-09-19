// @vitest-environment jsdom
//
// #1238 — « De manière à sélectionner des albums à écouter sur Qobuz ou
// Tidal, je les mets en favoris. Serait-il possible de créer une sorte de
// tag […] ? » (Patatorz, fil 1846, 19/09/2026)
//
// Le serveur sait étiqueter un objet de service depuis la v0.9.144
// (`POST /tags/{id}/streaming-items`, `…/streaming-items/remove`,
// `GET /tags/for-streaming`) ; vérifié en GET sur le .18 (v0.9.156) le
// 19/09 : `/tags/for-streaming?item_type=album&source=qobuz&source_id=…` →
// `[]`, HTTP 200. Le client n'appelait AUCUNE des trois routes, et l'écran
// Étiquettes ne savait ni jouer ni même dessiner la moitié streaming qu'il
// recevait déjà (deux albums `id: null` = deux clés `null` identiques).
//
// 🔴 CES TÉMOINS MONTENT LES ÉCRANS et lisent les requêtes réellement émises
// (`fetch` bouchonné au plus bas niveau) : l'URL et le CORPS. Un témoin qui
// appellerait `poserEtiquette` lui-même ne prouverait pas que le panneau le
// fait.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesPanneau from '../../components/v2/EtiquettesPanneau.svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import {
  cibleDeService, cleLigneEtiquetee, corpsLectureAlbumEtiquete,
  etiquettesPosees, poserEtiquette, retirerEtiquette,
} from '../cibleEtiquette';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/** Réponse par motif d'URL — le premier motif contenu dans l'URL gagne. */
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  reponses = [];
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
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

const ALBUM_QOBUZ = {
  id: null, title: 'Menagerie', artist_name: 'Bill Withers',
  cover_path: 'https://static.qobuz.com/x.jpg', source: 'qobuz', source_id: 'kxend2k5wdg06',
};

describe('#1238 — la cible choisit la route', () => {
  it('un objet de SERVICE part vers /streaming-items, avec la paire et l’instantané', async () => {
    const c = cibleDeService('album', ALBUM_QOBUZ)!;
    await poserEtiquette(4, c);
    await retirerEtiquette(4, c);
    await etiquettesPosees(c);
    const [pose, retrait, lecture] = requetes;
    expect(pose.method).toBe('POST');
    expect(pose.url).toMatch(/\/tags\/4\/streaming-items$/);
    expect(pose.body).toEqual({
      item_type: 'album', source: 'qobuz', source_id: 'kxend2k5wdg06',
      title: 'Menagerie', artist: 'Bill Withers', album: null, cover_url: 'https://static.qobuz.com/x.jpg',
    });
    expect(retrait.method).toBe('POST');
    expect(retrait.url).toMatch(/\/tags\/4\/streaming-items\/remove$/);
    expect(retrait.body).toEqual({ item_type: 'album', source: 'qobuz', source_id: 'kxend2k5wdg06' });
    expect(lecture.url).toMatch(/\/tags\/for-streaming\?item_type=album&source=qobuz&source_id=kxend2k5wdg06$/);
  });

  it('un objet de la BIBLIOTHÈQUE garde ses routes à entier', async () => {
    await poserEtiquette(4, { itemType: 'album', itemId: 12 });
    expect(requetes[0].url).toMatch(/\/tags\/4\/items$/);
    expect(requetes[0].body).toEqual({ item_type: 'album', item_id: 12 });
  });

  it('cibleDeService refuse ce qui n’est pas un objet de service', () => {
    expect(cibleDeService('album', { id: 3, source: 'local', source_id: '3' })).toBeNull();
    expect(cibleDeService('album', { source: 'upnp:x', source_id: 'a' })).toBeNull();
    expect(cibleDeService('album', { source: 'qobuz', source_id: null })).toBeNull();
    expect(cibleDeService('album', { source: 'tidal', source_id: 12345 })?.sourceId).toBe('12345');
  });
});

describe('#1238 — le panneau pose l’étiquette sur un album Qobuz', () => {
  it('🔴 cliquer « + À écouter » envoie POST /tags/4/streaming-items avec la paire', async () => {
    reponses = [
      ['/tags/for-streaming', []],
      ['/tags/', [{ id: 4, name: 'À écouter', color: '#808080' }]],
    ];
    monte = mount(EtiquettesPanneau, {
      target: hote!,
      props: { cible: cibleDeService('album', ALBUM_QOBUZ), nom: 'Menagerie', onClose: () => {} },
    });
    await souffler();
    const bouton = [...document.querySelectorAll('button.ajoutable')].find((b) => b.textContent?.includes('À écouter')) as HTMLButtonElement;
    expect(bouton, 'l’étiquette « À écouter » n’est pas proposée').toBeTruthy();
    bouton.click();
    await souffler();
    const pose = requetes.find((r) => r.method === 'POST' && r.url.includes('/tags/4/'));
    expect(pose, 'aucune pose partie').toBeTruthy();
    expect(pose!.url, 'la pose part vers la route à ENTIER, qu’un album Qobuz ne peut pas honorer')
      .toMatch(/\/tags\/4\/streaming-items$/);
    expect(pose!.body.source_id).toBe('kxend2k5wdg06');
    expect(pose!.body.source).toBe('qobuz');
  });
});

describe('#1238 — le bouton Étiquettes d’une piste de service', () => {
  const PISTE_QOBUZ = {
    id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
    source: 'qobuz', source_id: '52528016', duration_ms: 255000,
  } as unknown as Track;

  function boutonEtiquettes(): HTMLButtonElement | undefined {
    return [...hote!.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === fr['v2.cover.tags'],
    ) as HTMLButtonElement | undefined;
  }

  it('🔴 une piste Qobuz porte le bouton, et il ouvre le panneau sur sa paire', async () => {
    reponses = [['/tags/for-streaming', []], ['/tags/', []]];
    monte = mount(PisteActions, { target: hote!, props: { piste: PISTE_QOBUZ } });
    await souffler();
    const b = boutonEtiquettes();
    expect(b, 'une piste de service n’a toujours pas de bouton Étiquettes').toBeTruthy();
    b!.click();
    await souffler(12);
    const lecture = requetes.find((r) => r.url.includes('/tags/for'));
    expect(lecture?.url, 'le panneau n’a pas demandé les étiquettes de CETTE piste de service')
      .toMatch(/\/tags\/for-streaming\?item_type=track&source=qobuz&source_id=52528016$/);
  });

  it('une piste sans paire ni identifiant n’en a pas', async () => {
    monte = mount(PisteActions, {
      target: hote!, props: { piste: { ...PISTE_QOBUZ, source_id: null } as unknown as Track },
    });
    await souffler();
    expect(boutonEtiquettes()).toBeUndefined();
  });
});

describe('#1238 — l’écran Étiquettes joue sa moitié streaming', () => {
  it('🔴 deux albums Qobuz étiquetés se dessinent, et « Lire » part avec la paire', async () => {
    currentZoneId.set(1);
    reponses = [
      ['/tags/4/albums', { tag_id: 4, count: 2, albums: [
        ALBUM_QOBUZ,
        { ...ALBUM_QOBUZ, title: 'Still Bill', source_id: 'abc123' },
      ] }],
      ['/tags/4/artists', { artists: [], count: 0 }],
      ['/tags/4/tracks', { tracks: [], count: 0 }],
      ['/tags/4/playlists', { playlists: [], count: 0 }],
      ['/zones/1/play', { id: 1, name: 'Z', state: 'playing' }],
      ['/tags', [{ id: 4, name: 'À écouter', color: '#808080' }]],
    ];
    monte = mount(EtiquettesV2, { target: hote!, props: {} });
    await souffler();
    const tag = [...hote!.querySelectorAll('button.tag')].find((b) => b.textContent?.includes('À écouter')) as HTMLButtonElement;
    expect(tag, 'l’étiquette n’est pas listée').toBeTruthy();
    tag.click();
    await souffler();
    const titres = [...hote!.querySelectorAll('.carte .ct')].map((e) => e.textContent);
    expect(titres, 'les deux albums Qobuz ne sont pas dessinés').toEqual(['Menagerie', 'Still Bill']);
    const lire = [...hote!.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === `${fr['common.play']} — Still Bill`,
    ) as HTMLButtonElement;
    expect(lire, 'pas de bouton Lire sur l’album Qobuz').toBeTruthy();
    lire.click();
    await souffler();
    const play = requetes.find((r) => r.method === 'POST' && r.url.includes('/zones/1/play'));
    expect(play, 'un clic sur « Lire » d’un album Qobuz étiqueté ne fait rien').toBeTruthy();
    expect(play!.body).toEqual({ source: 'qobuz', streaming_album_id: 'abc123' });
  });

  it('les règles appelées : clé de ligne et corps de lecture', () => {
    expect(cleLigneEtiquetee({ id: null, source: 'qobuz', source_id: 'a' }, 0))
      .not.toBe(cleLigneEtiquetee({ id: null, source: 'qobuz', source_id: 'b' }, 1));
    expect(cleLigneEtiquetee({ id: 7 }, 0)).toBe('l:7');
    expect(corpsLectureAlbumEtiquete({ id: 7 })).toEqual({ album_id: 7 });
    expect(corpsLectureAlbumEtiquete({ id: null, source: 'tidal', source_id: '99' }))
      .toEqual({ source: 'tidal', streaming_album_id: '99' });
    expect(corpsLectureAlbumEtiquete({ id: null, source: null, source_id: null })).toBeNull();
  });
});
