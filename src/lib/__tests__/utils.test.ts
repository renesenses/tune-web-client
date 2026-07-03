import { describe, it, expect } from 'vitest';
import { getQualityTier } from '../utils';

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
});
