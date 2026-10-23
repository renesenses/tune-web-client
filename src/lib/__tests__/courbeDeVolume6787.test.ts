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

  it('l’alignement sur la zone ne fait que BAISSER, et pose le GAIN publié', () => {
    mod.browserSetVolume(1, DB60);
    // `volume` du serveur est le gain (−30 dB = 0,0316) : posé tel quel.
    mod.browserAlignerSurLaZone({ ...DB60, volume: Math.pow(10, -1.5) });
    expect(db(get(mod.browserAudioVolume))).toBeCloseTo(-30, 9);
    // Une zone plus haute que l'élément ne le remonte pas.
    mod.browserAlignerSurLaZone({ ...DB60, volume: 0.9 });
    expect(db(get(mod.browserAudioVolume))).toBeCloseTo(-30, 9);
    // Muette : silence.
    mod.browserAlignerSurLaZone({ ...DB60, volume: 0.5, muted: true });
    expect(get(mod.browserAudioVolume)).toBe(0);
  });
});

/**
 * Décision de Bertrand du 23/10 : un volume enregistré se lit « au même
 * niveau en dB ». Le serveur garde `volume` = GAIN ; le client en lit le
 * curseur et le renvoie en gain.
 */
describe('conversion du curseur (gain du serveur ↔ position db60)', () => {
  const TOLERANCE = Math.pow(10, -0.01 / 20);

  it('ne monte jamais, et garde le niveau à 0,01 dB près (0..100 % par 0,1 %)', () => {
    const fautes: string[] = [];
    for (let i = 0; i <= 1000; i++) {
      const stocke = i / 1000;
      const curseur = volumeDepuisGain(DB60, stocke);
      const renvoye = gainDeLaZone(DB60, curseur);
      if (renvoye > stocke) fautes.push(`${stocke} → ${renvoye} (monte)`);
      if (renvoye < stocke * TOLERANCE) fautes.push(`${stocke} → ${renvoye} (−0,01 dB)`);
    }
    expect(fautes).toEqual([]);
    // 5 % de gain (−26 dB) se lisent à ~57 % sur le curseur.
    expect(volumeDepuisGain(DB60, 0.05)).toBeCloseTo(0.5663, 3);
  });

  it('rejouée, la conversion ne change plus rien', () => {
    const fautes: number[] = [];
    for (let i = 0; i <= 1000; i++) {
      const une = gainDeLaZone(DB60, volumeDepuisGain(DB60, i / 1000));
      let g = une;
      for (let k = 0; k < 10; k++) g = gainDeLaZone(DB60, volumeDepuisGain(DB60, g));
      if (g !== une) fautes.push(i);
    }
    expect(fautes).toEqual([]);
  });

  it('api.setVolume envoie le GAIN du curseur, et le curseur tel quel sans loi', async () => {
    const api = await import('../api');
    const corps: number[] = [];
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        corps.push(JSON.parse(init?.body ?? '{}').volume);
        return new Response(null, { status: 204 });
      }),
    );
    const { brancherZonePourLeCurseur } = await import('../courbeDeVolume');
    brancherZonePourLeCurseur((id) => (id === 1 ? DB60 : id === 2 ? { volume_curve: 'linear' } : null));
    await api.setVolume(1, 0.5);
    await api.setVolume(2, 0.5);
    await api.setVolume(3, 0.5);
    expect(db(corps[0])).toBeCloseTo(-30, 9);
    expect(corps[1]).toBe(0.5);
    expect(corps[2]).toBe(0.5);
    // Une valeur qui serait déjà un gain, relue comme un curseur, joue plus bas.
    for (const g of [0.01, 0.05, 0.3, 0.9]) expect(gainDeLaZone(DB60, g)).toBeLessThanOrEqual(g);
    brancherZonePourLeCurseur(() => null);
    vi.unstubAllGlobals();
  });

  it('les limites (gains) bornent le curseur à leur position', async () => {
    const { plafondDuCurseur, plusEnButee } = await import('../limitesVolume');
    const zone = { ...DB60, volume_limit_safety: Math.pow(10, -1.5), volume_limit_comfort: null };
    expect(plafondDuCurseur(zone, 0.2)).toBeCloseTo(0.5, 9);
    expect(plusEnButee(zone, 0.5)).toBe(true);
    expect(plusEnButee(zone, 0.4)).toBe(false);
    // Le pas calculé par le client (web#2292) s'arrête au même endroit.
    const { cibleDuPas } = await import('../limitesVolume');
    expect(cibleDuPas(zone, 0.495, 'up')).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(cibleDuPas(zone, 0.5, 'up')).toBe(0.5);
    expect(cibleDuPas(zone, 0.3, 'up')).toBeCloseTo(0.31, 9);
  });
});
