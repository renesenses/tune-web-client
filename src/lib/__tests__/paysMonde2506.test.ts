// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { lirePaysMonde, paysMondeValides, URL_PAYS_MONDE } from '../paysMonde';
import { POINTS_TERRE } from '../champCercle/pointsTerre';
import { PAYS_TERRE } from '../champCercle/paysTerre';
import { ChampCercle } from '../champCercle/moteur';
import { construireScene } from '../champCercle/scene';
import { budgetScene } from '../champCercle/budget';
import { locale, preparerLocale } from '../i18n';
import SceneCercleV2 from '../../components/v2/SceneCercleV2.svelte';

const snapshot = { pays: { FR: 42, NL: '<5' }, maj: '2026-10-29T08:00:00Z' };
const frames: FrameRequestCallback[] = [];
const mounted: ReturnType<typeof mount>[] = [];
const reponse = (status: number, body: unknown) => ({ ok: status === 200, status,
  headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) }) as Response;
function contexte(events: { operation: string; color: string; args: unknown[] }[]) {
  const state: Record<PropertyKey, any> = {};
  return new Proxy(state, {
    get: (s, k) => {
      if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (['fillRect', 'fill', 'arc'].includes(String(k))) return (...args: unknown[]) => events.push({ operation: String(k), color: s.fillStyle, args });
      return k in s ? s[k] : () => {};
    }, set: (s, k, v) => { s[k] = v; return true; },
  });
}
const drainer = () => { let n = 0; while (frames.length && n++ < 30) frames.shift()!(16); expect(frames.length).toBe(0); };
beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frames.push(f); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.innerHTML = '';
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('projects only ISO country counts and never preserves exact small populations or identifiers', () => {
  const value = paysMondeValides({ pays: { FR: 42, NL: 4, US: '<5', EU: 90, ZZ: 20, GB: -1, DE: 5.5 }, maj: snapshot.maj,
    ip: 'private', servers: [{ name: 'private' }] });
  expect(value).toEqual({ pays: { FR: 42, NL: '<5', US: '<5' }, maj: snapshot.maj });
  expect(paysMondeValides({ pays: [], maj: snapshot.maj })).toBeNull();
  expect(paysMondeValides({ pays: {}, maj: 'invalid' })).toBeNull();
});

it('reads the public endpoint without cookies credentials or referrer', async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reponse(200, snapshot)); vi.stubGlobal('fetch', fetcher);
  expect(await lirePaysMonde()).toEqual(snapshot);
  expect(fetcher).toHaveBeenCalledWith(URL_PAYS_MONDE, expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
  expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('headers');
});

it.each([503, 404])('makes an unavailable country layer optional (%i)', async (status) => {
  vi.stubGlobal('fetch', vi.fn(async () => reponse(status, {})));
  expect(await lirePaysMonde()).toBeNull();
});

it('keeps ISO map units distinct, including metropolitan France and French Guiana', () => {
  const coordinates = POINTS_TERRE.split(',').map(Number);
  for (const [lat, lon, expected] of [[48.85, 2.35, 'FR'], [4.94, -52.33, 'GF']] as const) {
    let closest = 0; let distance = Infinity;
    for (let i = 0; i < coordinates.length / 2; i++) {
      const d = (coordinates[i * 2] / 10 - lat) ** 2 + (coordinates[i * 2 + 1] / 10 - lon) ** 2;
      if (d < distance) { distance = d; closest = i; }
    }
    expect(PAYS_TERRE.slice(closest * 2, closest * 2 + 2)).toBe(expected);
  }
});

it('tints real land particles before opt-in points and preserves those points when hidden', () => {
  expect(PAYS_TERRE.length / 2).toBe(POINTS_TERRE.split(',').length / 2);
  const events: { operation: string; color: string; args: unknown[] }[] = [];
  const canvas = document.createElement('canvas');
  (canvas as any).getContext = () => contexte(events);
  const engine = new ChampCercle(canvas, { budget: budgetScene({ largeur: 1000, lectureLocale: false, mouvementReduit: true }),
    couleurs: { public: '#00ffff' } });
  engine.redimensionner(800, 500);
  engine.majScene(construireScene({ moi: { nom: 'Moi', albums: 0, genres: [], lieu: null }, contacts: [], cercles: [], focus: null, maxAutour: 30, maxGrappes: 6 }));
  engine.majPointsPublics([{ lat: 0, lon: 0 }]); engine.vue('monde', true); drainer();
  events.length = 0; engine.majPays({ FR: 42 }, '#ff00ff'); drainer();
  const country = events.findIndex((e) => e.operation === 'fillRect' && e.color === '#ff00ff');
  const lastCountry = events.findLastIndex((e) => e.operation === 'fillRect' && e.color === '#ff00ff');
  const point = events.findIndex((e) => e.operation === 'fill' && e.color === '#00ffff');
  expect(country, 'country layer never reached the land renderer').toBeGreaterThanOrEqual(0);
  expect(point, 'opt-in points must be drawn above the country layer').toBeGreaterThan(lastCountry);
  const visiblePoint = events.filter((e) => e.operation === 'arc' && e.color === '#00ffff');
  events.length = 0; engine.majPays(null); drainer();
  expect(events.some((e) => e.color === '#ff00ff')).toBe(false);
  expect(events.filter((e) => e.operation === 'arc' && e.color === '#00ffff')).toEqual(visiblePoint);
  engine.detruire();
});

async function monterScene(countryStatus = 200) {
  await preparerLocale('fr'); locale.set('fr');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => contexte([]) as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url) === URL_PAYS_MONDE) return reponse(countryStatus, snapshot);
    if (String(url).endsWith('/me/location')) return reponse(200, { label: 'Paris', country_code: 'FR', lat: 48.5, lon: 2.5 });
    if (String(url).endsWith('/contacts/locations')) return reponse(200, []);
    if (String(url).endsWith('/world/points')) return reponse(200, [{ lat: 48, lon: 2 }]);
    if (String(url).endsWith('/me/public-map-opt-out')) return reponse(200, { public_map_opt_out: false });
    return reponse(200, {});
  }));
  const target = document.body.appendChild(document.createElement('div'));
  const component = mount(SceneCercleV2, { target, props: { contacts: [], cercles: [], partages: [], enAttente: 0 } as any });
  mounted.push(component); await tick(); flushSync(); return target;
}

it('mounts the World layer enabled by default, lists countries accessibly and only toggles its own renderer', async () => {
  const countries = vi.spyOn(ChampCercle.prototype, 'majPays');
  const points = vi.spyOn(ChampCercle.prototype, 'majPointsPublics');
  const target = await monterScene();
  await vi.waitFor(() => { flushSync(); expect(target.querySelector('.pays-monde')).not.toBeNull(); });
  const button = target.querySelector('.pays-monde [role=switch]') as HTMLButtonElement;
  expect(button.getAttribute('aria-checked')).toBe('true');
  expect(target.querySelector('.pays-monde table')?.textContent).toContain('Pays-Bas');
  expect(target.querySelector('.pays-monde table')?.textContent).toContain('Moins de 5');
  expect(countries).toHaveBeenCalledWith(expect.objectContaining({ FR: 42, NL: '<5' }), expect.anything());
  const before = points.mock.calls.map((x) => structuredClone(x));
  button.click(); await tick(); flushSync();
  expect(button.getAttribute('aria-checked')).toBe('false');
  expect(countries.mock.lastCall?.[0]).toBeNull();
  expect(points.mock.calls).toEqual(before);
  expect(target.querySelectorAll('[role=alert]')).toHaveLength(0);
});

it('keeps the existing World view and opt-in points without a red error when the country endpoint is down', async () => {
  const points = vi.spyOn(ChampCercle.prototype, 'majPointsPublics');
  const target = await monterScene(503);
  await vi.waitFor(() => expect(points).toHaveBeenCalledWith([{ lat: 48, lon: 2 }]));
  flushSync();
  expect(target.querySelector('.pays-monde')).toBeNull();
  expect(target.querySelectorAll('[role=alert]')).toHaveLength(0);
});
