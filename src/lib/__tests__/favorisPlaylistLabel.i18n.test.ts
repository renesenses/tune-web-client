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
 * Les deux nouveaux onglets de l'écran Favoris — Playlists et Labels (#2442,
 * FabienM fil 1557) — doivent être nommés dans les ONZE langues.
 *
 * Un onglet sans traduction ne s'affiche pas vide : il affiche sa CLÉ. Un
 * utilisateur hongrois verrait littéralement « favorites.playlists » à côté de
 * « Előadók ». C'est arrivé assez souvent pour que la règle soit posée : une
 * clé neuve part avec ses onze langues, ou elle ne part pas.
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

const CLES = ['favorites.playlists', 'favorites.labels'] as const;

describe('libellés des onglets Playlists et Labels des Favoris', () => {
  it('les onze langues sont couvertes par ce test', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [nom, dict] of LANGUES) {
    for (const cle of CLES) {
      it(`${nom} traduit ${cle}`, () => {
        const valeur = dict[cle];
        expect(valeur, `${cle} manque en ${nom}`).toBeDefined();
        expect(String(valeur).trim().length).toBeGreaterThan(0);
        // Une clé recopiée en guise de traduction est un oubli déguisé.
        expect(valeur).not.toBe(cle);
      });
    }
  }

  it('les deux onglets ne portent pas le même libellé dans une langue donnée', () => {
    for (const [nom, dict] of LANGUES) {
      expect(
        dict['favorites.playlists'],
        `Playlists et Labels sont indiscernables en ${nom}`,
      ).not.toBe(dict['favorites.labels']);
    }
  });
});
