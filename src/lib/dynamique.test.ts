import { describe, expect, it } from 'vitest';
import { lignesDynamique, resumeDynamiqueAlbum } from './dynamique';

describe('dynamique (tune-server-rust#9040)', () => {
  it('rend les lignes mesurées, dans l’ordre, avec leur unité', () => {
    const l = lignesDynamique(
      { integree_lufs: -14.8, lra_lu: 7.4, crete_echantillon_dbfs: -2, crete_vraie_dbtp: 0.4 },
      'en',
    );
    expect(l).toEqual([
      { cle: 'fiche.dyn.loudness', texte: '-14.8 LUFS' },
      { cle: 'fiche.dyn.lra', texte: '7.4 LU' },
      { cle: 'fiche.dyn.samplePeak', texte: '-2.0 dBFS' },
      { cle: 'fiche.dyn.truePeak', texte: '+0.4 dBTP' },
    ]);
  });

  it('ne montre que ce qui est mesuré, et rien pour une section absente', () => {
    expect(lignesDynamique({ lra_lu: 3 }, 'fr').map((l) => l.cle)).toEqual(['fiche.dyn.lra']);
    expect(lignesDynamique(null, 'fr')).toEqual([]);
    expect(lignesDynamique({ integree_lufs: null }, 'fr')).toEqual([]);
  });

  it('écrit les décimales dans la langue de l’interface', () => {
    expect(lignesDynamique({ lra_lu: 10 }, 'fr')[0].texte).toBe('10,0 LU');
  });

  it('résume l’album sans le DR, déjà dans son badge', () => {
    expect(resumeDynamiqueAlbum({ album_id: 1, pistes: 2, dr: 11, integree_lufs: -14, lra_lu: 10, crete_vraie_dbtp: 1 }, 'en'))
      .toBe('-14.0 LUFS · LRA 10.0 LU · +1.0 dBTP');
    expect(resumeDynamiqueAlbum({ album_id: 1, pistes: 2, dr: 11 }, 'en')).toBeNull();
    expect(resumeDynamiqueAlbum(null, 'en')).toBeNull();
  });
});
