import { describe, expect, it } from 'vitest';
import { artistesDuCredit, pistesReliees } from '../artistesRelies';
import type { Track } from '../types';

describe('artistes multiples — affichage', () => {
  it('rend les artistes du crédit découpé, dans l’ordre', () => {
    const t = { artists: [{ id: 1, name: 'The Beatles' }, { id: 2, name: 'Genesis' }] } as Track;
    expect(artistesDuCredit(t).map((a) => a.name)).toEqual(['The Beatles', 'Genesis']);
  });

  it('ne rend rien pour une piste à un seul artiste, ou sans la clé', () => {
    expect(artistesDuCredit({ artists: [{ id: 1, name: 'Seul' }] } as Track)).toEqual([]);
    expect(artistesDuCredit({} as Track)).toEqual([]);
    expect(artistesDuCredit(null)).toEqual([]);
  });

  it('écarte une entrée mal formée', () => {
    const t = { artists: [{ id: 1, name: 'A' }, { id: 2, name: ' ' }, null as any] } as Track;
    expect(artistesDuCredit(t)).toEqual([]);
  });

  it('garde sur la page d’un artiste les seules pistes où il est relié', () => {
    const pistes = [
      { id: 1, title: 'Sienne' },
      { id: 2, title: 'Duo', relie: true },
    ] as Track[];
    expect(pistesReliees(pistes).map((p) => p.id)).toEqual([2]);
    expect(pistesReliees(undefined)).toEqual([]);
  });
});
