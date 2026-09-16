import { describe, expect, it } from 'vitest';
import { aucunAppariement, etatPontRoon, lignesDuRapport, remplir } from '../pontRoon';
import type { RapportPontRoon } from '../api/pontRoon';

const base: RapportPontRoon = {
  preview: true, artistes_total: 597, artistes_apparies: 466, artistes_inconnus: [], albums_total: 1266,
  albums_apparies: 1100, albums_inconnus: [], pistes_total: 15512, pistes_appariees: 14000,
  credits_a_ecrire: 9000, credits_deja_presents: 12, credits_ecrits: 0, images_nommees: 1800,
  images_portees: 1790, images_artistes_a_poser: 300, images_artistes_posees: 0,
  images_albums_a_poser: 40, images_albums_posees: 0,
};

describe('Pont Roon (Premium) — écran d’import', () => {
  it('dit pourquoi on ne peut pas importer avant de proposer quoi que ce soit', () => {
    expect(etatPontRoon(null, undefined)).toBe('chargement');
    expect(etatPontRoon(404, undefined)).toBe('absent');
    expect(etatPontRoon(402, undefined)).toBe('no-premium');
    expect(etatPontRoon(200, false)).toBe('no-premium');
    expect(etatPontRoon(200, true)).toBe('pret');
    expect(etatPontRoon(500, undefined)).toBe('erreur');
  });

  it('en aperçu, les lignes disent ce qui SERAIT écrit', () => {
    const cles = lignesDuRapport(base).map((l) => l.cle);
    expect(cles).toEqual(['v2.roon.lineArtists', 'v2.roon.lineAlbums', 'v2.roon.lineTracks', 'v2.roon.lineCreditsPreview', 'v2.roon.lineImagesPreview']);
    expect(lignesDuRapport(base)[4].valeurs).toEqual({ artists: 300, albums: 40 });
  });

  it('après import, ce qui l’a été ; et un export sans octets le dit', () => {
    const fait = { ...base, preview: false, credits_ecrits: 9000, images_artistes_posees: 300, images_albums_posees: 40 };
    expect(lignesDuRapport(fait).map((l) => l.cle)).toContain('v2.roon.lineImagesDone');
    const sansOctets = { ...base, images_portees: 0, images_artistes_a_poser: 0, images_albums_a_poser: 0 };
    expect(lignesDuRapport(sansOctets).map((l) => l.cle)).toContain('v2.roon.lineNoImageBytes');
  });

  it('remplit les libellés et repère un export d’une autre bibliothèque', () => {
    expect(remplir('{n} sur {total}', { n: 466, total: 597 })).toBe('466 sur 597');
    expect(remplir('{x}', {})).toBe('{x}');
    expect(aucunAppariement({ ...base, artistes_apparies: 0 })).toBe(true);
    expect(aucunAppariement(base)).toBe(false);
  });
});
