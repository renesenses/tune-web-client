// tune-server-rust#6411 (fil 2294) — un coffret dont chaque disque porte sa
// jaquette : Oxygen prend la pochette MAJORITAIRE, comme le serveur (#5454),
// et l'onglet Coffrets dit qu'un album à trois disques nommés en est un.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pochetteMajoritaire } from '../pochetteMajoritaire';

const piste = (disque: number, cover: string | null) => ({ disc_number: disque, cover_path: cover });

describe('la pochette majoritaire', () => {
  it('le cas du fil : six disques, la jaquette du disque qui a le plus de pistes', () => {
    const pistes = [
      ...Array.from({ length: 9 }, () => piste(1, '/c/dire-straits.jpg')),
      ...Array.from({ length: 9 }, () => piste(2, '/c/communique.jpg')),
      ...Array.from({ length: 7 }, () => piste(3, '/c/making-movies.jpg')),
      ...Array.from({ length: 5 }, () => piste(4, '/c/love-over-gold.jpg')),
      ...Array.from({ length: 9 }, () => piste(5, '/c/brothers.jpg')),
      ...Array.from({ length: 12 }, () => piste(6, '/c/on-every-street.jpg')),
    ];
    expect(pochetteMajoritaire(pistes)).toBe('/c/on-every-street.jpg');
  });
  it('à égalité la première rencontrée ; sans pochette, null', () => {
    expect(pochetteMajoritaire([piste(1, '/a.jpg'), piste(2, '/b.jpg')])).toBe('/a.jpg');
    expect(pochetteMajoritaire([piste(1, null), piste(1, '  ')])).toBeNull();
    expect(pochetteMajoritaire([])).toBeNull();
  });
});

describe('les écrans', () => {
  it('Oxygen remplace la pochette de la première piste par la majoritaire', () => {
    const src = readFileSync('src/components/v2-heritage/OxygenView.svelte', 'utf8');
    expect(src).toContain('for (const g of m.values()) g.cover = pochetteMajoritaire(g.tracks) ?? g.cover;');
  });
  it('la règle de l’onglet Coffrets nomme les trois disques, dans les treize langues', () => {
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    expect(fr).toContain("albums d\\'au moins trois disques nommés chacun autrement");
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'vi', 'el', 'zh']) {
      const s = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      const ligne = s.split('\n').find((x) => /['"]library\.boxSetsRule['"]/.test(x)) ?? '';
      expect(ligne, l).toMatch(/3|three|drei|tres|tre|három|trois|trei|ba|τρι|三|세|3/);
    }
  });
});
