// renesenses/tune-server-rust#4652 — FabienM, fil forum 1875 (21/09/2026) :
// « le nouvel album de Neil Young "Second song" apparaît bien mais […] si je
// clique sur la vignette j'ai uniquement 1 titre ».
//
// Mesuré sur le .18 : Qobuz rend le single « Second Song » (1 titre, rang 61)
// AVANT l'album (7 titres, rang 89), sous le même titre. La fusion gardait le
// premier arrivé : l'album à 7 titres n'était atteignable nulle part.
//
// tune-server-rust#8662 (13/11/2026) : la vignette reste UNE, ouverte sur
// l'album ; l'exemplaire écarté n'est plus jeté, il reste une édition
// (`editions`) qu'on ouvre depuis le badge « N éditions ».
import { describe, expect, it } from 'vitest';
import { editionsCachees, fusionnerDiscographie } from '../discographieCommune';
import type { Album } from '../types';

const al = (o: Record<string, unknown>) => o as unknown as Album;

const single = al({ source_id: 'atua1kxxk4tis', title: 'Second Song', source: 'qobuz', track_count: 1 });
const album = al({ source_id: 'x5ary4vr3rntv', title: 'Second Song', source: 'qobuz', track_count: 7 });
const yt = al({ source_id: 'YT1', title: 'Second Song', source: 'youtube', track_count: 7 });

describe('#4652 — un single ne masque plus l’album du même titre', () => {
  it('le single arrive en premier : la vignette ouvre l’album à 7 titres', () => {
    const [e, ...reste] = fusionnerDiscographie([], [
      { service: 'qobuz', albums: [single, album] },
      { service: 'youtube', albums: [yt] },
    ]);
    expect(reste).toHaveLength(0);
    expect(e.principal.album.source_id).toBe('x5ary4vr3rntv');
    expect(e.sources).toEqual(['qobuz', 'youtube']);
    // Pas de doublon visible : une étiquette par plateforme, un exemplaire par source.
    expect(e.exemplaires.map((x) => x.album.source_id)).toEqual(['x5ary4vr3rntv', 'YT1']);
    // #8662 — le single n'est pas perdu : il est une édition de la vignette.
    expect(e.editions.map((x) => x.album.source_id)).toEqual(['x5ary4vr3rntv', 'YT1', 'atua1kxxk4tis']);
    expect(editionsCachees(e)).toBe(true);
  });

  it('l’album arrive en premier : le single ne le remplace pas', () => {
    const entrees = fusionnerDiscographie([], [{ service: 'qobuz', albums: [album, single] }]);
    expect(entrees).toHaveLength(1);
    const [e] = entrees;
    expect(e.principal.album.source_id).toBe('x5ary4vr3rntv');
    expect(e.exemplaires).toHaveLength(1);
    expect(e.editions.map((x) => x.album.source_id)).toEqual(['x5ary4vr3rntv', 'atua1kxxk4tis']);
  });

  it('sans nombre de titres des deux côtés, le premier arrivé reste', () => {
    const a = al({ source_id: 'Q1', title: 'Harvest', source: 'qobuz' });
    const b = al({ source_id: 'Q2', title: 'Harvest', source: 'qobuz' });
    const entrees = fusionnerDiscographie([], [{ service: 'qobuz', albums: [a, b] }]);
    expect(entrees).toHaveLength(1);
    const [e] = entrees;
    expect(e.principal.album.source_id).toBe('Q1');
    expect(e.exemplaires).toHaveLength(1);
    expect(e.editions.map((x) => x.album.source_id)).toEqual(['Q1', 'Q2']);
  });

  it('la bibliothèque reste principale, quel que soit le nombre de titres du service', () => {
    const local = al({ id: 3, title: 'Second Song', track_count: 1 });
    const [e] = fusionnerDiscographie([local], [{ service: 'qobuz', albums: [single, album] }]);
    expect(e.principal.album.id).toBe(3);
    expect(e.exemplaires[1].album.source_id).toBe('x5ary4vr3rntv');
  });
});
