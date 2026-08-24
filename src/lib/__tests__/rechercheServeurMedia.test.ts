import { describe, it, expect } from 'vitest';
import { filtrerLocalement, replier } from '../rechercheServeurMedia';
import type { MediaServerBrowseResult } from '../types';

const base = (): MediaServerBrowseResult => ({
  object_id: '0',
  containers: [
    { id: 'c1', parent_id: '0', title: 'Élégies', child_count: 3 },
    { id: 'c2', parent_id: '0', title: 'Nocturnes', child_count: 5 },
  ],
  items: [
    { id: 'i1', title: 'So What', artist: 'Miles Davis' },
    { id: 'i2', title: 'Blue in Green', artist: 'Bill Evans' },
  ],
  total_matches: 4,
  number_returned: 4,
});

describe('replier', () => {
  it('ignore la casse et les accents, comme la base', () => {
    expect(replier('Élégie')).toBe('elegie');
    expect(replier('CŒUR')).toBe('cœur');
  });
});

describe('filtrerLocalement', () => {
  it('retient les dossiers dont le titre correspond, accents compris', () => {
    const r = filtrerLocalement(base(), 'elegie');
    expect(r.containers.map((c) => c.title)).toEqual(['Élégies']);
    expect(r.items).toEqual([]);
  });

  // Dans un dossier d'album, chercher un interprete est le geste naturel.
  it('retient une piste par son artiste autant que par son titre', () => {
    expect(filtrerLocalement(base(), 'miles').items.map((i) => i.id)).toEqual(['i1']);
    expect(filtrerLocalement(base(), 'blue').items.map((i) => i.id)).toEqual(['i2']);
  });

  it('rend tout quand la requete est vide, sans rien filtrer', () => {
    const r = filtrerLocalement(base(), '   ');
    expect(r.containers).toHaveLength(2);
    expect(r.items).toHaveLength(2);
  });

  it('ne trouve rien plutot que tout quand rien ne correspond', () => {
    const r = filtrerLocalement(base(), 'introuvable');
    expect(r.containers).toEqual([]);
    expect(r.items).toEqual([]);
  });
});
