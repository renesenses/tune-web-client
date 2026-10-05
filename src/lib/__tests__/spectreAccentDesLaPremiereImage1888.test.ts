// @vitest-environment jsdom
//
// web#1888 (Didier, 1.0.0-rc1, fil 2049) : au démarrage, les barres du
// spectre sont bleues pendant environ une seconde, puis prennent la couleur du
// thème. `getAccent` gardait le bleu codé en dur (`#6B6ED9`) tant que la page
// avait moins de 2 s : son horodatage de relecture partait de 0, et celui des
// images compte depuis l'ouverture de la PAGE.
//
// Vrai composant monté ; seuls le contexte 2D, `requestAnimationFrame` et le
// style calculé (jsdom ne propage pas les variables CSS) sont simulés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import { handleAudioLevelsEvent } from '../stores/audioLevels';

const ACCENT_DU_THEME = '#E0457B';
const BLEU_DE_REPLI = '#6B6ED9';

let instance: ReturnType<typeof mount> | null = null;
let host: HTMLDivElement;
let now: number;
let pending: Map<number, FrameRequestCallback>;
let couleurs: string[];
const zoneId = 18880;

function frame() {
  now += 40;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const callback of callbacks) callback(now);
  flushSync();
}

beforeEach(() => {
  vi.useFakeTimers();
  // La page vient de s'ouvrir : 0,1 s.
  now = 100;
  let nextId = 1;
  pending = new Map();
  couleurs = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => pending.delete(id)));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const noter = (v: unknown) => { if (typeof v === 'string') couleurs.push(v); };
  const context = new Proxy({} as Record<string, unknown>, {
    get(_t, key) {
      if (key === 'createLinearGradient') return () => ({ addColorStop: (_o: number, c: string) => noter(c) });
      return () => {};
    },
    set(_t, key, v) {
      if (key === 'fillStyle' || key === 'strokeStyle') noter(v);
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, bottom: 80, right: 320, width: 320, height: 80, toJSON() {},
  });
  const vrai = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const s = vrai(el);
    return new Proxy(s, {
      get(target, key) {
        if (key === 'getPropertyValue') {
          return (p: string) => (p === '--tune-accent' ? ACCENT_DU_THEME : target.getPropertyValue(p));
        }
        const v = Reflect.get(target, key);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  });
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (instance) await unmount(instance);
  instance = null;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('#1888 — le spectre prend l’accent du thème dès la première image', () => {
  it('aucune barre dans le bleu de repli quand la page a moins de 2 s', () => {
    instance = mount(AudioVisualizer, { target: host, props: { playing: true, mode: 'spectrum', zoneId } });
    flushSync();
    handleAudioLevelsEvent({
      zone_id: zoneId, rms_left_db: -18, rms_right_db: -18,
      peak_left_db: -12, peak_right_db: -12, spectrum_db: Array(32).fill(-20),
    });
    flushSync();
    frame();
    expect(couleurs.length, 'rien n’a été dessiné — témoin sans objet').toBeGreaterThan(0);
    expect(couleurs.some((c) => c.toUpperCase().includes(ACCENT_DU_THEME.slice(1))
      || c.includes('224, 69, 123') || c.includes('224,69,123')), `couleurs : ${couleurs.join(' ')}`).toBe(true);
    expect(couleurs.filter((c) => c.toUpperCase().includes(BLEU_DE_REPLI.slice(1))
      || c.includes('107, 110, 217') || c.includes('107,110,217'))).toEqual([]);
  });
});
