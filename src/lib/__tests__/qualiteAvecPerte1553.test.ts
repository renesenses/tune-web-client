/**
 * #1553 — un codec avec perte n'est jamais Hi-Res, ni « CD ».
 *
 * `getQualityTier` décidait « sans perte » dès que `bit_depth >= 24`, AVANT de
 * regarder le format. Or un MP3/AAC/Opus/Vorbis décodé porte une profondeur
 * de bits — celle du PCM après décodage, pas celle de la source. Un MP3 24 bits
 * sortait donc en Hi-Res, un MP3 Qobuz 16 bits en « CD », et le filtre
 * « qualité » de la bibliothèque les rangeait avec les vrais fichiers hi-res.
 */
import { describe, it, expect } from 'vitest';
import { getQualityTier, formatQualitySource, formatQualityTooltip } from '../utils';

const AVEC_PERTE = ['mp3', 'aac', 'ogg', 'opus', 'wma', 'vorbis'];

describe('#1553 — le codec avec perte l emporte sur la profondeur de bits', () => {
  it('un codec avec perte en 24 bits reste Lossy, quelle que soit la fréquence', () => {
    for (const fmt of AVEC_PERTE) {
      for (const sr of [44100, 48000, 96000, 192000]) {
        expect(getQualityTier({ format: fmt, sample_rate: sr, bit_depth: 24 }), `${fmt} ${sr}/24`).toBe('lossy');
        expect(getQualityTier({ format: fmt, sample_rate: sr, bit_depth: 32 }), `${fmt} ${sr}/32`).toBe('lossy');
      }
    }
  });

  it('la casse et le type MIME ne changent rien', () => {
    expect(getQualityTier({ format: 'MP3', sample_rate: 44100, bit_depth: 24 })).toBe('lossy');
    expect(getQualityTier({ format: 'audio/mpeg', sample_rate: 44100, bit_depth: 24 })).toBe('lossy');
    expect(getQualityTier({ format: 'audio/aac', sample_rate: 48000, bit_depth: 24 })).toBe('lossy');
    expect(getQualityTier({ format: 'audio/ogg', sample_rate: 48000, bit_depth: 24 })).toBe('lossy');
    expect(getQualityTier({ format: 'audio/opus', sample_rate: 48000, bit_depth: 24 })).toBe('lossy');
  });

  it('un codec avec perte n est jamais « CD », même servi par Qobuz en 16 bits', () => {
    for (const fmt of AVEC_PERTE) {
      expect(getQualityTier({ format: fmt, sample_rate: 44100, bit_depth: 16, source: 'qobuz' }), fmt).toBe('lossy');
    }
  });

  it('les badges suivent : ni « 24/96 » ni « Hi-Res » sur un MP3', () => {
    const mp3 = { format: 'mp3', sample_rate: 96000, bit_depth: 24, source: 'local' };
    expect(formatQualitySource(mp3)).toBe('Local MP3');
    expect(formatQualityTooltip(mp3)).toContain('Quality: Lossy');
  });

  it('les formats sans perte et les pistes sans format gardent leur palier', () => {
    expect(getQualityTier({ format: 'flac', sample_rate: 44100, bit_depth: 24 })).toBe('hires');
    expect(getQualityTier({ format: 'flac', sample_rate: 44100, bit_depth: 16 })).toBe('cd');
    expect(getQualityTier({ format: 'alac', sample_rate: 192000, bit_depth: 24 })).toBe('hires_max');
    // Sans format déclaré, les spécifications restent le seul indice.
    expect(getQualityTier({ format: null, sample_rate: 96000, bit_depth: 24, source: 'qobuz' })).toBe('hires');
    expect(getQualityTier({ format: '', sample_rate: 44100, bit_depth: 24 })).toBe('hires');
    // m4a n'est pas tranché ici : le serveur le résout en alac ou aac.
    expect(getQualityTier({ format: 'm4a', sample_rate: 44100, bit_depth: 24 })).toBe('hires');
    expect(getQualityTier({ format: 'dsf', sample_rate: 2822400, bit_depth: 1 })).toBe('dsd');
    expect(getQualityTier({ format: 'mqa', sample_rate: 48000, bit_depth: 24 })).toBe('mqa');
  });
});
