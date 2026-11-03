// tune-server-rust#7718 — « Qualité minimale » dans « Plus de filtres » : un
// niveau de qualité de flux, sans distinction de format, envoyé au serveur en
// `quality_min` ; « toute qualité, même inconnue » n'envoie rien.
import { describe, expect, it } from 'vitest';
import {
  FILTRES_RADIO_VIDES, QUALITES_RADIO, nombreDeFiltresActifs, normaliserFiltresRadio, parametresDesFiltres,
} from '../radioFiltres';
import { CHARGEURS } from '../locales';

describe('qualité de flux minimale', () => {
  it('propose les débits puis les niveaux sans perte, du plus faible au plus haut', () => {
    expect(QUALITES_RADIO).toEqual([
      '48', '96', '128', '192', '256', '320', 'flac_16_44', 'flac_24_48', 'flac_24_96', 'flac_24_192',
    ]);
  });

  it('chaque niveau part en `quality_min`, et seul', () => {
    for (const q of QUALITES_RADIO) {
      const f = { ...FILTRES_RADIO_VIDES, qualiteMin: q };
      expect(parametresDesFiltres(f), q).toEqual({ quality_min: q });
      expect(nombreDeFiltresActifs(f), q).toBe(1);
    }
    // Se combine avec le format et les autres critères, sans les remplacer.
    expect(parametresDesFiltres({ ...FILTRES_RADIO_VIDES, codec: 'aac', qualiteMin: '128' }))
      .toEqual({ codec: 'aac', quality_min: '128' });
    // Contre-épreuve : aucune qualité choisie, aucun paramètre.
    expect(parametresDesFiltres({ ...FILTRES_RADIO_VIDES, qualiteMin: null })).toEqual({});
  });

  it('relit le choix enregistré et reprend un ancien débit minimal', () => {
    expect(normaliserFiltresRadio({ qualiteMin: ' FLAC_24_96 ' }).qualiteMin).toBe('flac_24_96');
    expect(normaliserFiltresRadio({ qualiteMin: '96' }).qualiteMin).toBe('96');
    // Une préférence d'avant : `bitrateMin: 256` devient « 256 kbit/s et plus ».
    expect(normaliserFiltresRadio({ bitrateMin: 256 }).qualiteMin).toBe('256');
    expect(parametresDesFiltres(normaliserFiltresRadio({ bitrateMin: 256 }))).toEqual({ quality_min: '256' });
    for (const abime of [{ qualiteMin: 'flac_99' }, { qualiteMin: '' }, { qualiteMin: '-3' }, { bitrateMin: 0 }]) {
      expect(normaliserFiltresRadio(abime).qualiteMin, JSON.stringify(abime)).toBeNull();
    }
  });
});

const CLES = ['qualityMin', 'anyQuality', 'flac'].map((k) => `v2.radio.filters.${k}`);

describe('libellés de la qualité minimale dans toutes les langues', () => {
  it.each(Object.keys(CHARGEURS))('%s', async (langue) => {
    const dict = (await CHARGEURS[langue as keyof typeof CHARGEURS]()).default;
    for (const cle of CLES) {
      expect(dict[cle], `${langue} : ${cle}`).toBeTruthy();
    }
    expect(dict['v2.radio.filters.flac']).toContain('{q}');
  });
});
