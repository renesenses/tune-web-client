/**
 * renesenses/tune-server-rust#6466 (FabienM, fil 2302 points 10, 11, 15) —
 * l'historique par conteneurs, côté web :
 *
 *  1. les déclencheurs (« Lire », « Lire aléatoire », « Lire ensuite »,
 *     « Ajouter à la file ») envoient le CONTENEUR de l'objet ;
 *  2. la ligne ARTISTE de l'historique mène à la page artiste.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const ouvrirArtisteDepuis = vi.fn<(a: any, depuis: string) => Promise<void>>(async () => {});
vi.mock('../ouvrirArtisteDepuis', () => ({
  ouvrirArtisteDepuis: (a: any, depuis: string) => ouvrirArtisteDepuis(a, depuis),
}));

import { avecContexte, contexteDObjet, objetAlbum, objetArtiste, objetPlaylist, objetLabel, objetCollection } from '../gestesObjet';
import { ouvertureArtisteDuLot } from '../lienArtisteDHistorique';

describe('Le conteneur des déclencheurs (#6466)', () => {
  it('nomme album, artiste, playlist et label, de la bibliothèque comme d’un service', () => {
    expect(contexteDObjet(objetAlbum({ id: 7, title: 'Bleu pétrole', source: 'local' })))
      .toEqual({ context_type: 'album', context_id: '7', context_source: 'local' });
    expect(contexteDObjet(objetArtiste({ id: 3, name: 'Alain Bashung', source: 'local' })))
      .toEqual({ context_type: 'artist', context_id: '3', context_source: 'local' });
    expect(contexteDObjet(objetArtiste({ source: 'qobuz', source_id: '38326', name: 'David Bowie' })))
      .toEqual({ context_type: 'artist', context_id: '38326', context_source: 'qobuz' });
    expect(contexteDObjet(objetPlaylist({ source: 'qobuz', id: '21846544', name: 'Neo-Soul' })))
      .toEqual({ context_type: 'playlist', context_id: '21846544', context_source: 'qobuz' });
    expect(contexteDObjet(objetPlaylist({ id: 12, name: 'Dimanche' })))
      .toEqual({ context_type: 'playlist', context_id: '12', context_source: 'local' });
    expect(contexteDObjet(objetLabel('Blue Note')))
      .toEqual({ context_type: 'label', context_id: 'Blue Note', context_source: 'local' });
  });

  it('ne nomme pas ce que l’historique ne regroupe pas, ni ce qui ne se désigne pas', () => {
    expect(contexteDObjet(objetCollection({ id: 4, name: 'Jazz' }, false))).toBeNull();
    expect(contexteDObjet(objetArtiste({ name: 'Inconnu' }))).toBeNull();
  });

  it('`/play` reçoit type et id ; `queue/add` reçoit aussi le service', () => {
    const ctx = { context_type: 'artist', context_id: '38326', context_source: 'qobuz' };
    expect(avecContexte({ track_ids: [1] }, ctx, false)).toEqual({ track_ids: [1], context_type: 'artist', context_id: '38326' });
    expect(avecContexte({ track_ids: [1] }, ctx, true)).toEqual({ track_ids: [1], ...ctx });
    expect(avecContexte({ track_ids: [1] }, null, true)).toEqual({ track_ids: [1] });
  });

  it('BRANCHEMENT — « Lire ensuite », « Ajouter à la file » et « Lire » passent le conteneur', () => {
    const src = readFileSync('src/lib/gestesObjet.ts', 'utf8');
    expect(src).toContain('await api.addToQueue(zid, avecContexte(corps, contexteDObjet(o), true));');
    expect(src).toContain('lireListe(pistes, gestesDeLecture(zid, contexte))');
    expect(src).toContain('lireListeAleatoire(pistes, gestesDeLecture(zid, contexte))');
  });
});

describe('La ligne ARTISTE de l’historique mène à la page artiste (#6466, point 10)', () => {
  beforeEach(() => ouvrirArtisteDepuis.mockClear());
  const lot = (id: string | null, source: string | null) => [{ contexte: { type: 'artist', id, source } }];

  it('artiste de la bibliothèque : sa page, par son identifiant', () => {
    ouvertureArtisteDuLot('artist', lot('3', 'local'), 'Alain Bashung')!();
    expect(ouvrirArtisteDepuis.mock.calls[0][0]).toEqual({ id: 3, name: 'Alain Bashung', source: 'local' });
  });

  it('artiste de service : sa page chez le service', () => {
    ouvertureArtisteDuLot('artist', lot('38326', 'qobuz'), 'David Bowie')!();
    expect(ouvrirArtisteDepuis.mock.calls[0][0]).toEqual({ source: 'qobuz', source_id: '38326', name: 'David Bowie' });
  });

  it('sans source connue : par le nom seul ; ni album ni playlist ne sont concernés', () => {
    ouvertureArtisteDuLot('artist', lot('3', null), 'Alain Bashung')!();
    expect(ouvrirArtisteDepuis.mock.calls[0][0]).toEqual({ name: 'Alain Bashung' });
    expect(ouvertureArtisteDuLot('album', lot('3', 'local'), 'x')).toBeNull();
    expect(ouvertureArtisteDuLot('artist', lot(null, null), '')).toBeNull();
  });

  it('BRANCHEMENT — l’historique pose le lien', () => {
    const src = readFileSync('src/components/v2/HistoriqueV2.svelte', 'utf8');
    expect(src).toContain('ouvertureArtisteDuLot(tranche.type, lot, nom)');
  });
});
