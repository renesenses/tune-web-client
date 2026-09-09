import { describe, it, expect } from 'vitest';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

type Dict = Record<string, string | undefined>;

/**
 * La pastille « Par défaut » du tri des favoris (#2001) doit exister dans les
 * ONZE langues.
 *
 * Elle est neuve parce que `library.sortAddedDate` — « Date d'ajout » — servait
 * jusqu'ici à nommer la clé `defaut`, qui ne trie RIEN : elle rend la liste
 * telle que le serveur l'a donnée. Ce n'est pas la même chose, et la confusion
 * est précisément ce qui a laissé Tades sans réponse : il cherchait l'ordre
 * chronologique inverse, la pastille lui promettait une date, et le bouton de
 * sens n'apparaissait pas.
 *
 * Une clé absente ne s'affiche pas vide : elle s'affiche EN CLAIR.
 */
const LANGUES: Array<[string, Dict]> = [
  ['fr', fr as Dict],
  ['en', en as Dict],
  ['de', de as Dict],
  ['es', es as Dict],
  ['it', it_ as Dict],
  ['ja', ja as Dict],
  ['ko', ko as Dict],
  ['ro', ro as Dict],
  ['sv', sv as Dict],
  ['zh', zh as Dict],
  ['hu', hu as Dict],
];

const CLES = ['favorites.sortDefault', 'favorites.sortBy', 'library.sortAddedDate'] as const;

describe('libellés du tri des favoris', () => {
  it('les onze langues sont couvertes par ce test', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [nom, dict] of LANGUES) {
    for (const cle of CLES) {
      it(`${nom} traduit ${cle}`, () => {
        const valeur = dict[cle];
        expect(valeur, `${cle} manque en ${nom}`).toBeDefined();
        expect(String(valeur).trim().length).toBeGreaterThan(0);
        expect(valeur).not.toBe(cle);
      });
    }
  }

  it('« Par défaut » et « Date d\'ajout » ne se confondent dans aucune langue', () => {
    // Deux pastilles voisines portant le même mot ne se distinguent pas ; c'est
    // le défaut d'interface que ce correctif répare, pas celui qu'il installe.
    for (const [nom, dict] of LANGUES) {
      expect(
        dict['favorites.sortDefault'],
        `« Par défaut » et « Date d'ajout » sont indiscernables en ${nom}`,
      ).not.toBe(dict['library.sortAddedDate']);
    }
  });

  it('le français porte ses accents', () => {
    expect(fr['favorites.sortDefault']).toBe('Par défaut');
  });
});
