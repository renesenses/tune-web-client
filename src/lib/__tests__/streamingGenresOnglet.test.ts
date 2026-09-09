import { describe, expect, it } from 'vitest';
import { aUnOngletGenres, normaliserGenres, ouvertureGenre, sousGenresUtiles } from '../streamingGenres';

/**
 * Onglet « Genres » de la vue Streaming du nouveau client.
 *
 * Trois faits sont protégés ici, et pas un code HTTP :
 *
 *  1. Un service dont `/genres` rend une liste vide n'obtient PAS d'onglet.
 *     C'est le motif « le 200 pour rien » : la route répond, correctement, et
 *     ne sert rien. Un onglet ouvert dessus promet du contenu et livre une page
 *     blanche — exactement ce que la doctrine en tête de `StreamingV2.svelte`
 *     interdit déjà pour les services non connectés.
 *
 *  2. Un genre qui n'annonce pas d'enfants ouvre DIRECTEMENT ses albums.
 *
 *  3. Un genre qui en annonce ouvre son second niveau — et c'est `has_children`
 *     qui décide, jamais une liste de services écrite en dur. Qobuz sert
 *     `parent_id`, Tidal l'ignore ; figer cette différence dans le client, ce
 *     serait la rendre définitive.
 *
 * Les gardes de l'ÉCRAN sont à côté (`streamingGenresEcran.test.ts`) : elles ne
 * doivent rien importer d'ici, sans quoi l'absence du module les emporterait au
 * lieu de les faire échouer sur ce qu'elles affirment. Le TÉMOIN de la
 * contre-épreuve est dans `streamingGenresTemoin.test.ts`, vert des deux côtés.
 */
describe('un service sans genre n’obtient pas d’onglet Genres', () => {
  it('une liste vide — le « 200 pour rien » — ne donne pas d’onglet', () => {
    expect(aUnOngletGenres(normaliserGenres([]))).toBe(false);
  });

  it('une réponse absente ou malformée ne donne pas d’onglet non plus', () => {
    expect(aUnOngletGenres(normaliserGenres(null))).toBe(false);
    expect(aUnOngletGenres(normaliserGenres(undefined))).toBe(false);
    expect(aUnOngletGenres(normaliserGenres({ error: 'boom' }))).toBe(false);
  });

  it('des entrées sans id ni nom ne sont pas de la matière : toujours pas d’onglet', () => {
    // Une liste de dix objets vides répond 200 et ne vaut pas mieux que `[]` :
    // aucun de ces genres n'est ni affichable ni navigable.
    const brut = [{ id: null, name: '' }, { name: 'Pop' }, { id: 'x', name: '   ' }];
    expect(normaliserGenres(brut)).toEqual([]);
    expect(aUnOngletGenres(normaliserGenres(brut))).toBe(false);
  });

  it('un seul genre exploitable suffit à ouvrir l’onglet', () => {
    const g = normaliserGenres([{ id: '112', name: 'Rock', has_children: false }]);
    expect(g).toHaveLength(1);
    expect(aUnOngletGenres(g)).toBe(true);
  });
});

describe('ce qu’ouvre un clic sur un genre', () => {
  it('has_children: false ouvre directement ses albums', () => {
    const [g] = normaliserGenres([{ id: '112', name: 'Rock', has_children: false }]);
    expect(g.has_children).toBe(false);
    expect(ouvertureGenre(g)).toBe('albums');
  });

  it('has_children absent vaut « pas d’enfants » : albums, là encore', () => {
    // Tidal sert une liste plate et n'annonce rien. L'absence d'annonce ne doit
    // jamais devenir une promesse de second niveau.
    const [g] = normaliserGenres([{ id: 'Pop', name: 'Pop' }]);
    expect(g.has_children).toBe(false);
    expect(ouvertureGenre(g)).toBe('albums');
  });

  it('has_children: true ouvre ses sous-genres', () => {
    const [g] = normaliserGenres([{ id: '64', name: 'Jazz', has_children: true }]);
    expect(g.has_children).toBe(true);
    expect(ouvertureGenre(g)).toBe('sous-genres');
  });

  it('un « true » textuel n’est pas un true : on ne descend pas à l’aveugle', () => {
    const [g] = normaliserGenres([{ id: '64', name: 'Jazz', has_children: 'true' }]);
    expect(ouvertureGenre(g)).toBe('albums');
  });
});

describe('un second niveau qui n’en est pas un', () => {
  // Mesuré dans le serveur (origin/main) : `tidal.rs` calcule `has_children`
  // depuis `hasSubgenres`, mais `get_genres(&self, _parent_id)` ignore le
  // paramètre — `?parent_id=Jazz` re-sert la liste racine, à l'identique.
  const racine = normaliserGenres([
    { id: 'Pop', name: 'Pop', has_children: true },
    { id: 'Rock', name: 'Rock', has_children: true },
    { id: 'Jazz', name: 'Jazz', has_children: true },
  ]);

  it('la racine re-servie comme enfants ne fait pas un second niveau', () => {
    const parent = racine[2];
    const rendus = normaliserGenres([
      { id: 'Pop', name: 'Pop', has_children: true },
      { id: 'Rock', name: 'Rock', has_children: true },
      { id: 'Jazz', name: 'Jazz', has_children: true },
    ]);
    expect(sousGenresUtiles(parent, racine, rendus)).toEqual([]);
  });

  it('de vrais enfants, eux, passent tous', () => {
    // Qobuz : `/genre/list?parent_id=64` sert des identifiants qui lui sont
    // propres, absents de la racine.
    const parent = racine[2];
    const rendus = normaliserGenres([
      { id: '65', name: 'Jazz vocal', has_children: false },
      { id: '66', name: 'Big Band', has_children: false },
    ]);
    expect(sousGenresUtiles(parent, racine, rendus).map((g) => g.id)).toEqual(['65', '66']);
  });

  it('le parent ne peut pas être son propre enfant', () => {
    const parent = normaliserGenres([{ id: '64', name: 'Jazz', has_children: true }])[0];
    const rendus = normaliserGenres([
      { id: '64', name: 'Jazz', has_children: true },
      { id: '65', name: 'Jazz vocal' },
    ]);
    expect(sousGenresUtiles(parent, [], rendus).map((g) => g.id)).toEqual(['65']);
  });
});
