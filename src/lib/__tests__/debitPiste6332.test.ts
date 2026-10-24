import { describe, expect, it } from 'vitest';
import { bitrateLabel, estFormatAvecPerte, formatCompactQuality, formatQualityTooltip } from '../utils';

// tune-server-rust#6332 — le débit d'une piste locale (fil 2269 : Diva, MP3
// 128 kbit/s, que « Track Details » ne montrait pas).
describe('débit de la piste (#6332)', () => {
  const diva = { format: 'mp3', sample_rate: 44100, bit_depth: 16, source: 'local', bitrate_kbps: 128 };

  it('le débit connu du serveur se lit en kbit/s', () => {
    expect(bitrateLabel(diva)).toBe('128 kbit/s');
    expect(bitrateLabel({ ...diva, bitrate_kbps: 127.6 })).toBe('128 kbit/s');
  });

  it('inconnu, nul ou absent : rien, sauf la source à débit unique', () => {
    expect(bitrateLabel({ source: 'local', bitrate_kbps: 0 })).toBeNull();
    expect(bitrateLabel({ source: 'local' })).toBeNull();
    expect(bitrateLabel({ source: 'bandcamp' })).toBe('128 kbit/s');
  });

  it('la pastille compacte d’un MP3 local dit son débit', () => {
    expect(formatCompactQuality(diva)).toBe('MP3 128 kbit/s');
  });

  it('un FLAC garde fréquence et profondeur, même avec un débit', () => {
    expect(formatCompactQuality({ format: 'flac', sample_rate: 96000, bit_depth: 24, source: 'local', bitrate_kbps: 2900 })).toBe(
      'FLAC 96/24',
    );
    expect(estFormatAvecPerte('FLAC')).toBe(false);
    expect(estFormatAvecPerte('opus')).toBe(true);
  });

  it('l’infobulle porte le débit', () => {
    expect(formatQualityTooltip(diva)).toContain('Bitrate: 128 kbit/s');
  });
});
