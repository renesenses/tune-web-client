// @vitest-environment jsdom
//
// #3224 — Pascal (bluevelvet), fils forum 2924 et 2925 : depuis Étiquettes,
// un album QOBUZ s'ouvre sur sa fiche (pochette, titre, artiste) mais reste
// sur « Chargement des pistes… » avec « 0 titre », alors que le bouton Lire
// de sa vignette joue bien l'album (`source="qobuz" source_id=85939729`).
//
// Cause : `/tags/{id}/albums` rend la moitié streaming avec `id: null` et la
// paire `source` + `source_id`, et l'écran montait `AlbumDetailV2` SANS lui
// passer `service`. Sans `id` ni `service`, l'effet de chargement de la fiche
// sort aussitôt, et `loading` reste à `true` pour toujours.
//
// 🔴 CE TÉMOIN MONTE L'ÉCRAN et lit les requêtes réellement émises (`fetch`
// bouchonné au plus bas niveau), puis ce que la fiche affiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { origineFicheAlbumEtiquete } from '../cibleEtiquette';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string }
let requetes: Requete[] = [];
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
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
    requetes.push({ method: (init?.method ?? 'GET').toUpperCase(), url });
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

/** La ligne telle que `/tags/{id}/albums` la rend pour un album Qobuz étiqueté. */
const ALBUM_QOBUZ = {
  id: null, title: 'Night Dreamer Direct-To-Disc Sessions', artist_name: 'Seu Jorge',
  cover_path: 'https://static.qobuz.com/x.jpg', source: 'qobuz', source_id: '85939729',
  tagged_at: 1_790_000_000,
};

const PISTES_QOBUZ = [
  { source: 'qobuz', source_id: '111', title: 'Carolina', track_number: 1, duration_ms: 240000,
    artist_name: 'Seu Jorge', album_title: ALBUM_QOBUZ.title },
  { source: 'qobuz', source_id: '112', title: 'Tive Razão', track_number: 2, duration_ms: 250000,
    artist_name: 'Seu Jorge', album_title: ALBUM_QOBUZ.title },
];

describe('#3224 — un album Qobuz ouvert depuis Étiquettes liste ses pistes', () => {
  it('🔴 la fiche demande les pistes AU SERVICE et les affiche (N > 0)', async () => {
    currentZoneId.set(1);
    reponses = [
      ['/streaming/qobuz/albums/85939729/tracks', PISTES_QOBUZ],
      ['/streaming/qobuz/albums/85939729', { ...ALBUM_QOBUZ, year: 2024, track_count: 2 }],
      ['/tags/9/albums', { tag_id: 9, count: 1, albums: [ALBUM_QOBUZ] }],
      ['/tags/9/artists', { artists: [], count: 0 }],
      ['/tags/9/tracks', { tracks: [], count: 0 }],
      ['/tags/9/playlists', { playlists: [], count: 0 }],
      ['/tags/for-streaming', []],
      ['/tags', [{ id: 9, name: 'Brésil', color: '#808080' }]],
    ];
    monte = mount(EtiquettesV2, { target: hote!, props: {} });
    await souffler();
    const tag = [...hote!.querySelectorAll('button.tag')].find((b) => b.textContent?.includes('Brésil')) as HTMLButtonElement;
    expect(tag, 'l’étiquette n’est pas listée').toBeTruthy();
    tag.click();
    await souffler();
    const carte = hote!.querySelector('.carte button.meta') as HTMLButtonElement;
    expect(carte, 'l’album Qobuz étiqueté n’est pas dessiné').toBeTruthy();
    carte.click();
    await souffler(20);

    const demande = requetes.find((r) => r.method === 'GET' && r.url.includes('/streaming/qobuz/albums/85939729/tracks'));
    expect(demande, 'la fiche n’a jamais demandé les pistes de l’album Qobuz à son service').toBeTruthy();

    const texte = document.body.textContent ?? '';
    expect(texte, 'la fiche reste sur « Chargement des pistes… »').not.toContain(fr['v2.common.loadingTracks']);
    expect(texte, 'les pistes de l’album Qobuz ne sont pas listées').toContain('Carolina');
    expect(texte).toContain('Tive Razão');
  });

  it('la règle d’origine : local, service, Bandcamp, rien', () => {
    expect(origineFicheAlbumEtiquete({ id: 7, source: null, source_id: null }))
      .toEqual({ service: null, bandcamp: null });
    expect(origineFicheAlbumEtiquete({ id: null, source: 'qobuz', source_id: '85939729' }))
      .toEqual({ service: 'qobuz', bandcamp: null });
    expect(origineFicheAlbumEtiquete({ id: null, source: 'tidal', source_id: '99' }))
      .toEqual({ service: 'tidal', bandcamp: null });
    expect(origineFicheAlbumEtiquete({ id: null, source: 'bandcamp', source_id: 'https://x.bandcamp.com/album/y' }))
      .toEqual({ service: null, bandcamp: 'https://x.bandcamp.com/album/y' });
    expect(origineFicheAlbumEtiquete({ id: null, source: null, source_id: null }))
      .toEqual({ service: null, bandcamp: null });
    expect(origineFicheAlbumEtiquete(null)).toEqual({ service: null, bandcamp: null });
  });
});
