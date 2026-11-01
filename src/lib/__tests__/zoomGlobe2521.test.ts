// @vitest-environment jsdom
/**
 * web#2521 (chantier web#2574) — zoomer sur une zone du globe de Tune Circle.
 *
 * La logique pure (`zoomGlobe.ts`) : bornes, molette, pincement, conversion
 * point de l'image ↔ lieu, retour à la vue entière. Puis le moteur réel
 * (`ChampCercle`) : le lieu visé reste sous le pointeur, les épingles gardent
 * leur taille à l'écran, une épingle sortie de la scène perd son bouton.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deprojeter, projeter, DEG } from '../champCercle/globe';
import {
  bornerInclinaison, bornerZoom, garderSous, rayonGlobe, vitesseGlisse, vueEntiere,
  zoomIntermediaire, zoomMolette, zoomPincement, ZOOM_MAX, ZOOM_MIN,
} from '../champCercle/zoomGlobe';
import { ChampCercle, type PlacementNoeud } from '../champCercle/moteur';
import { construireScene, idEpingle } from '../champCercle/scene';
import { budgetScene } from '../champCercle/budget';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('zoom du globe : logique pure', () => {
  it('borne le zoom entre la vue entière et le zoom maximal, NaN compris', () => {
    expect(bornerZoom(0.2)).toBe(ZOOM_MIN);
    expect(bornerZoom(1000)).toBe(ZOOM_MAX);
    expect(bornerZoom(3)).toBe(3);
    expect(bornerZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(bornerZoom(Infinity)).toBe(ZOOM_MAX);
    expect(bornerZoom(-Infinity)).toBe(ZOOM_MIN);
  });

  it('la molette vers le haut rapproche, vers le bas éloigne, sans franchir les bornes', () => {
    expect(zoomMolette(2, -100)).toBeGreaterThan(2);
    expect(zoomMolette(2, 100)).toBeLessThan(2);
    expect(zoomMolette(ZOOM_MAX, -10_000)).toBe(ZOOM_MAX);
    expect(zoomMolette(ZOOM_MIN, 10_000)).toBe(ZOOM_MIN);
    // Mode « lignes » (Firefox) : 3 lignes ≈ un cran de 48 px.
    expect(zoomMolette(2, -3, true)).toBeCloseTo(zoomMolette(2, -48), 10);
  });

  it('le pincement suit l’écart des doigts', () => {
    expect(zoomPincement(2, 100, 200)).toBe(4);
    expect(zoomPincement(2, 100, 50)).toBe(1);
    expect(zoomPincement(2, 100, 10)).toBe(ZOOM_MIN);
    expect(zoomPincement(3, 0, 50)).toBe(3);
  });

  it('zoomé, l’inclinaison permet les deux hémisphères ; en vue entière, les bornes d’origine', () => {
    expect(bornerInclinaison(-30 * DEG, 1)).toBeCloseTo(-0.3);
    expect(bornerInclinaison(-30 * DEG, 3)).toBeCloseTo(-30 * DEG);
    expect(bornerInclinaison(89 * DEG, 3)).toBeCloseTo(80 * DEG);
  });

  it('le rayon grandit avec le zoom, le glisser ralentit d’autant', () => {
    expect(rayonGlobe(100, 4)).toBe(400);
    expect(rayonGlobe(100, 99)).toBe(100 * ZOOM_MAX);
    expect(vitesseGlisse(4)).toBe(0.25);
  });

  it('la transition va d’un zoom à l’autre, bornée aux extrémités', () => {
    expect(zoomIntermediaire(1, 4, 0)).toBe(1);
    expect(zoomIntermediaire(1, 4, 1)).toBe(4);
    expect(zoomIntermediaire(1, 4, 2)).toBe(4);
    const mi = zoomIntermediaire(1, 4, 0.5);
    expect(mi).toBeGreaterThan(1); expect(mi).toBeLessThan(4);
  });

  it('« Vue entière » revient au zoom 1 et ramène l’inclinaison dans ses bornes', () => {
    expect(vueEntiere({ lon0: 1.2, tilt: -1 })).toEqual({ k: 1, lon0: 1.2, tilt: -0.3 });
    expect(vueEntiere({ lon0: 0, tilt: 0.5 })).toEqual({ k: 1, lon0: 0, tilt: 0.5 });
  });

  it('garde le lieu visé sous le pointeur quand le globe grossit (conversion des coordonnées)', () => {
    const W = 800; const H = 500; const cx = W / 2; const cy = H / 2; const R0 = 200;
    const o = { lon0: 8 * DEG, tilt: 0.62 };
    for (const [px, py] of [[480, 200], [330, 300], [400, 250], [520, 140]] as const) {
      const lieu = deprojeter(px, py, R0, cx, cy, o)!;
      expect(lieu).not.toBeNull();
      const k = 4;
      const o2 = garderSous(o, lieu, px, py, rayonGlobe(R0, k), cx, cy, k);
      const [x, y, z] = projeter(lieu.lat * DEG, lieu.lon * DEG, rayonGlobe(R0, k), cx, cy, o2);
      expect(z).toBeGreaterThan(0);
      expect(Math.hypot(x - px, y - py), `(${px}, ${py})`).toBeLessThan(0.5);
    }
  });
});

describe('zoom du globe : le moteur', () => {
  const frames: FrameRequestCallback[] = [];
  const drainer = () => { let n = 0; while (frames.length && n++ < 30) frames.shift()!(16); };
  beforeEach(() => {
    frames.length = 0;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frames.push(f); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function contexte() {
    const s: Record<PropertyKey, any> = {};
    return new Proxy(s, {
      get: (o, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k in o ? o[k] : () => {}),
      set: (o, k, v) => { o[k] = v; return true; },
    });
  }

  function monter() {
    const poses = new Map<string, PlacementNoeud | null>();
    const zooms: number[] = [];
    const canvas = document.createElement('canvas');
    (canvas as any).getContext = () => contexte();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500, x: 0, y: 0, toJSON() {} });
    // Image fixe (prefers-reduced-motion) : le zoom s'applique d'un coup, sans transition.
    const m = new ChampCercle(canvas, {
      budget: budgetScene({ largeur: 1000, lectureLocale: false, mouvementReduit: true }),
      placer: (id, p) => poses.set(id, p), surZoom: (k) => zooms.push(k),
    });
    m.redimensionner(800, 500);
    m.majScene(construireScene({
      moi: { nom: 'Moi', albums: 0, genres: [], lieu: { label: 'Paris', lat: 48.5, lon: 2.5 } },
      contacts: [
        { id: 7, nom: 'Berlin', albums: null, genres: [], lieu: { label: 'Berlin', lat: 52.5, lon: 13.5 } },
        { id: 9, nom: 'Moscou', albums: null, genres: [], lieu: { label: 'Moscou', lat: 55.5, lon: 37.5 } },
        { id: 8, nom: 'Sydney', albums: null, genres: [], lieu: { label: 'Sydney', lat: -34, lon: 151 } },
      ],
      cercles: [], focus: null, maxAutour: 30, maxGrappes: 6,
    }));
    m.vue('monde', true);
    m.centrerSur(48.5, 2.5);
    drainer();
    return { m, poses, zooms };
  }

  it('zoome sur le lieu visé : l’épingle reste sous le pointeur, sa taille à l’écran ne change pas', () => {
    const { m, poses, zooms } = monter();
    const avant = poses.get(idEpingle(7))!;
    expect(avant?.mode).toBe('pin');
    m.zoomerA(3, avant.x, avant.y);
    drainer();
    const apres = poses.get(idEpingle(7))!;
    expect(m.niveauZoom).toBe(3);
    expect(zooms.at(-1)).toBe(3);
    expect(Math.hypot(apres.x - avant.x, apres.y - avant.y)).toBeLessThan(1);
    expect(apres.r).toBe(avant.r);
    // Paris s'est éloigné de Berlin à l'écran : le zoom agrandit bien l'image.
    const paris = poses.get(idEpingle('moi'))!;
    expect(Math.hypot(paris.x - apres.x, paris.y - apres.y)).toBeGreaterThan(60);
    m.detruire();
  });

  it('borne le zoom et revient à la vue entière', () => {
    const { m, zooms } = monter();
    for (let i = 0; i < 20; i++) m.zoomer(2);
    drainer();
    expect(m.niveauZoom).toBe(ZOOM_MAX);
    m.vueEntiere();
    drainer();
    expect(m.niveauZoom).toBe(ZOOM_MIN);
    expect(zooms.at(-1)).toBe(ZOOM_MIN);
    m.zoomer(0.25);
    expect(m.niveauZoom).toBe(ZOOM_MIN);
    m.detruire();
  });

  it('zoomé sur Paris, une épingle sortie de la scène perd son bouton (Tab ne s’y perd pas)', () => {
    const { m, poses } = monter();
    expect(poses.get(idEpingle(9))).not.toBeNull();
    // Sydney, sur l'autre face, n'a jamais de bouton.
    expect(poses.get(idEpingle(8))).toBeNull();
    m.zoomerA(ZOOM_MAX, 400, 250);
    drainer();
    expect(poses.get(idEpingle('moi'))).not.toBeNull();
    expect(poses.get(idEpingle(9)), 'Moscou, hors champ au zoom maximal').toBeNull();
    m.detruire();
  });

  it('la molette du moteur zoome sous le curseur ; le double-clic double le zoom', () => {
    const { m } = monter();
    m.molette(-200, false, 400, 250);
    expect(m.niveauZoom).toBeGreaterThan(1);
    m.vueEntiere();
    const c = (m as any).canvas as HTMLCanvasElement;
    const tap = (type: string) => c.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, clientX: 400, clientY: 250 }));
    tap('pointerdown'); tap('pointerup'); tap('pointerdown'); tap('pointerup');
    expect(m.niveauZoom).toBe(2);
    m.detruire();
  });
});

describe('zoom du globe : l’écran', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/SceneCercleV2.svelte'), 'utf8');
  it('porte les boutons + / − / « Vue entière », la molette avec Ctrl ou Cmd et les touches + − 0', () => {
    expect(src).toContain('sc-zoom-plus');
    expect(src).toContain('sc-zoom-moins');
    expect(src).toContain('sc-zoom-entier');
    expect(src).toMatch(/e\.ctrlKey \|\| e\.metaKey/);
    expect(src).toMatch(/passive: false/);
    expect(src).toMatch(/ev\.key === '\+'/);
    expect(src).toMatch(/ev\.key === '0'/);
  });
});
