// @vitest-environment jsdom
//
// renesenses/tune-server-rust#4651 — FabienM, fil forum 1875 (v0.9.161) :
// « la liste des albums affichés est trop large ! Elle présente également les
// versions d'autres artistes » — Agnes Obel, « Pass Them By » de Jessie Black.
//
// Les données sont celles que `/streaming/qobuz/artists/551325/albums` et
// `/streaming/tidal/artists/3694795/albums` rendent sur le .18 (22/09/2026),
// réduites aux champs lus. YouTube rend `artist_id: null`, `artist_name: ""`.
//
// La garde MONTE la grille : un test de la seule fonction de tri prouverait la
// règle, pas que l'écran l'applique.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { estDeLArtiste, partagerDiscographie } from '../discographieConnexes';
import type { Album } from '../types';
import type { AlbumsDeService } from '../albumsArtisteStreaming';

const al = (o: Record<string, unknown>) => o as unknown as Album;

const QOBUZ: AlbumsDeService = {
  service: 'qobuz',
  artistId: '551325',
  albums: [
    al({ source_id: 'q1', title: 'Philharmonics', artist_id: '551325', artist_name: 'Agnes Obel', year: 2010, source: 'qobuz' }),
    al({ source_id: 'q2', title: 'Citizen of Glass', artist_id: '551325', artist_name: 'Agnes Obel', year: 2016, source: 'qobuz' }),
    al({ source_id: 'q3', title: 'The Curse', artist_id: '551325', artist_name: 'Agnes Obel', year: 2016, source: 'qobuz' }),
    al({ source_id: 'r557plnp1kykc', title: 'Pass Them By', artist_id: '5859937', artist_name: 'Jessie Black', year: 2026, source: 'qobuz' }),
    al({ source_id: 'q5', title: 'Trojan', artist_id: '35272429', artist_name: 'Plug Pirate', year: 2026, source: 'qobuz' }),
    al({ source_id: 'q6', title: 'The Curse', artist_id: '22304889', artist_name: 'Echoes of Maya', year: 2021, source: 'qobuz' }),
  ],
};
const TIDAL: AlbumsDeService = {
  service: 'tidal',
  artistId: '3694795',
  albums: [
    al({ source_id: 't1', title: 'Philharmonics', artist_id: '3694795', artist_name: 'Agnes Obel', source: 'tidal' }),
    al({ source_id: 't2', title: 'Foe (Original Motion Picture Score)', artist_id: '9436614', artist_name: 'Park Jiha', source: 'tidal' }),
  ],
};
const YOUTUBE: AlbumsDeService = {
  service: 'youtube',
  artistId: 'UCaHeZtCBP3Jh8v1cSq6siNw',
  albums: [al({ source_id: 'y1', title: 'Myopia', artist_id: null, artist_name: '', source: 'youtube' })],
};

describe('#4651 — la règle', () => {
  it('l’identifiant résolu retient l’album, un autre artiste le range à part', () => {
    const p = partagerDiscographie([QOBUZ, TIDAL, YOUTUBE], 'Agnes Obel');
    const titres = (l: AlbumsDeService[]) => l.flatMap((s) => s.albums.map((a) => `${s.service}:${a.title}`));
    expect(titres(p.propres)).toEqual([
      'qobuz:Philharmonics', 'qobuz:Citizen of Glass', 'qobuz:The Curse',
      'tidal:Philharmonics', 'youtube:Myopia',
    ]);
    expect(titres(p.connexes)).toEqual([
      'qobuz:Pass Them By', 'qobuz:Trojan', 'qobuz:The Curse', 'tidal:Foe (Original Motion Picture Score)',
    ]);
  });

  it('un homonyme sous un autre identifiant reste dans la discographie', () => {
    expect(estDeLArtiste(al({ artist_id: '999', artist_name: 'AGNES OBEL' }), '551325', 'Agnes Obel')).toBe(true);
  });

  it('sans identifiant résolu, le nom seul décide', () => {
    expect(estDeLArtiste(al({ artist_id: '1', artist_name: 'Agnes Obel' }), undefined, 'Agnes Obel')).toBe(true);
    expect(estDeLArtiste(al({ artist_id: '1', artist_name: 'Jessie Black' }), undefined, 'Agnes Obel')).toBe(false);
  });
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

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, { target: hote, props: { onOuvrir: () => {}, onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

const titresDe = (racine: Element | null) =>
  [...(racine?.querySelectorAll('.ct') ?? [])].map((n) => n.textContent?.trim());

describe('#4651 — la fiche artiste', () => {
  it('la grille principale ne montre plus « Pass Them By » ; « Connexes » le montre', () => {
    const h = poser({ locaux: [], services: [QOBUZ, TIDAL, YOUTUBE], nomArtiste: 'Agnes Obel' });
    const principale = h.querySelector('.disco > .gr');
    const connexes = h.querySelector('[data-section="connexes"]');
    expect(titresDe(principale)).not.toContain('Pass Them By');
    expect(titresDe(principale)).not.toContain('Trojan');
    expect(titresDe(principale)).toEqual(expect.arrayContaining(['Philharmonics', 'Citizen of Glass', 'The Curse', 'Myopia']));
    expect(connexes, 'la section « Autres / Connexes » n’est pas rendue').not.toBeNull();
    expect(titresDe(connexes)).toEqual(expect.arrayContaining(['Pass Them By', 'Trojan', 'The Curse']));
  });

  it('le compte de la barre ne parle que de la discographie de l’artiste', () => {
    let total = -1;
    poser({ locaux: [], services: [QOBUZ], nomArtiste: 'Agnes Obel', onComptesProvenance: (c: { total: number }) => (total = c.total) });
    flushSync();
    expect(total).toBe(3);
  });

  it('sans intrus, pas de section « Connexes »', () => {
    const h = poser({ locaux: [], services: [YOUTUBE], nomArtiste: 'Agnes Obel' });
    expect(h.querySelector('[data-section="connexes"]')).toBeNull();
  });
});
