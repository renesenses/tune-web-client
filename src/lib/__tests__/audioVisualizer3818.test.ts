// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import { handleAudioLevelsEvent } from '../stores/audioLevels';
import { visualizerControls3818 } from './visualizerControls3818.svelte';

let controls: ReturnType<typeof visualizerControls3818>;
let instance: ReturnType<typeof mount> | null;
let host: HTMLDivElement;
let now: number;
let nextId: number;
let pending: Map<number, FrameRequestCallback>;
let clearRect: ReturnType<typeof vi.fn>;
let fill: ReturnType<typeof vi.fn>;
let zoneId = 38180;

function levels() {
  handleAudioLevelsEvent({
    zone_id: zoneId, rms_left_db: -18, rms_right_db: -18,
    peak_left_db: -12, peak_right_db: -12,
    spectrum_db: Array(32).fill(-20),
  });
  flushSync();
}

function frame() {
  now += 40;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const callback of callbacks) callback(now);
  flushSync();
}

function render() {
  controls = visualizerControls3818();
  instance = mount(AudioVisualizer, {
    target: host,
    props: {
      get playing() { return controls.playing; },
      get mode() { return controls.mode; },
      zoneId,
    },
  });
  flushSync();
  levels();
  frame();
  expect(fill).toHaveBeenCalled();
  expect(pending.size).toBe(1);
}

function pause() {
  controls.playing = false;
  flushSync();
  frame();
  expect(pending.size).toBe(0);
}

function resume() {
  controls.playing = true;
  flushSync();
  levels();
  const drawings = fill.mock.calls.length;
  expect(pending.size).toBe(1);
  frame();
  expect(fill.mock.calls.length).toBeGreaterThan(drawings);
  expect(pending.size).toBe(1);
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  nextId = 1;
  pending = new Map();
  instance = null;
  zoneId += 1;
  clearRect = vi.fn();
  fill = vi.fn();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => pending.delete(id)));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const context = new Proxy({ clearRect, fill }, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() { return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, bottom: 80, right: 320,
    width: 320, height: 80, toJSON() {},
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

describe('cycle réel du visualiseur #3818', () => {
  it('reprend le dessin après une pause avant les 2500 ms de masquage', () => {
    render();
    pause();
    vi.advanceTimersByTime(200);
    now += 200;
    expect(host.querySelector('.visible')).not.toBeNull();
    resume();
  });

  it('reprend après une pause dépassant le délai de masquage', () => {
    render();
    pause();
    vi.advanceTimersByTime(2600);
    now += 2600;
    flushSync();
    expect(host.querySelector('.visible')).toBeNull();
    resume();
  });

  it('change de mode en lecture avec une seule boucle de dessin', () => {
    render();
    for (const mode of ['spectrum', 'waveform', 'spectrum'] as const) {
      controls.mode = mode;
      flushSync();
      levels();
      expect(pending.size).toBe(1);
      const drawings = clearRect.mock.calls.length;
      frame();
      expect(clearRect.mock.calls.length).toBe(drawings + 1);
      expect(pending.size).toBe(1);
    }
  });

  it('annule aussi un rappel dont l’identifiant est zéro au démontage', async () => {
    nextId = 0; // Zéro est aussi un identifiant rAF valide.
    controls = visualizerControls3818();
    instance = mount(AudioVisualizer, { target: host, props: { playing: true, zoneId } });
    flushSync();
    expect(pending.size).toBe(1);
    expect(pending.has(0)).toBe(true);
    await unmount(instance);
    instance = null;
    expect(pending.size).toBe(0);
    const drawings = clearRect.mock.calls.length;
    frame();
    expect(clearRect.mock.calls.length).toBe(drawings);
  });

  it('nettoie la boucle après reprise et ne la recrée pas aux trames suivantes', async () => {
    render();
    pause();
    resume();
    await unmount(instance!);
    instance = null;
    expect(pending.size).toBe(0);
    levels();
    frame();
    expect(pending.size).toBe(0);
  });
});
