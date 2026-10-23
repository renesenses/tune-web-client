import { describe, it, expect, vi, beforeAll } from 'vitest';
import { get } from 'svelte/store';
import {
  gainPerceptif,
  positionPerceptive,
  gainDeLaZone,
  volumeDepuisGain,
  estPerceptive,
} from '../courbeDeVolume';

/**
 * tune-server-rust#6787 — « toute zone joue beaucoup trop fort » (ASR #49) :
 * le navigateur posait `audio.volume = curseur`, 50 % = −6 dB. La loi `db60`
 * du serveur (60 dB de course, droite sous 10 %) s'applique désormais à
 * l'élément `<audio>` d'une zone navigateur, et seulement quand le serveur la
 * publie (`volume_curve`).
 */

const db = (g: number) => 20 * Math.log10(g);
const DB60 = { volume_curve: 'db60' };

describe('loi db60 (miroir de volume_scale côté serveur)', () => {
  it('dB obtenus à 10, 25, 50 et 100 %', () => {
    expect(db(gainPerceptif(0.1))).toBeCloseTo(-54, 9);
    expect(db(gainPerceptif(0.25))).toBeCloseTo(-45, 9);
    expect(db(gainPerceptif(0.5))).toBeCloseTo(-30, 9);
    expect(gainPerceptif(1)).toBe(1);
    expect(gainPerceptif(0)).toBe(0);
  });

  it('ne rend JAMAIS plus de gain que l’ancienne loi linéaire', () => {
    const fautes: number[] = [];
    for (let i = 0; i <= 100_000; i++) {
      const p = i / 100_000;
      if (gainPerceptif(p) > p) fautes.push(p);
    }
    expect(fautes).toEqual([]);
  });

  it('est strictement croissante et s’inverse exactement', () => {
    let avant = 0;
    const fautes: number[] = [];
    for (let i = 1; i <= 10_000; i++) {
      const p = i / 10_000;
      const g = gainPerceptif(p);
      if (!(g > avant) || Math.abs(positionPerceptive(g) - p) > 1e-9) fautes.push(p);
      avant = g;
    }
    expect(fautes).toEqual([]);
  });

  it('ne s’applique que si le serveur publie db60', () => {
    expect(estPerceptive(DB60)).toBe(true);
    expect(estPerceptive({ volume_curve: 'linear' })).toBe(false);
    expect(estPerceptive({})).toBe(false); // serveur antérieur
    expect(estPerceptive(null)).toBe(false);
    expect(gainDeLaZone({}, 0.5)).toBe(0.5);
    expect(gainDeLaZone({ volume_curve: 'linear' }, 0.5)).toBe(0.5);
    expect(db(gainDeLaZone(DB60, 0.5))).toBeCloseTo(-30, 9);
    // Un dB tapé (−26 dB, le niveau cherché à 5 % par le testeur) revient à
    // la position qui le rend.
    expect(volumeDepuisGain(DB60, Math.pow(10, -26 / 20))).toBeCloseTo(0.5667, 3);
    expect(volumeDepuisGain({}, 0.3)).toBe(0.3);
  });
});

describe('élément <audio> d’une zone navigateur', () => {
  class FauxAudio {
    volume = 1;
    muted = false;
    src = '';
    crossOrigin = '';
    preload = '';
    addEventListener() {}
    removeEventListener() {}
    load() {}
    pause() {}
    play() {
      return Promise.resolve();
    }
  }
  let mod: typeof import('../stores/browserAudio');
  beforeAll(async () => {
    vi.stubGlobal('Audio', FauxAudio);
    mod = await import('../stores/browserAudio');
  });

  it('pose le GAIN de la loi db60, jamais plus que le curseur', () => {
    mod.browserSetVolume(0.5, DB60);
    expect(db(get(mod.browserAudioVolume))).toBeCloseTo(-30, 9);
    for (const v of [0, 0.01, 0.05, 0.1, 0.3, 0.57, 0.9, 1]) {
      mod.browserSetVolume(v, DB60);
      expect(get(mod.browserAudioVolume)).toBeLessThanOrEqual(v);
    }
  });

  it('reste linéaire sur un serveur antérieur (pas de volume_curve)', () => {
    mod.browserSetVolume(0.42, {});
    expect(get(mod.browserAudioVolume)).toBe(0.42);
    mod.browserSetVolume(0.37);
    expect(get(mod.browserAudioVolume)).toBe(0.37);
  });

  it('l’alignement sur la zone ne fait que BAISSER', () => {
    mod.browserSetVolume(1, DB60);
    mod.browserAlignerSurLaZone({ ...DB60, volume: 0.5 });
    expect(db(get(mod.browserAudioVolume))).toBeCloseTo(-30, 9);
    // Une zone dont le curseur est plus haut que l'élément ne le remonte pas.
    mod.browserAlignerSurLaZone({ ...DB60, volume: 0.9 });
    expect(db(get(mod.browserAudioVolume))).toBeCloseTo(-30, 9);
    // Muette : silence.
    mod.browserAlignerSurLaZone({ ...DB60, volume: 0.5, muted: true });
    expect(get(mod.browserAudioVolume)).toBe(0);
  });
});
