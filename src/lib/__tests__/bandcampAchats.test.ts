import { describe, expect, it } from 'vitest';
import {
  cleTelechargeable,
  enMo,
  etatSession,
  fautSuivre,
  pretsALImport,
  telechargementDe,
} from '../bandcampAchats';
import type { BandcampTelechargement } from '../api';

const enCours: BandcampTelechargement = { sale_item: 'p1', artist: 'A', title: 'T', state: 'telechargement', octets: 42 };
const fini: BandcampTelechargement = { sale_item: 'p2', artist: 'A', title: 'U', state: 'termine', dossier: '/d/A - U', fichiers: 9 };
const rate: BandcampTelechargement = { sale_item: 'p3', artist: 'A', title: 'V', state: 'echec', erreur: 'HTTP 403' };

describe('achats Bandcamp en FLAC (Yves, 16/09/2026)', () => {
  it('la bannière ne dit qu’une chose : pas de session, périmée, ou rien', () => {
    expect(etatSession(false, false, false)).toBe('aucune');
    expect(etatSession(true, false, false)).toBe('perimee');
    expect(etatSession(true, true, false)).toBe('valide');
    // Une collection vide n’accuse pas la session.
    expect(etatSession(true, false, true)).toBe('valide');
  });

  it('le bouton FLAC n’existe que sur un achat téléchargeable', () => {
    expect(cleTelechargeable({ sale_item: 'p1', downloadable: true })).toBe('p1');
    expect(cleTelechargeable({ sale_item: 'p1', downloadable: false })).toBeNull();
    expect(cleTelechargeable({ sale_item: null, downloadable: true })).toBeNull();
    expect(cleTelechargeable({})).toBeNull();
  });

  it('retrouve le téléchargement d’un achat et sait s’il faut suivre', () => {
    expect(telechargementDe([enCours, fini], 'p2')).toBe(fini);
    expect(telechargementDe([enCours, fini], 'p9')).toBeNull();
    expect(telechargementDe([enCours], null)).toBeNull();
    expect(fautSuivre([enCours, fini])).toBe(true);
    expect(fautSuivre([fini, rate])).toBe(false);
    expect(fautSuivre([])).toBe(false);
  });

  it('ne propose à l’import que ce qui est terminé, avec son dossier', () => {
    const prets = pretsALImport([enCours, fini, rate]);
    expect(prets).toHaveLength(1);
    expect(prets[0].dossier).toBe('/d/A - U');
  });

  it('affiche un volume lisible', () => {
    expect(enMo(1_048_576)).toBe('1.0 Mo');
    expect(enMo(120 * 1_048_576)).toBe('120 Mo');
  });
});
