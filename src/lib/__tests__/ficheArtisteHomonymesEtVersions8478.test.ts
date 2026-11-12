// @vitest-environment jsdom
//
// Ronin22, AudioScienceReview « Mozaiklabs Tune player », post #169 (rc11) :
//
//  - tune-server-rust#8478 : « Some of those main albums don't belong to the
//    group "Cannons" » — la fiche d'un artiste mêlait les albums de groupes
//    HOMONYMES. Données relevées sur le .18 le 11/11/2026 : Qobuz range sous
//    Moonchild (790734) un « Friends Are For » d'un autre Moonchild
//    (33495939) ; Qobuz rend aussi deux « Moonchild » à la recherche.
//  - tune-web-client#2829 : « show like albums next to each other with a
//    platform and resolution tag on them ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { estDeLArtiste, partagerDiscographie } from '../discographieConnexes';
import { albumsDeStreamingPourArtiste, candidatsHomonymes } from '../albumsArtisteStreaming';
import { fusionnerDiscographie, resolutionDe, versionsEntree } from '../discographieCommune';
import type { Album } from '../types';
import type { AlbumsDeService } from '../albumsArtisteStreaming';

const al = (o: Record<string, unknown>) => o as unknown as Album;

describe('#8478 — l’identifiant du service décide, pas le nom', () => {
  const QOBUZ: AlbumsDeService = {
    service: 'qobuz',
    artistId: '790734',
    albums: [
      al({ source_id: 'a', title: 'Little Ghost', artist_id: '790734', artist_name: 'Moonchild', source: 'qobuz' }),
      al({ source_id: 'b', title: 'Friends Are For', artist_id: '33495939', artist_name: 'Moonchild', source: 'qobuz' }),
    ],
  };

  it('🔴 l’album d’un homonyme (autre identifiant, même nom) quitte la discographie', () => {
    const p = partagerDiscographie([QOBUZ], 'Moonchild');
    expect(p.propres.flatMap((s) => s.albums.map((a) => a.title))).toEqual(['Little Ghost']);
    expect(p.connexes.flatMap((s) => s.albums.map((a) => a.title))).toEqual(['Friends Are For']);
  });

  it('sans identifiant d’un côté, le nom départage encore', () => {
    expect(estDeLArtiste(al({ artist_name: 'Moonchild' }), '790734', 'Moonchild')).toBe(true);
    expect(estDeLArtiste(al({ artist_id: '1', artist_name: 'Moonchild' }), null, 'Moonchild')).toBe(true);
  });

  it('les homonymes exacts sont tous rendus, dans l’ordre du service', () => {
    expect(candidatsHomonymes([
      { id: '790734', name: 'Moonchild' }, { id: '2762282', name: 'Moonchild Sanelly' }, { id: '33495939', name: 'Moonchild' },
    ], 'Moonchild')).toEqual(['790734', '33495939']);
  });

  it('🔴 un autre service : l’homonyme qui partage des titres avec la fiche l’emporte sur le premier', async () => {
    const demandes: string[] = [];
    const sections = await albumsDeStreamingPourArtiste('Cannons', ['spotify'], {
      resoudreArtiste: async () => [{ id: 'autre', name: 'Cannons' }, { id: 'bon', name: 'CANNONS' }],
      albumsDeLArtiste: async (_s, id) => {
        demandes.push(id);
        return id === 'bon'
          ? [al({ title: 'Fever Dream', artist_id: 'bon', artist_name: 'Cannons' }), al({ title: 'Shadows', artist_id: 'bon', artist_name: 'Cannons' })]
          : [al({ title: 'Maraloka', artist_id: 'autre', artist_name: 'Cannons' })];
      },
    }, ['Fever Dream', 'Heartbeat Highway']);
    expect(demandes.sort()).toEqual(['autre', 'bon']);
    expect(sections.map((s) => s.artistId)).toEqual(['bon']);
    expect(sections[0].albums.map((a) => a.title)).toEqual(['Fever Dream', 'Shadows']);
  });

  it('sans titre connu, rien ne change : le premier homonyme, une seule discographie lue', async () => {
    const demandes: string[] = [];
    const sections = await albumsDeStreamingPourArtiste('Cannons', ['spotify'], {
      resoudreArtiste: async () => [{ id: 'autre', name: 'Cannons' }, { id: 'bon', name: 'Cannons' }],
      albumsDeLArtiste: async (_s, id) => { demandes.push(id); return [al({ title: 'X' })]; },
    });
    expect(demandes).toEqual(['autre']);
    expect(sections.map((s) => s.artistId)).toEqual(['autre']);
  });
});

describe('#2829 — une vignette, une étiquette par plateforme avec sa résolution', () => {
  const QOBUZ: AlbumsDeService = {
    service: 'qobuz', artistId: 'q',
    albums: [al({ source_id: 'q1', title: 'Little Ghost', artist_id: 'q', artist_name: 'Moonchild', year: 2019, source: 'qobuz',
      quality: { codec: 'FLAC', sample_rate: 96000, bit_depth: 24 } })],
  };
  const SPOTIFY: AlbumsDeService = {
    service: 'spotify', artistId: 's',
    albums: [al({ source_id: 's1', title: 'Little Ghost', artist_id: 's', artist_name: 'Moonchild', year: 2019, source: 'spotify' })],
  };

  it('la résolution se lit sous ses deux formes, et ne s’invente pas', () => {
    expect(resolutionDe({ source: 'qobuz', album: al({ quality: { codec: 'FLAC', sample_rate: 44100, bit_depth: 16 } }) })).toBe('16/44.1');
    expect(resolutionDe({ source: 'local', album: al({ format: 'flac', sample_rate: 192000, bit_depth: 24 }) })).toBe('24/192');
    expect(resolutionDe({ source: 'local', album: al({ format: 'dsf', sample_rate: 2822400, bit_depth: 1 }) })).toBe('DSD');
    expect(resolutionDe({ source: 'spotify', album: al({}) })).toBeNull();
  });

  it('les étiquettes suivent les sources de la vignette', () => {
    const [e] = fusionnerDiscographie([], [QOBUZ, SPOTIFY]);
    expect(versionsEntree(e)).toEqual([
      { source: 'qobuz', qualite: 'hires', resolution: '24/96' },
      { source: 'spotify', qualite: null, resolution: null },
    ]);
  });

  let hote: HTMLDivElement | null = null;
  let monte: ReturnType<typeof mount> | null = null;
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  it('🔴 la grille montre UNE vignette, avec « QOBUZ 24/96 » et « SPOTIFY », hors de la pochette', () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(DiscographieCommune, {
      target: hote,
      props: { onOuvrir: () => {}, onLire: () => {}, locaux: [], services: [QOBUZ, SPOTIFY], nomArtiste: 'Moonchild' } as any,
    });
    flushSync();
    const cartes = [...hote.querySelectorAll('[data-section="discographie"] .carte')];
    expect(cartes.length).toBe(1);
    const versions = [...cartes[0].querySelectorAll('.versions .version')].map((v) => (v.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(versions).toEqual(['QOBUZ 24/96', 'SPOTIFY']);
    expect(cartes[0].querySelector('.cv .service-badge'), 'plus de pastille sur la pochette').toBeNull();
  });
});
