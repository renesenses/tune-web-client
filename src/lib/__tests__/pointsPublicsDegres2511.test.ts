// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChampCercle } from '../champCercle/moteur';
import { budgetScene } from '../champCercle/budget';
import { construireScene } from '../champCercle/scene';
import { DEG, projeter } from '../champCercle/globe';
import { pointsPublicsValides } from '../circleMonde';

const frames: FrameRequestCallback[] = [];
const engines: ChampCercle[] = [];
const color = '#02ffdc';
function draw(points: { lat: number; lon: number }[]) {
  const arcs: number[][] = [];
  const state: Record<PropertyKey, any> = {};
  const context = new Proxy(state, {
    get(s, key) {
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'arc') return (...args: number[]) => { if (s.fillStyle === color) arcs.push(args); };
      return key in s ? s[key] : () => {};
    },
    set(s, key, value) { s[key] = value; return true; },
  });
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as any);
  const engine = new ChampCercle(canvas, { budget: budgetScene({ largeur: 1000, lectureLocale: false, mouvementReduit: true }), couleurs: { public: color } });
  engines.push(engine);
  engine.redimensionner(800, 500);
  engine.majScene(construireScene({ moi: { nom: 'Moi', albums: 0, genres: [], lieu: null }, contacts: [], cercles: [], focus: null, maxAutour: 30, maxGrappes: 6 }));
  engine.vue('monde', true);
  const flush = () => { let n = 0; while (frames.length && n++ < 30) frames.shift()!(16); expect(frames).toHaveLength(0); };
  flush(); arcs.length = 0;
  engine.majPointsPublics(points); flush();
  return { arcs, engine, flush };
}
beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frames.push(f); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { for (const e of engines.splice(0)) e.detruire(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  ['Paris', 48, 2], ['Cape Town', -34, 18], ['Quito', 0, -78], ['origin', 0, 0],
] as const)('projects the public degree position of %s at its geographic location', (_name, lat, lon) => {
  const input = pointsPublicsValides([{ lat, lon }]);
  expect(input).toEqual([{ lat, lon }]); // The HTTP/privacy contract remains in degrees.
  const { arcs, engine, flush } = draw(input);
  const [x, y, z] = projeter(lat * DEG, lon * DEG, 215, 400, 250, { lon0: 8 * DEG, tilt: 0.62 });
  expect(z).toBeGreaterThan(0.02);
  expect(arcs, 'a public city on the visible hemisphere must be drawn').toHaveLength(1);
  expect(arcs[0][0]).toBeCloseTo(x, 6); expect(arcs[0][1]).toBeCloseTo(y, 6);
  expect(arcs[0][2]).toBeCloseTo(1.4 + z * 1.6, 6);
  const first = [...arcs[0]]; arcs.length = 0;
  engine.majPointsPublics(input); flush();
  expect(arcs).toEqual([first]); expect(input).toEqual([{ lat, lon }]);
});

it('keeps a point on the hidden hemisphere hidden', () => {
  const { arcs } = draw([{ lat: 0, lon: 180 }]); expect(arcs).toHaveLength(0);
});
