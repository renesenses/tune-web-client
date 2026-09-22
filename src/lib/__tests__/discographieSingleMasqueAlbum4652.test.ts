// renesenses/tune-server-rust#4652 — FabienM, fil forum 1875 (21/09/2026) :
// « le nouvel album de Neil Young "Second song" apparaît bien mais […] si je
// clique sur la vignette j'ai uniquement 1 titre ».
//
// Mesuré sur le .18 : Qobuz rend le single « Second Song » (1 titre, rang 61)
// AVANT l'album (7 titres, rang 89), sous le même titre. La fusion gardait le
// premier arrivé : l'album à 7 titres n'était atteignable nulle part.
import { describe, expect, it } from 'vitest';
import { fusionnerDiscographie } from '../discographieCommune';
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
  });

  it('l’album arrive en premier : le single ne le remplace pas', () => {
    const [e] = fusionnerDiscographie([], [{ service: 'qobuz', albums: [album, single] }]);
    expect(e.principal.album.source_id).toBe('x5ary4vr3rntv');
    expect(e.exemplaires).toHaveLength(1);
  });

  it('sans nombre de titres des deux côtés, le premier arrivé reste', () => {
    const a = al({ source_id: 'Q1', title: 'Harvest', source: 'qobuz' });
    const b = al({ source_id: 'Q2', title: 'Harvest', source: 'qobuz' });
    const [e] = fusionnerDiscographie([], [{ service: 'qobuz', albums: [a, b] }]);
    expect(e.principal.album.source_id).toBe('Q1');
  });

  it('la bibliothèque reste principale, quel que soit le nombre de titres du service', () => {
    const local = al({ id: 3, title: 'Second Song', track_count: 1 });
    const [e] = fusionnerDiscographie([local], [{ service: 'qobuz', albums: [single, album] }]);
    expect(e.principal.album.id).toBe(3);
    expect(e.exemplaires[1].album.source_id).toBe('x5ary4vr3rntv');
  });
});
