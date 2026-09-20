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

// ---------------------------------------------------------------------------
// La date LOCALE prime — renesenses/tune-web-client#1060
// ---------------------------------------------------------------------------

/**
 * 🔴 Fabien, fils forum 1812 puis 1839, mot pour mot : « Menu Favoris - Qobuz:
 * tri par ajout récent ne fonctionne pas. C'est l'ordre alphabétique qui est
 * pris en compte. »
 *
 * Le tri n'est pas en cause — c'est la DONNÉE. Mesure du 19/09/2026 sur le
 * serveur de Bertrand : vingt et un favoris Qobuz, vingt et un `created_at`
 * distincts, tous dans une fenêtre de SEIZE SECONDES (2026-09-16T08:11:50Z …
 * 08:12:06Z). `created_at` est la date du SERVICE : l'instant où une recopie a
 * (re)créé le favori chez Qobuz, pas celui où l'auditeur a aimé le morceau.
 * Trier là-dessus rend l'ordre d'une boucle, et des dates égales retombent sur
 * `comparerTitres` — l'ordre alphabétique qu'il décrit.
 *
 * Le serveur pose désormais `first_seen_at` : la date où TUNE a vu le favori
 * pour la première fois, jamais réécrite par une resynchronisation
 * (renesenses/tune-server-rust, lot `batch/favoris-date-locale-20260920`). Le
 * tri la PRÉFÈRE quand elle est là, et retombe sur celle du service sinon —
 * un serveur plus ancien ne la rend pas, et l'écran doit continuer à ranger
 * comme avant.
 */
const vuLe = (title: string, first_seen_at: string | null, created_at: string) => ({
  id: null, title, source: 'qobuz', first_seen_at, created_at,
});

describe('dateDe — la date locale prime sur celle du service (#1060)', () => {
  it('lit `first_seen_at` quand le serveur la donne', () => {
    expect(dateDe(vuLe('x', '2026-03-01T10:00:00Z', '2026-09-16T08:11:50Z')))
      .toBe(Date.parse('2026-03-01T10:00:00Z'));
  });

  it('retombe sur `created_at` quand elle est absente, nulle ou illisible', () => {
    const service = Date.parse('2026-09-16T08:11:50Z');
    expect(dateDe({ id: null, title: 'x', created_at: '2026-09-16T08:11:50Z' })).toBe(service);
    expect(dateDe(vuLe('x', null, '2026-09-16T08:11:50Z'))).toBe(service);
    expect(dateDe({ ...vuLe('x', null, '2026-09-16T08:11:50Z'), first_seen_at: 'pas une date' }))
      .toBe(service);
  });

  it('ne change rien à un objet de bibliothèque', () => {
    expect(dateDe(locale)).toBe(1418673220 * 1000);
  });
});

describe('trierEtFiltrer — « Ajout récent » (#1060)', () => {
  // Le cas de Fabien, réduit à trois : le service les a tous recréés dans la
  // même seconde, Tune les a vus à des mois d'écart.
  const recopies = [
    vuLe('Aaa, vu en septembre', '2026-09-01T09:00:00Z', '2026-09-16T08:11:50Z'),
    vuLe('Bbb, vu en janvier', '2026-01-01T09:00:00Z', '2026-09-16T08:11:50Z'),
    vuLe('Ccc, vu en juin', '2026-06-01T09:00:00Z', '2026-09-16T08:11:50Z'),
  ];

  it('range sur la date locale, pas sur l’alphabet', () => {
    // Sans elle, les trois dates de service sont ÉGALES et le départage est
    // alphabétique : Aaa, Bbb, Ccc — exactement ce que Fabien voit.
    expect(trierEtFiltrer(recopies, null, 'recent').map(titreDe)).toEqual([
      'Aaa, vu en septembre', 'Ccc, vu en juin', 'Bbb, vu en janvier',
    ]);
    expect(trierEtFiltrer(recopies, null, 'ancien').map(titreDe)).toEqual([
      'Bbb, vu en janvier', 'Ccc, vu en juin', 'Aaa, vu en septembre',
    ]);
  });

  it('un serveur qui ne rend pas la date locale range comme avant', () => {
    const avant = [
      { id: null, title: 'Zzz', source: 'qobuz', created_at: '2026-09-16T08:12:06Z' },
      { id: null, title: 'Aaa', source: 'qobuz', created_at: '2026-09-16T08:11:50Z' },
    ];
    expect(trierEtFiltrer(avant, null, 'recent').map(titreDe)).toEqual(['Zzz', 'Aaa']);
  });

  it('mélange les deux : chaque favori est rangé sur la date qu’il porte', () => {
    const melange = [
      vuLe('Locale', '2026-05-01T09:00:00Z', '2026-09-16T08:11:50Z'),
      { id: null, title: 'Service seul', source: 'tidal', created_at: '2026-07-01T09:00:00Z' },
    ];
    expect(trierEtFiltrer(melange, null, 'recent').map(titreDe))
      .toEqual(['Service seul', 'Locale']);
  });
});
