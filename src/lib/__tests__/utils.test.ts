import { describe, it, expect } from 'vitest';
import {
  getQualityTier,
  fold,
  fixedBitrateLabel,
  formatQualitySource,
  formatCompactQuality,
  formatQualityTooltip,
} from '../utils';

describe('fold', () => {
  it('strips accents and lowercases for accent-insensitive matching (Sergio: carlao ↔ Carlão)', () => {
    expect(fold('Carlão')).toBe('carlao');
    expect(fold('CARLAO').includes(fold('carlao'))).toBe(true);
    expect(fold('Carlão').includes(fold('carlao'))).toBe(true);
    expect(fold('Motörhead').includes(fold('motorhead'))).toBe(true);
    expect(fold('Beyoncé').includes(fold('beyonce'))).toBe(true);
  });
  it('handles null/undefined', () => {
    expect(fold(null)).toBe('');
    expect(fold(undefined)).toBe('');
  });
});

describe('getQualityTier', () => {
  it('classifies Qobuz hi-res as Hi-Res even when the format string is missing (Progman: shown as "compressé")', () => {
    expect(getQualityTier({ format: null, sample_rate: 192000, bit_depth: 24, source: 'qobuz' })).toBe('hires_max');
    expect(getQualityTier({ format: null, sample_rate: 96000, bit_depth: 24, source: 'qobuz' })).toBe('hires');
  });

  it('classifies Qobuz CD (44.1/16) as CD, not Lossy', () => {
    expect(getQualityTier({ format: null, sample_rate: 44100, bit_depth: 16, source: 'qobuz' })).toBe('cd');
  });

  it('treats any 24-bit or >48kHz track as lossless (not Lossy) regardless of the format string', () => {
    // No lossy codec can carry a bit depth or exceed 48 kHz → must not be 'lossy'.
    expect(getQualityTier({ format: '', sample_rate: 96000, bit_depth: 0 })).not.toBe('lossy');
    expect(getQualityTier({ format: '', sample_rate: 44100, bit_depth: 24 })).toBe('hires');
  });

  it('still classifies real lossy formats as Lossy', () => {
    expect(getQualityTier({ format: 'mp3', sample_rate: 44100, bit_depth: 0, source: 'local' })).toBe('lossy');
    expect(getQualityTier({ format: 'aac', sample_rate: 48000, bit_depth: 0, source: 'tidal' })).toBe('lossy');
    expect(getQualityTier(null)).toBe('lossy');
  });

  it('classifies local FLAC by specs', () => {
    expect(getQualityTier({ format: 'flac', sample_rate: 44100, bit_depth: 16 })).toBe('cd');
    expect(getQualityTier({ format: 'audio/flac', sample_rate: 192000, bit_depth: 24 })).toBe('hires_max');
  });

  it('keeps DSD and MQA tiers', () => {
    expect(getQualityTier({ format: 'dsd', sample_rate: 2822400, bit_depth: 1 })).toBe('dsd');
    expect(getQualityTier({ format: 'mqa', sample_rate: 48000, bit_depth: 24 })).toBe('mqa');
  });

  it('never dresses up a Bandcamp stream as anything but Lossy', () => {
    // Bandcamp ne diffuse que du mp3-128. Le serveur envoie mp3 / 44,1 kHz /
    // 16 bits, et 16 bits ne doit JAMAIS faire basculer le verdict — sinon
    // l'indicateur promettrait une qualité que la source ne porte pas.
    expect(getQualityTier({ format: 'mp3', sample_rate: 44100, bit_depth: 16, source: 'bandcamp' })).toBe('lossy');
    expect(getQualityTier({ format: 'mpeg', sample_rate: 44100, bit_depth: 16, source: 'bandcamp' })).toBe('lossy');
  });
});

describe('le débit de Bandcamp est écrit, pas sous-entendu', () => {
  const piste = { format: 'mp3', sample_rate: 44100, bit_depth: 16, source: 'bandcamp' };

  it('ne prête un débit fixe qu’à une source qui n’en sert qu’un', () => {
    expect(fixedBitrateLabel('bandcamp')).toBe('128 kbit/s');
    expect(fixedBitrateLabel('BANDCAMP')).toBe('128 kbit/s');
    // Un débit qu'on ne connaît pas ne s'invente pas.
    expect(fixedBitrateLabel('qobuz')).toBeNull();
    expect(fixedBitrateLabel('local')).toBeNull();
    expect(fixedBitrateLabel(null)).toBeNull();
  });

  it('affiche « Bandcamp MP3 128 kbit/s » sur la puce du lecteur', () => {
    expect(formatQualitySource(piste)).toBe('Bandcamp MP3 128 kbit/s');
  });

  it('remplace « 44,1/16 » par le débit dans le mini-lecteur', () => {
    // 44,1/16 décrit le PCM APRÈS décodage, pas ce que Bandcamp a envoyé :
    // l'afficher là laisserait croire à du CD.
    expect(formatCompactQuality(piste)).toBe('MP3 128 kbit/s');
    expect(formatCompactQuality(piste)).not.toContain('44.1');
  });

  it('porte le débit dans l’infobulle du chemin du signal', () => {
    const info = formatQualityTooltip(piste);
    expect(info).toContain('Quality: Lossy');
    expect(info).toContain('Bitrate: 128 kbit/s');
  });

  it('ne touche à aucune autre source', () => {
    const qobuz = { format: 'flac', sample_rate: 96000, bit_depth: 24, source: 'qobuz' };
    expect(formatQualitySource(qobuz)).toBe('Qobuz 24/96');
    expect(formatCompactQuality(qobuz)).toBe('FLAC 96/24');
    expect(formatQualityTooltip(qobuz)).not.toContain('Bitrate');
  });
});
