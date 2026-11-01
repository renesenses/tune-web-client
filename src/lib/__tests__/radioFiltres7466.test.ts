// tune-server-rust#7466 — recherche de radios par critères : la logique pure,
// et les libellés dans toutes les langues.
import { describe, expect, it } from 'vitest';
import {
  FILTRES_RADIO_VIDES, nombreDeFiltresActifs, normaliserFiltresRadio, parametresDesFiltres,
} from '../radioFiltres';
import { CHARGEURS } from '../locales';


describe('critères de la barre « Plus de filtres »', () => {
  it('aucun critère : aucun paramètre, rien d’actif', () => {
    expect(parametresDesFiltres(FILTRES_RADIO_VIDES)).toEqual({});
    expect(nombreDeFiltresActifs(FILTRES_RADIO_VIDES)).toBe(0);
  });

  it('chaque critère actif donne son paramètre serveur, et lui seul', () => {
    const f = { codec: 'flac', bitrateMin: 320, lossless: true, hires: true, metadataPlus: true, favoris: true };
    expect(parametresDesFiltres(f)).toEqual({
      codec: 'flac', bitrate_min: '320', lossless: 'true', hires: 'true', metadata_plus: 'true', favorites_only: 'true',
    });
    expect(nombreDeFiltresActifs(f)).toBe(6);
    // Contre-épreuve : un critère à `false` n'envoie rien.
    expect(parametresDesFiltres({ ...f, lossless: false, metadataPlus: false })).not.toHaveProperty('lossless');
    expect(parametresDesFiltres({ ...f, metadataPlus: false })).not.toHaveProperty('metadata_plus');
  });

  it('une préférence abîmée ou ancienne redevient des critères valides', () => {
    expect(normaliserFiltresRadio(null)).toEqual(FILTRES_RADIO_VIDES);
    expect(normaliserFiltresRadio('x')).toEqual(FILTRES_RADIO_VIDES);
    expect(normaliserFiltresRadio({ codec: ' FLAC ', bitrateMin: -3, hires: 'oui', metadataPlus: true }))
      .toEqual({ ...FILTRES_RADIO_VIDES, codec: 'flac', metadataPlus: true });
  });
});

const CLES = ['toggle', 'format', 'anyFormat', 'bitrateMin', 'anyBitrate', 'kbps', 'lossless', 'hires', 'favorites', 'reset']
  .map((k) => `v2.radio.filters.${k}`);

describe('libellés de « Plus de filtres » dans toutes les langues', () => {
  it.each(Object.keys(CHARGEURS))('%s', async (langue) => {
    const dict = (await CHARGEURS[langue as keyof typeof CHARGEURS]()).default;
    for (const cle of CLES) {
      expect(dict[cle], `${langue} : ${cle}`).toBeTruthy();
    }
    expect(dict['v2.radio.filters.kbps']).toContain('{n}');
  });
});
