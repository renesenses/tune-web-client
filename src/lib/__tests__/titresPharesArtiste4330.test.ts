// FabienM, 17/09/2026 : « Cette page artiste pourrait être complétée avec la
// bio de l'artiste, ses titres phares […] » — étape 2 de #4330.
import { describe, expect, it } from 'vitest';
import { chargerTitresPhares, servicesPourTitresPhares, TITRES_PHARES_MAX } from '../titresPharesArtiste';
import type { Track } from '../types';

const sec = (service: string, artistId?: string) => ({ service, artistId, albums: [] });
const pistes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: null, source_id: `T${i}`, title: `t${i}` }) as unknown as Track);

describe('titres phares d’un artiste de la bibliothèque', () => {
  it('les services dans l’ordre de la page commune, seulement ceux qui ont un identifiant', () => {
    expect(servicesPourTitresPhares([sec('bandcamp', 'B'), sec('tidal', 'T'), sec('qobuz'), sec('youtube', 'Y')]))
      .toEqual([{ service: 'tidal', artistId: 'T' }, { service: 'youtube', artistId: 'Y' }, { service: 'bandcamp', artistId: 'B' }]);
  });

  it('le premier service qui rend gagne ; la source est tamponnée ; la liste est bornée', async () => {
    const vus: string[] = [];
    const titres = await chargerTitresPhares([sec('tidal', 'T7'), sec('qobuz', 'Q7')], async (s, id) => {
      vus.push(`${s}:${id}`);
      return s === 'qobuz' ? pistes(25) : pistes(3);
    });
    expect(vus).toEqual(['qobuz:Q7']);
    expect(titres).toHaveLength(TITRES_PHARES_MAX);
    expect(titres.every((t) => t.source === 'qobuz')).toBe(true);
  });

  it('un service vide ou en échec passe la main au suivant', async () => {
    const titres = await chargerTitresPhares([sec('qobuz', 'Q'), sec('tidal', 'T'), sec('youtube', 'Y')], async (s) => {
      if (s === 'qobuz') throw new Error('502');
      if (s === 'tidal') return [];
      return pistes(2);
    });
    expect(titres.map((t) => t.source)).toEqual(['youtube', 'youtube']);
  });

  it('aucun service : aucun titre, aucun appel', async () => {
    let appels = 0;
    expect(await chargerTitresPhares([], async () => { appels++; return pistes(1); })).toEqual([]);
    expect(appels).toBe(0);
  });
});
