// @vitest-environment jsdom
/**
 * web#2657 — les frontières des pays sur le globe de la vue Monde : données
 * générées, découpe au limbe, fondu selon le zoom, pays sous le pointeur, et
 * le moteur qui ne les trace qu'au-delà du seuil.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decoderFrontieres, decoderPointsTerre, decouperPolyligne, paysSous, projeter, DEG } from '../champCercle/globe';
import { couleurFrontiere, opaciteFrontieres, PLEIN_FRONTIERES, SEUIL_FRONTIERES } from '../champCercle/zoomGlobe';
import { FLEUVES_TERRE } from '../champCercle/fleuvesTerre';
import { COTES_TERRE, FRONTIERES_TERRE } from '../champCercle/frontieresTerre';
import { POINTS_TERRE } from '../champCercle/pointsTerre';
import { PAYS_TERRE } from '../champCercle/paysTerre';
import { ChampCercle } from '../champCercle/moteur';
import { construireScene } from '../champCercle/scene';
import { budgetScene } from '../champCercle/budget';

const FACE = { lon0: 0, tilt: 0 };
const R = 100; const CX = 200; const CY = 150;
const poly = (...pts: [number, number][]) => Float32Array.from(pts.flatMap(([la, lo]) => [la * DEG, lo * DEG]));

describe('données des frontières', () => {
  const fichier = readFileSync(join(process.cwd(), 'src/lib/champCercle/frontieresTerre.ts'), 'utf8');

  it('pèse 96 Ko au plus (frontières et côtes ensemble, web#2697) et porte sa source et son empreinte en tête', () => {
    expect(Buffer.byteLength(fichier, 'utf8')).toBeLessThanOrEqual(96 * 1024);
    expect(fichier).toMatch(/Source : https:\/\/\S+countries-110m\.json/);
    expect(fichier).toMatch(/Source SHA256 : [0-9a-f]{64}/);
    expect(fichier).toContain('Natural Earth');
  });

  it('se décode en polylignes de lieux valides', () => {
    const polys = decoderFrontieres(FRONTIERES_TERRE);
    expect(polys.length).toBeGreaterThan(200);
    for (const p of polys) {
      expect(p.length % 2).toBe(0);
      expect(p.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < p.length; i += 2) {
        expect(Math.abs(p[i])).toBeLessThanOrEqual(90 * DEG + 1e-6);
        expect(Math.abs(p[i + 1])).toBeLessThanOrEqual(180 * DEG + 1e-6);
      }
    }
  });

  it('écarte les morceaux vides ou d’un seul point', () => {
    expect(decoderFrontieres('10,20,30,40;;5,5;x,y,1,2,3,4')).toHaveLength(2);
  });
});

describe('données des côtes (web#2697)', () => {
  it('se décode en polylignes de lieux valides, distinctes des frontières', () => {
    const cotes = decoderFrontieres(COTES_TERRE);
    expect(cotes.length).toBeGreaterThan(150);
    expect(COTES_TERRE).not.toBe(FRONTIERES_TERRE);
    for (const p of cotes) {
      expect(p.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < p.length; i += 2) {
        expect(Math.abs(p[i])).toBeLessThanOrEqual(90 * DEG + 1e-6);
        expect(Math.abs(p[i + 1])).toBeLessThanOrEqual(180 * DEG + 1e-6);
      }
    }
  });

  it('contient la côte atlantique française, près de 47°N, 2,5°O', () => {
    const proche = decoderFrontieres(COTES_TERRE).some((p) => {
      for (let i = 0; i < p.length; i += 2) {
        if (Math.abs(p[i] / DEG - 47) < 1.2 && Math.abs(p[i + 1] / DEG + 2.5) < 1.2) return true;
      }
      return false;
    });
    expect(proche).toBe(true);
  });

  it('ne coupe aucune côte d’un saut de plus de 180° (antiméridien)', () => {
    for (const p of decoderFrontieres(COTES_TERRE)) {
      for (let i = 2; i < p.length; i += 2) expect(Math.abs(p[i + 1] - p[i - 1])).toBeLessThanOrEqual(180 * DEG + 1e-6);
    }
  });
});

describe('données des fleuves (web#2697)', () => {
  const fichier = readFileSync(join(process.cwd(), 'src/lib/champCercle/fleuvesTerre.ts'), 'utf8');
  it('pèse 16 Ko au plus et porte sa source, son empreinte et Natural Earth', () => {
    expect(Buffer.byteLength(fichier, 'utf8')).toBeLessThanOrEqual(16 * 1024);
    expect(fichier).toMatch(/Source : https:\/\/\S+ne_110m_rivers_lake_centerlines\.geojson/);
    expect(fichier).toMatch(/Source SHA256 : [0-9a-f]{64}/);
    expect(fichier).toContain('Natural Earth');
  });
  it('se décode et contient un point du Danube, près de 48°N, 17°E', () => {
    const fleuves = decoderFrontieres(FLEUVES_TERRE);
    expect(fleuves.length).toBeGreaterThanOrEqual(10);
    const danube = fleuves.some((p) => {
      for (let i = 0; i < p.length; i += 2) if (Math.abs(p[i] / DEG - 48) < 1.5 && Math.abs(p[i + 1] / DEG - 17) < 2.5) return true;
      return false;
    });
    expect(danube).toBe(true);
  });
});

describe('découpe au limbe', () => {
  it('garde entière une polyligne de la face visible, à la place que donne la projection', () => {
    const t = decouperPolyligne(poly([0, -10], [0, 0], [10, 10]), R, CX, CY, FACE);
    expect(t).toHaveLength(1);
    expect(t[0]).toHaveLength(6);
    const [x, y] = projeter(10 * DEG, 10 * DEG, R, CX, CY, FACE);
    expect(t[0][4]).toBeCloseTo(x, 4); expect(t[0][5]).toBeCloseTo(y, 4);
  });

  it('ne rend rien pour une polyligne entièrement cachée derrière le globe', () => {
    expect(decouperPolyligne(poly([0, 170], [10, 180], [20, -170]), R, CX, CY, FACE)).toEqual([]);
  });

  it('coupe sur le cercle du limbe un segment qui passe derrière le globe', () => {
    const t = decouperPolyligne(poly([0, 60], [0, 120]), R, CX, CY, FACE);
    expect(t).toHaveLength(1);
    const [x0, y0, x1, y1] = t[0];
    expect(Math.hypot(x0 - CX, y0 - CY)).toBeLessThan(R);
    expect(Math.hypot(x1 - CX, y1 - CY)).toBeCloseTo(R, 6);
    // Et dans l'autre sens : le tronçon commence au limbe.
    const r = decouperPolyligne(poly([0, 120], [0, 60]), R, CX, CY, FACE);
    expect(Math.hypot(r[0][0] - CX, r[0][1] - CY)).toBeCloseTo(R, 6);
  });

  it('rend deux tronçons pour une polyligne qui ressort de derrière le globe', () => {
    expect(decouperPolyligne(poly([0, 60], [0, 150], [0, -150], [0, -60]), R, CX, CY, FACE)).toHaveLength(2);
  });
});

describe('fondu selon le zoom', () => {
  it('est nul en deçà du seuil, plein au-delà, croissant entre les deux', () => {
    expect(SEUIL_FRONTIERES).toBe(2.5); expect(PLEIN_FRONTIERES).toBe(4);
    for (const k of [1, 1.6, 2, 2.4, 2.5]) expect(opaciteFrontieres(k)).toBe(0);
    expect(opaciteFrontieres(3)).toBeGreaterThan(0);
    expect(opaciteFrontieres(3)).toBeLessThan(1);
    expect(opaciteFrontieres(3.5)).toBeGreaterThan(opaciteFrontieres(3));
    for (const k of [4, 6, 12]) expect(opaciteFrontieres(k)).toBe(1);
    expect(opaciteFrontieres(Number.NaN)).toBe(0);
  });
});

describe('couleur des frontières', () => {
  it('garde le jeton des thèmes sombres et se replie sur la couleur claire de la scène dans les thèmes clairs', () => {
    // Le fond de la scène reste sombre : un jeton de texte atténué d'un thème clair y manque de contraste.
    for (const clair of ['#646E78', '#5F6770']) expect(couleurFrontiere(clair, '#9fb0b6'), clair).toBe('#9fb0b6');
    for (const sombre of ['#7D8EA1', '#7C8DA5', '#818AA9', '#9E8870', '#A6A6A6']) expect(couleurFrontiere(sombre, '#9fb0b6'), sombre).toBe(sombre);
    expect(couleurFrontiere('rgb(1, 2, 3)', '#9fb0b6')).toBe('rgb(1, 2, 3)');
  });
});

describe('pays sous le pointeur', () => {
  const terre = decoderPointsTerre(POINTS_TERRE);
  it.each([
    [48.85, 2.35, 'FR'], [52.5, 13.4, 'DE'], [40.4, -3.7, 'ES'], [-15.8, -47.9, 'BR'], [35.7, 139.7, 'JP'],
  ] as const)('(%f, %f) est en %s', (lat, lon, code) => {
    expect(paysSous({ lat, lon }, terre, PAYS_TERRE)).toBe(code);
  });

  it('rend null en pleine mer', () => {
    expect(paysSous({ lat: 30, lon: -40 }, terre, PAYS_TERRE)).toBeNull();
    expect(paysSous({ lat: -40, lon: 90 }, terre, PAYS_TERRE)).toBeNull();
  });

  it('rend null sur un point de terre sans pays', () => {
    expect(paysSous({ lat: 0, lon: 0 }, [[0, 0]], '--')).toBeNull();
  });
});

describe('le moteur', () => {
  const frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames.length = 0;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frames.push(f); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const drainer = () => { let n = 0; while (frames.length && n++ < 30) frames.shift()!(16); };

  function monter(surPays?: (p: { code: string; x: number; y: number } | null) => void) {
    const traits: { couleur: string; lignes: number }[] = [];
    let lignes = 0;
    const etat: Record<PropertyKey, any> = {};
    const ctx = new Proxy(etat, {
      get: (s, k) => {
        if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (k === 'beginPath') return () => { lignes = 0; };
        if (k === 'lineTo') return () => { lignes++; };
        if (k === 'stroke') return () => traits.push({ couleur: s.strokeStyle, lignes });
        return k in s ? s[k] : () => {};
      }, set: (s, k, v) => { s[k] = v; return true; },
    });
    const canvas = document.createElement('canvas');
    (canvas as any).getContext = () => ctx;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500, x: 0, y: 0, toJSON() {} });
    const m = new ChampCercle(canvas, { budget: budgetScene({ largeur: 1000, lectureLocale: false, mouvementReduit: true }),
      couleurs: { frontiere: '#ff0088', cote: '#00ccee', fleuve: '#33aa55' }, surPays });
    m.redimensionner(800, 500);
    m.majScene(construireScene({ moi: { nom: 'Moi', albums: 0, genres: [], lieu: null }, contacts: [], cercles: [], focus: null, maxAutour: 30, maxGrappes: 6 }));
    m.vue('monde', true);
    m.centrerSur(48.85, 2.35);
    drainer();
    const frontieres = () => traits.filter((t) => t.couleur === '#ff0088');
    const cotes = () => traits.filter((t) => t.couleur === '#00ccee');
    const fleuves = () => traits.filter((t) => t.couleur === '#33aa55');
    return { m, canvas, traits, frontieres, cotes, fleuves };
  }

  it('ne trace aucune frontière en deçà du seuil de zoom', () => {
    const { m, traits, frontieres, cotes, fleuves } = monter();
    for (const k of [1, 2, 2.4]) {
      traits.length = 0; m.zoomerA(k); drainer();
      expect(m.niveauZoom).toBeCloseTo(k, 6);
      expect(frontieres(), `zoom ×${k}`).toEqual([]);
      expect(cotes(), `côtes, zoom ×${k}`).toEqual([]);
      expect(fleuves(), `fleuves, zoom ×${k}`).toEqual([]);
    }
    m.detruire();
  });

  it('trace les frontières au-delà du seuil, en un seul tracé, à la couleur du thème', () => {
    const { m, traits, frontieres } = monter();
    m.zoomerA(4); drainer();
    expect(frontieres()).toHaveLength(1);
    expect(frontieres()[0].lignes).toBeGreaterThan(100);
    traits.length = 0;
    m.majCouleurs({ frontiere: '#00aa11' }); drainer();
    expect(traits.filter((t) => t.couleur === '#00aa11')).toHaveLength(1);
    m.detruire();
  });

  it('trace aussi les côtes (web#2697), en un tracé à leur couleur, et les suit au changement de thème', () => {
    const { m, traits, cotes, fleuves } = monter();
    m.zoomerA(4); drainer();
    expect(cotes()).toHaveLength(1);
    expect(cotes()[0].lignes).toBeGreaterThan(100);
    expect(fleuves()).toHaveLength(1);
    expect(fleuves()[0].lignes).toBeGreaterThan(10);
    traits.length = 0;
    m.majCouleurs({ cote: '#112233' }); drainer();
    expect(traits.filter((t) => t.couleur === '#112233')).toHaveLength(1);
    m.detruire();
  });

  it('dit le pays sous la souris au-delà du seuil, et rien en deçà', () => {
    const surPays = vi.fn();
    const { m, canvas } = monter(surPays);
    const survoler = () => canvas.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse', clientX: 400, clientY: 250, pointerId: 1 }));
    m.zoomerA(2); drainer(); survoler();
    expect(surPays).not.toHaveBeenCalled();
    m.zoomerA(4); drainer(); survoler();
    expect(surPays).toHaveBeenLastCalledWith({ code: 'FR', x: 400, y: 250 });
    m.vueEntiere();
    expect(surPays).toHaveBeenLastCalledWith(null);
    m.detruire();
  });

  it('au toucher, garde le nom après un appui long tant que le doigt ne glisse pas vraiment', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const surPays = vi.fn();
      const { m, canvas } = monter(surPays);
      m.zoomerA(4); drainer();
      const doigt = (type: string, x: number, y: number) =>
        canvas.dispatchEvent(Object.assign(new Event(type), { pointerType: 'touch', clientX: x, clientY: y, pointerId: 7 }));
      const lon = () => (m as any).G.lon0 as number;
      doigt('pointerdown', 400, 250);
      vi.advanceTimersByTime(450);
      expect(surPays).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(surPays).toHaveBeenLastCalledWith({ code: 'FR', x: 400, y: 250 });
      // Un doigt posé tremble : 1 à 2 px ne font ni tourner le globe ni partir le nom.
      const lon0 = lon();
      doigt('pointermove', 401, 251);
      doigt('pointermove', 402, 249);
      expect(surPays).toHaveBeenLastCalledWith({ code: 'FR', x: 400, y: 250 });
      expect(lon(), 'le globe a tourné').toBe(lon0);
      // Un vrai glisser efface le nom et fait tourner le globe.
      doigt('pointermove', 430, 250);
      expect(surPays).toHaveBeenLastCalledWith(null);
      expect(lon()).not.toBe(lon0);
      doigt('pointerup', 430, 250);
      m.detruire();
    } finally { vi.useRealTimers(); }
  });

  it('au toucher, lever le doigt après un appui long ne compte pas comme un toucher', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const surPays = vi.fn();
      const { m, canvas } = monter(surPays);
      m.zoomerA(4); drainer();
      const doigt = (type: string) =>
        canvas.dispatchEvent(Object.assign(new Event(type), { pointerType: 'touch', clientX: 400, clientY: 250, pointerId: 7 }));
      doigt('pointerdown'); vi.advanceTimersByTime(600); doigt('pointerup');
      expect(surPays).toHaveBeenLastCalledWith({ code: 'FR', x: 400, y: 250 });
      // Un toucher juste après ne forme pas un double-tap avec l'appui long.
      doigt('pointerdown'); doigt('pointerup'); drainer();
      expect(m.niveauZoom).toBeCloseTo(4, 6);
      m.detruire();
    } finally { vi.useRealTimers(); }
  });
});
