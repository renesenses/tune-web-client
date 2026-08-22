import { describe, it, expect } from 'vitest';
import { etiquetteCaracteristiques } from '../caracteristiquesPeripherique';

describe('etiquetteCaracteristiques', () => {
  it('rend les caractéristiques d’un périphérique réel', () => {
    // Charge utile capturée sur Tune 0.9.96 (CoreAudio), GET /api/v1/devices/audio.
    expect(
      etiquetteCaracteristiques({
        max_channels: 2,
        sample_rates: [44100, 48000, 88200, 96000],
      }),
    ).toBe('2ch · 96 kHz');
  });

  it('prend le MAXIMUM, pas le premier élément de la liste', () => {
    // Le premier élément n'est ni le maximum ni ce qui joue : le prendre
    // afficherait « 44,1 kHz » sur un DAC qui monte à 384.
    expect(
      etiquetteCaracteristiques({ max_channels: 2, sample_rates: [44100, 384000] }),
    ).toBe('2ch · 384 kHz');
  });

  it('garde la décimale des fréquences qui en ont une', () => {
    // 44,1 kHz est un repère pour un audiophile ; « 44 kHz » n'en est pas un.
    expect(etiquetteCaracteristiques({ max_channels: 2, sample_rates: [44100] })).toBe(
      '2ch · 44.1 kHz',
    );
    expect(etiquetteCaracteristiques({ max_channels: 2, sample_rates: [352800] })).toBe(
      '2ch · 352.8 kHz',
    );
  });

  it('n’écrit JAMAIS NaN — le défaut d’origine (#2098)', () => {
    // Ce que voyait Benjithom : le client lisait `channels`/`sample_rate`, deux
    // champs absents de la charge utile, d'où « CH · NAN KHZ ».
    const ancienneCharge = { channels: 2, sample_rate: 96000 } as never;
    const etiquette = etiquetteCaracteristiques(ancienneCharge);
    expect(etiquette).not.toContain('NaN');
    expect(etiquette).toBe('');
  });

  it('rend les canaux seuls quand aucune fréquence n’est connue', () => {
    expect(etiquetteCaracteristiques({ max_channels: 2, sample_rates: [] })).toBe('2ch');
    expect(
      etiquetteCaracteristiques({ max_channels: 2, sample_rates: undefined as never }),
    ).toBe('2ch');
  });

  it('ignore les valeurs absurdes plutôt que de les afficher', () => {
    expect(
      etiquetteCaracteristiques({ max_channels: 0, sample_rates: [0, -1, 48000] }),
    ).toBe('48 kHz');
    expect(etiquetteCaracteristiques({ max_channels: 0, sample_rates: [] })).toBe('');
  });

  it('rend un multicanal tel quel', () => {
    expect(
      etiquetteCaracteristiques({ max_channels: 8, sample_rates: [48000, 192000] }),
    ).toBe('8ch · 192 kHz');
  });
});
