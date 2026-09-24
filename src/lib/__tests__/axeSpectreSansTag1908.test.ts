// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import { handleAudioLevelsEvent } from '../stores/audioLevels';

/**
 * 🔴 Fil 1908 — Didier, 24/09/2026, Windows, zone SMSL SU-8 (DAC USB local),
 * Qobuz 44,1 kHz rééchantillonné à 96 kHz, « PURE dégradé » : « manque
 * d'indication des fréquences sur l'analyseur de spectre. Cela arrive
 * aléatoirement sur un album Qobuz ».
 *
 * Sa capture : les barres s'animent, AUCUN repère dessous — et, sous le titre,
 * ni format, ni fréquence, ni badge de qualité. La piste de la file ne portait
 * aucune métadonnée audio.
 *
 * L'axe prenait sa fréquence d'échantillonnage dans la prop `sampleRate`
 * (`displayTrack.sample_rate`, NowPlaying) : `null` ⇒ `spectrumIsoTicks` rend
 * `[]` ⇒ pas d'échelle. Or chaque trame `playback.audio_levels` porte
 * `sample_rate`, la fréquence RÉELLEMENT analysée — et le store la jetait.
 *
 * Banc : le vrai composant, monté, nourri de trames telles que le serveur les
 * émet pour une source 44,1 kHz (fenêtre de 1764 trames, FFT 2048, 8 bandes
 * graves non résolues), et on lit ce qui est ÉCRIT sur le canevas.
 */

let instance: ReturnType<typeof mount> | null;
let host: HTMLDivElement;
let now: number;
let nextId: number;
let pending: Map<number, FrameRequestCallback>;
let fillText: ReturnType<typeof vi.fn>;
let zoneId = 190800;

/** Une trame telle que `spawn_paced_levels_forwarder` la publie à 44,1 kHz. */
function trame44k(avecTaux: boolean) {
  handleAudioLevelsEvent({
    zone_id: zoneId,
    rms_left_db: -18,
    rms_right_db: -18,
    peak_left_db: -9,
    peak_right_db: -9,
    spectrum: Array(32).fill(0.5),
    spectrum_db: Array.from({ length: 32 }, (_, b) => -20 - b),
    ...(avecTaux ? { sample_rate: 44100 } : {}),
    spectrum_fft_size: 2048,
    spectrum_frames: 1764,
    spectrum_resolution_hz: 25,
    // Largeur de bande ≥ 25 Hz à partir de la 9ᵉ : la règle du serveur.
    spectrum_resolved: Array.from({ length: 32 }, (_, b) => b >= 8),
  });
  flushSync();
}

function image() {
  now += 40;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const callback of callbacks) callback(now);
  flushSync();
}

/** Les étiquettes écrites sous les barres, dans l'ordre. */
function etiquettes(): string[] {
  return fillText.mock.calls.map((c) => String(c[0]));
}

function monter(sampleRate: number | null) {
  instance = mount(AudioVisualizer, {
    target: host,
    props: { playing: true, mode: 'spectrum', height: 80, sampleRate, zoneId },
  });
  flushSync();
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  nextId = 1;
  pending = new Map();
  instance = null;
  zoneId += 1;
  fillText = vi.fn();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => pending.delete(id)));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const context = new Proxy({ fillText }, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return (s: string) => ({ width: s.length * 5 });
      return () => {};
    },
    set() { return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, bottom: 80, right: 640,
    width: 640, height: 80, toJSON() {},
  });
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (instance) await unmount(instance);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fil 1908 — l’axe du spectre ne dépend plus des métadonnées de la piste', () => {
  it('piste Qobuz SANS métadonnée audio : l’échelle est tracée d’après la trame', () => {
    monter(null);
    trame44k(true);
    image();
    const vues = etiquettes();
    expect(
      vues.length,
      'aucune étiquette sous les barres : l’axe dépend encore du tag de la piste (capture du fil 1908)',
    ).toBeGreaterThan(0);
    // À 44,1 kHz, 25 Hz de résolution : la grille ISO tient dès 125 Hz.
    for (const attendu of ['125Hz', '1kHz', '16kHz']) expect(vues).toContain(attendu);
  });

  it('serveur qui n’annonce pas son taux, piste sans tag : rien n’est inventé', () => {
    monter(null);
    trame44k(false);
    image();
    expect(etiquettes()).toEqual([]);
  });

  it('serveur qui n’annonce pas son taux : le tag sert encore de repli', () => {
    monter(44100);
    trame44k(false);
    image();
    expect(etiquettes()).toContain('1kHz');
  });
});
