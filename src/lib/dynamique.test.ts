import { describe, expect, it } from 'vitest';
import { cleUnite, lignesDynamique, resumeDynamiqueAlbum, texteResume } from './dynamique';

describe('dynamique (tune-server-rust#9040)', () => {
  it('rend les lignes mesurées, dans l’ordre, avec leur unité', () => {
    const l = lignesDynamique(
      { integree_lufs: -14.8, lra_lu: 7.4, crete_echantillon_dbfs: -2, crete_vraie_dbtp: 0.4 },
      'en',
    );
    expect(l).toEqual([
      { cle: 'fiche.dyn.loudness', valeur: '-14.8', unite: 'LUFS' },
      { cle: 'fiche.dyn.lra', valeur: '7.4', unite: 'LU' },
      { cle: 'fiche.dyn.samplePeak', valeur: '-2.0', unite: 'dBFS' },
      { cle: 'fiche.dyn.truePeak', valeur: '+0.4', unite: 'dBTP' },
    ]);
    expect(cleUnite('dBTP')).toBe('fiche.dyn.unit.dBTP');
  });

  it('ne montre que ce qui est mesuré, et rien pour une section absente', () => {
    expect(lignesDynamique({ lra_lu: 3 }, 'fr').map((l) => l.cle)).toEqual(['fiche.dyn.lra']);
    expect(lignesDynamique(null, 'fr')).toEqual([]);
    expect(lignesDynamique({ integree_lufs: null }, 'fr')).toEqual([]);
  });

  it('écrit les décimales dans la langue de l’interface', () => {
    expect(lignesDynamique({ lra_lu: 10 }, 'fr')[0].valeur).toBe('10,0');
  });

  it('résume l’album sans le DR, déjà dans son badge', () => {
    expect(texteResume(resumeDynamiqueAlbum({ album_id: 1, pistes: 2, dr: 11, integree_lufs: -14, lra_lu: 10, crete_vraie_dbtp: 1 }, 'en')))
      .toBe('-14.0 LUFS · LRA 10.0 LU · +1.0 dBTP');
    expect(resumeDynamiqueAlbum({ album_id: 1, pistes: 2, dr: 11 }, 'en')).toEqual([]);
    expect(texteResume(resumeDynamiqueAlbum(null, 'en'))).toBeNull();
  });
});
