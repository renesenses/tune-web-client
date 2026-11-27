// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zones } from './zones';
import { browserAudioDestroy, browserAudioVolume, browserPlay, browserSetVolume,
  browserStop, browserVolumeDistant, preparerPleinVolumeNavigateur } from './browserAudio';

describe('volume du média qui joue dans cet onglet', () => {
  let audio: HTMLAudioElement;
  const jouer = (zoneId: number) => browserPlay('/stream', false, zoneId);
  beforeEach(() => {
    vi.useFakeTimers();
    audio = document.createElement('audio');
    audio.load = vi.fn();
    audio.pause = vi.fn();
    audio.play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('Audio', function () { return audio; });
    browserAudioVolume.set(0.02);
    jouer(1);
  });
  afterEach(() => {
    browserAudioDestroy();
    zones.set([]);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sans geste local, les échos peuvent uniquement baisser le niveau', () => {
    browserVolumeDistant(1, 0.9);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.02);
    browserVolumeDistant(1, 0.01);
    expect(audio.volume).toBe(0.01);
    browserVolumeDistant(1, 1);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.01);
  });

  it('oublie la consigne au changement de propriétaire, même si l’URL reste la même', () => {
    browserSetVolume(0.6, { id: 1 });
    browserVolumeDistant(1, 0.02);
    jouer(2);
    browserVolumeDistant(2, 0.9);
    jouer(1);
    browserVolumeDistant(1, 0.9);
    vi.advanceTimersByTime(600);
    expect(audio.volume).toBe(0.02);
  });

  it('un geste destiné à une autre zone ne change ni le niveau ni le plafond du lecteur', () => {
    browserSetVolume(0.9, { id: 2 });
    expect(audio.volume).toBe(0.02);
    browserVolumeDistant(1, 0.9);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.02);
  });

  it('après une baisse, remonte en 500 ms dans la double limite locale et distante', () => {
    browserSetVolume(0.4, { id: 1 });
    browserVolumeDistant(1, 0.02);
    browserVolumeDistant(1, 0.9);
    expect(audio.volume).toBe(0.02);
    let precedent = audio.volume;
    for (let i = 1; i <= 20; i++) {
      vi.advanceTimersByTime(25);
      expect(audio.volume).toBeGreaterThan(precedent);
      expect(audio.volume - precedent).toBeLessThanOrEqual(0.02001);
      expect(audio.volume).toBeLessThanOrEqual(0.4);
      precedent = audio.volume;
    }
    expect(audio.volume).toBe(0.4);
    browserVolumeDistant(1, 0.01);
    browserVolumeDistant(1, 0.2);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.2);
    browserVolumeDistant(1, 0.4);
    vi.advanceTimersByTime(100);
    browserVolumeDistant(1, 0);
    vi.advanceTimersByTime(600);
    expect(audio.volume).toBe(0);
  });

  it('borne immédiatement le média même si son niveau diverge de celui du magasin', () => {
    audio.volume = 0.9;
    browserSetVolume(0.4, { id: 1 }, { attendreAccord: true });
    expect(audio.volume).toBe(0.02);
    audio.volume = 0.8;
    browserVolumeDistant(1, 0.3);
    expect(audio.volume).toBe(0.02);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.3);
  });

  it('une zone déjà en PURE à plein niveau démarre en silence sur un lecteur neuf', () => {
    browserStop();
    browserAudioVolume.set(1);
    zones.set([{ id: 4, name: 'Ce navigateur', output_type: 'browser', volume: 1, volume_limits_refusal: 'limite_refusee_zone_pure' }]);
    jouer(4);
    browserVolumeDistant(4, 1);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0);
    preparerPleinVolumeNavigateur(4)!();
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(1);
  });

  it('atteint le plein volume uniquement après confirmation pour la même lecture', () => {
    const confirme = preparerPleinVolumeNavigateur(1)!;
    browserVolumeDistant(1, 1);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.02);
    confirme();
    vi.advanceTimersByTime(250);
    expect(audio.volume).toBeCloseTo(0.51);
    vi.advanceTimersByTime(250);
    expect(audio.volume).toBe(1);
    const perime = preparerPleinVolumeNavigateur(1)!;
    browserSetVolume(0.02, { id: 1 });
    perime();
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.02);
    browserVolumeDistant(1, 0.01);
    browserVolumeDistant(1, 0.02);
    browserStop();
    jouer(1);
    browserVolumeDistant(1, 1);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(0.01);
  });
});
