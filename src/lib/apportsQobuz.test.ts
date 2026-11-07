import { describe, expect, it } from 'vitest';
import { confirmable, creditsQobuz, lignesApports, retirable, type ApportsQobuz } from './apportsQobuz';

const q = (valeur: unknown) => ({ valeur, source: 'qobuz' });

const applique: ApportsQobuz = {
  statut: 'applique',
  service_album_id: 'alb-q1',
  champs: {
    label: q('Label Qobuz'),
    date_de_sortie: q('2015-03-02'),
    upc: q('123456789012'),
    phonogramme: q('2015 Phono'),
    copyright: q('2015 Droits'),
    genres: q(['Jazz', 'Cool Jazz']),
    recompenses: q([{ nom: "Diapason d'or", publication: 'Diapason', date: '2015-03-02' }]),
    hires: q({ bit_depth: 24, sample_rate: 96000 }),
    livrets: q([
      { name: 'Livret', url: 'https://static.qobuz.com/goodies/a.pdf' },
      { name: 'piège', url: 'javascript:void(0)' },
    ]),
    pochette_hd: q({ url: 'https://static.qobuz.com/images/a_max.jpg', cote_min: 600 }),
  },
};

describe('tune-server-rust#8077 — apports Qobuz de la fiche album', () => {
  it('chaque donnée reprise s’affiche avec sa source, dans l’ordre de la fiche', () => {
    const l = lignesApports(applique);
    expect(l.map((x) => x.cle)).toEqual([
      'v2.album.qobuz.label', 'v2.album.qobuz.releaseDate', 'v2.album.qobuz.upc', null, null,
      'v2.album.qobuz.genres', 'v2.album.qobuz.awards', 'v2.album.qobuz.hires',
      'v2.album.qobuz.booklet', 'v2.album.qobuz.coverHd',
    ]);
    expect(l.every((x) => x.source === 'qobuz')).toBe(true);
    expect(l[3].texte).toBe('℗ 2015 Phono');
    expect(l[4].texte).toBe('© 2015 Droits');
    expect(l[6].texte).toBe("Diapason d'or (Diapason, 2015-03-02)");
  });

  it('une adresse qui n’est pas en https n’est jamais proposée', () => {
    const urls = lignesApports(applique).flatMap((x) => (x.url ? [x.url] : []));
    expect(urls).toEqual(['https://static.qobuz.com/goodies/a.pdf', 'https://static.qobuz.com/images/a_max.jpg']);
  });

  it('rien d’affiché hors d’un rapprochement appliqué', () => {
    expect(lignesApports({ ...applique, statut: 'a_confirmer' })).toEqual([]);
    expect(lignesApports({ ...applique, statut: 'retire' })).toEqual([]);
    expect(lignesApports(null)).toEqual([]);
  });

  it('retirer et confirmer ne sont proposés qu’à bon escient', () => {
    expect(retirable(applique)).toBe(true);
    expect(retirable({ statut: 'retire' })).toBe(false);
    expect(confirmable({ statut: 'a_confirmer', service_album_id: 'alb-q1' })).toBe(true);
    expect(confirmable({ statut: 'a_confirmer', service_album_id: null })).toBe(false);
    expect(confirmable(applique)).toBe(false);
  });

  it('seuls les crédits de source qobuz sont listés, regroupés par personne et rôle', () => {
    expect(creditsQobuz([
      { artist_name: 'Producteur', role: 'producer', source: 'qobuz', track_number: 1 },
      { artist_name: 'Producteur', role: 'producer', source: 'qobuz', track_number: 2 },
      { artist_name: 'Pianiste local', role: 'performer', instrument: 'piano', track_number: 1 },
    ])).toEqual([{ nom: 'Producteur', role: 'producer', pistes: [1, 2] }]);
  });
});
