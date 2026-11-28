import { describe, expect, it } from 'vitest';
import { pastilleHauteResolution } from './pastilleNocturne';

describe('Nocturne — pastille haute résolution des tuiles', () => {
  it('affiche bits/kHz au-delà de 16 bits / 48 kHz', () => {
    expect(pastilleHauteResolution({ format: 'flac', bit_depth: 24, sample_rate: 96000 })).toEqual({ texte: '24/96', dsd: false });
    expect(pastilleHauteResolution({ format: 'flac', bit_depth: 24, sample_rate: 44100 })).toEqual({ texte: '24/44', dsd: false });
    expect(pastilleHauteResolution({ format: 'flac', bit_depth: 24, sample_rate: 176400 })?.texte).toBe('24/176');
  });

  it('n’affiche rien en qualité CD ou en dessous', () => {
    expect(pastilleHauteResolution({ format: 'flac', bit_depth: 16, sample_rate: 44100 })).toBeNull();
    expect(pastilleHauteResolution({ format: 'flac', bit_depth: 16, sample_rate: 48000 })).toBeNull();
    expect(pastilleHauteResolution({ format: 'mp3', bit_depth: 24, sample_rate: 96000 })).toBeNull();
    expect(pastilleHauteResolution(null)).toBeNull();
    expect(pastilleHauteResolution({})).toBeNull();
  });

  it('nomme le DSD par son multiple de 44,1 kHz', () => {
    expect(pastilleHauteResolution({ format: 'dsf', bit_depth: 1, sample_rate: 2822400 })).toEqual({ texte: 'DSD64', dsd: true });
    expect(pastilleHauteResolution({ format: 'dff', sample_rate: 5644800 })?.texte).toBe('DSD128');
    expect(pastilleHauteResolution({ format: 'dsf' })).toEqual({ texte: 'DSD', dsd: true });
  });
});
