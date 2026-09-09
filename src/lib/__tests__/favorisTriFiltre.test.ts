/**
 * Le tri par date mélange DEUX unités, et l'erreur ne se voit pas.
 *
 * Les favoris de service portent `created_at` (ISO), ceux de la bibliothèque
 * `added_at` en SECONDES. Comparés bruts, 1,7e12 contre 1,7e9 : tout le
 * streaming passe devant, chaque groupe reste bien ordonné en interne, et le
 * tri a l'air de marcher. C'est le cas que ces tests tiennent.
 *
 * Valeurs mesurees sur le .18 le 04/09/2026.
 */
import { describe, it, expect } from 'vitest';
import {
  sourceDe, sourcesPresentes, dateDe, titreDe, trierEtFiltrer, SOURCE_BIBLIOTHEQUE,
} from '../favorisTriFiltre';

const qobuz = { id: null, title: 'Midnight Junction', source: 'qobuz', created_at: '2026-08-24T15:08:44Z' };
const tidal = { id: null, title: 'Live with the Norwegian Radio Orchestra', source: 'tidal', created_at: '2026-09-03T21:59:50Z' };
// added_at en secondes : 1418673220 = 15 decembre 2014.
const locale = { id: 259, title: 'Il', source: null, added_at: 1418673220 };

describe('sourceDe', () => {
  it('c’est l’identifiant qui tranche, pas le champ source', () => {
    expect(sourceDe(qobuz)).toBe('qobuz');
    expect(sourceDe(locale)).toBe(SOURCE_BIBLIOTHEQUE);
    // Un album de la bibliotheque porte parfois une `source` (le depot d'ou il
    // vient) : elle ne doit pas le faire passer pour un favori de service.
    expect(sourceDe({ id: 7, title: 'x', source: 'qobuz' })).toBe(SOURCE_BIBLIOTHEQUE);
  });
});

describe('sourcesPresentes', () => {
  it('ne rend que ce qui est là, bibliothèque en tête', () => {
    expect(sourcesPresentes([tidal, locale, qobuz])).toEqual([SOURCE_BIBLIOTHEQUE, 'qobuz', 'tidal']);
  });

  it('n’invente aucun service absent', () => {
    // Une puce « Tidal » sur un ecran sans favori Tidal promet un filtre vide.
    expect(sourcesPresentes([qobuz])).toEqual(['qobuz']);
    expect(sourcesPresentes([])).toEqual([]);
  });
});

describe('dateDe', () => {
  it('lit l’ISO d’un favori de service', () => {
    expect(dateDe(qobuz)).toBe(Date.parse('2026-08-24T15:08:44Z'));
  });

  it('convertit les SECONDES de la bibliothèque en millisecondes', () => {
    expect(dateDe(locale)).toBe(1418673220 * 1000);
  });

  it('laisse intacte une valeur déjà en millisecondes', () => {
    expect(dateDe({ id: 1, title: 'x', added_at: 1_700_000_000_000 })).toBe(1_700_000_000_000);
  });

  it('rend null sans date exploitable', () => {
    expect(dateDe({ id: 1, title: 'x' })).toBeNull();
    expect(dateDe({ id: 1, title: 'x', added_at: 0 })).toBeNull();
    expect(dateDe({ id: null, title: 'x', created_at: 'pas une date' })).toBeNull();
  });
});

describe('trierEtFiltrer — par date', () => {
  const tous = [locale, qobuz, tidal];

  it('range bibliothèque et services sur la MÊME échelle', () => {
    // Sans la conversion, `locale` (1,4e9 brut) serait dernier au lieu de
    // premier en « plus ancien », et le bogue passerait pour un tri correct.
    expect(trierEtFiltrer(tous, null, 'ancien').map(titreDe)).toEqual([
      'Il', 'Midnight Junction', 'Live with the Norwegian Radio Orchestra',
    ]);
    expect(trierEtFiltrer(tous, null, 'recent').map(titreDe)).toEqual([
      'Live with the Norwegian Radio Orchestra', 'Midnight Junction', 'Il',
    ]);
  });

  it('renvoie les objets sans date en FIN, dans les deux sens', () => {
    const sansDate = { id: 9, title: 'Aucune date' };
    for (const tri of ['recent', 'ancien'] as const) {
      expect(trierEtFiltrer([sansDate, qobuz], null, tri).map(titreDe).at(-1)).toBe('Aucune date');
    }
  });
});

describe('trierEtFiltrer — alphabétique', () => {
  const accents = [{ id: 3, title: 'Zébre' }, { id: 1, title: 'Édith' }, { id: 2, title: 'Avion' }];

  it('range les accents à leur lettre', () => {
    // Sans `localeCompare`, « Édith » partirait apres « Zebre ».
    expect(trierEtFiltrer(accents, null, 'alpha').map(titreDe)).toEqual(['Avion', 'Édith', 'Zébre']);
  });

  it('trie les nombres comme des nombres', () => {
    const n = [{ id: 1, title: '10 Songs' }, { id: 2, title: '2 Songs' }];
    expect(trierEtFiltrer(n, null, 'alpha').map(titreDe)).toEqual(['2 Songs', '10 Songs']);
  });

  it('l’inverse est bien l’inverse', () => {
    expect(trierEtFiltrer(accents, null, 'alphaInverse').map(titreDe)).toEqual(['Zébre', 'Édith', 'Avion']);
  });

  it('trie un artiste sur son nom', () => {
    const a = [{ id: null, name: 'Ravel', source: 'qobuz' }, { id: null, name: 'Bach', source: 'qobuz' }];
    expect(trierEtFiltrer(a, null, 'alpha').map(titreDe)).toEqual(['Bach', 'Ravel']);
  });
});

describe('trierEtFiltrer — filtre', () => {
  const tous = [locale, qobuz, tidal];

  it('ne garde que la source demandée', () => {
    expect(trierEtFiltrer(tous, 'qobuz', 'alpha').map(titreDe)).toEqual(['Midnight Junction']);
    expect(trierEtFiltrer(tous, SOURCE_BIBLIOTHEQUE, 'alpha').map(titreDe)).toEqual(['Il']);
  });

  it('null veut dire toutes', () => {
    expect(trierEtFiltrer(tous, null, 'alpha')).toHaveLength(3);
  });

  it('ne modifie pas la liste reçue', () => {
    // `Array.prototype.sort` trie EN PLACE : sans la copie, filtrer l'ecran
    // reordonnerait l'etat d'ou viennent les grilles.
    const avant = [...tous];
    trierEtFiltrer(tous, null, 'alphaInverse');
    expect(tous).toEqual(avant);
  });
});
