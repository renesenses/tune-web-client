import { describe, expect, it } from 'vitest';
import { anneeDe, cleEtat, lienMusicBrainz, reponseDEchec } from './albumsManquants';

describe('#6288 — Albums manquants', () => {
  it('lit l’année d’une date MusicBrainz, quelle que soit sa précision', () => {
    expect(anneeDe('1967-08-05')).toBe('1967');
    expect(anneeDe('1971')).toBe('1971');
    expect(anneeDe('')).toBeNull();
    expect(anneeDe(null)).toBeNull();
  });

  it('ne compose un lien MusicBrainz que pour un identifiant valide', () => {
    expect(lienMusicBrainz('50AC60C4-fb35-37f8-a065-222996ea139c'))
      .toBe('https://musicbrainz.org/release-group/50ac60c4-fb35-37f8-a065-222996ea139c');
    expect(lienMusicBrainz('../artist/x')).toBeNull();
    expect(lienMusicBrainz(undefined)).toBeNull();
  });

  it('dit pourquoi la liste est vide, jamais une page blanche', () => {
    expect(cleEtat({ statut: 'non_identifie' })).toBe('v2.manquants.nonIdentifie');
    expect(cleEtat({ statut: 'inconnu' })).toBe('v2.manquants.nonIdentifie');
    expect(cleEtat({ statut: 'indisponible' })).toBe('v2.manquants.indisponible');
    expect(cleEtat({ statut: 'ok', manquants: [] })).toBe('v2.manquants.aucun');
    expect(cleEtat({ statut: 'ok', manquants: [{ mbid: 'x', titre: 'Meddle' }] })).toBe('v2.manquants.compte');
  });

  it('dit qu’aucun album n’est dans la bibliothèque plutôt que tout annoncer manquant', () => {
    expect(cleEtat({ statut: 'sans_album', manquants: [] })).toBe('v2.manquants.sansAlbum');
  });

  it('une bibliothèque illisible (500, code bibliotheque_illisible) a sa propre phrase', () => {
    const erreur = Object.assign(new Error('500'), { code: 'bibliotheque_illisible' });
    expect(reponseDEchec(erreur)).toEqual({ statut: 'bibliotheque_illisible' });
    expect(cleEtat(reponseDEchec(erreur))).toBe('v2.manquants.bibliothequeIllisible');
    expect(reponseDEchec(new Error('réseau'))).toEqual({ statut: 'indisponible' });
    expect(reponseDEchec(null)).toEqual({ statut: 'indisponible' });
  });
});
