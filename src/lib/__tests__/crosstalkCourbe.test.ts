// @vitest-environment jsdom
//
// Crosstalk — la courbe séparation / coloration de l'écran de réglage.
//
// Les chiffres viennent du greffon : `crosstalkCourbe33deg.fixture.json` est
// le bloc `curve` de ses diagnostics, ÉCRIT PAR LE GREFFON LUI-MÊME pour la
// géométrie 33,4°, 2,7 m (séparation visée 6 dB, plafond 6 dB). L'hôte le
// relaie par `POST /api/v1/audio-plugins/crosstalk/diagnostics`. Ce banc
// vérifie que l'écran dessine CETTE table : 6 dB visés → latéral +1,7 dB,
// centre +1,8 dB, réglage marqué à 6 dB, pointillé au-delà du plafond.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { currentZoneId, zones } from '../stores/zones';
import { licenseState } from '../stores/license';
import { presenceCrosstalk } from '../stores/crosstalk';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { courbeCrosstalk, dbSigne, traceCourbeCrosstalk } from '../crosstalk';
import CrosstalkV2 from '../../components/v2/CrosstalkV2.svelte';
import COURBE from './crosstalkCourbe33deg.fixture.json';

vi.setConfig({ testTimeout: 20_000 });

const ZONE = 2253;
const RACINE = '/audio-plugins/crosstalk';
const REGLAGE = {
  enabled: true, separation_db: 6, angle_deg: 33.4, distance_m: 2.7,
  band_low_hz: 250, band_high_hz: 5000, gain_ceiling_db: 6,
};

describe('Crosstalk — lecture de la courbe du greffon', () => {
  it('🔴 la table du greffon, géométrie 33,4° / 2,7 m : 6 dB → latéral +1,7, centre +1,8', () => {
    const c = courbeCrosstalk({ curve: COURBE })!;
    expect(c).toBeTruthy();
    expect(c.points).toHaveLength(19);
    expect(c.points[0].cible).toBe(3);
    expect(c.points.at(-1)!.cible).toBe(12);
    const six = c.points.find((p) => p.cible === 6)!;
    expect(dbSigne(six.side)).toBe('+1.7');
    expect(dbSigne(six.centre)).toBe('+1.8');
    expect(six.atteignable).toBe(true);
    // Plafond 6 dB : jusqu'à 11 dB, pas au-delà.
    expect(c.points.find((p) => p.cible === 11)!.atteignable).toBe(true);
    expect(c.points.find((p) => p.cible === 11.5)!.atteignable).toBe(false);
    expect(c.courant).toMatchObject({ cible: 6, separation: 6, plafonne: false });
    expect(dbSigne(c.courant!.side)).toBe('+1.7');
    expect(dbSigne(c.courant!.centre)).toBe('+1.8');
  });

  it('une courbe absente ou illisible ne donne rien', () => {
    expect(courbeCrosstalk(null)).toBeNull();
    expect(courbeCrosstalk({ gain: 0.2 })).toBeNull();
    expect(courbeCrosstalk({ curve: { points: 'x' } })).toBeNull();
    expect(courbeCrosstalk({ curve: { points: [{ target_db: 3, separation_db: NaN }] } })).toBeNull();
  });

  it('le tracé : abscisse 3 → 12 dB, coloration croissante vers le haut, réglage sur la courbe', () => {
    const c = courbeCrosstalk({ curve: COURBE })!;
    const tr = traceCourbeCrosstalk(c);
    expect(tr.x(3)).toBeLessThan(tr.x(12));
    expect(tr.y(1)).toBeLessThan(tr.y(0));
    // La partie atteignable s'arrête à 11 dB ; la courbe entière va à 12.
    expect(tr.side.atteignable.split(' ')).toHaveLength(17);
    expect(tr.side.entiere.split(' ')).toHaveLength(19);
    // Le point du réglage est le sommet « 6 dB » de la courbe.
    const sommet = tr.side.entiere.split(' ')[6].split(',').map(Number);
    expect(tr.courant!.x).toBeCloseTo(sommet[0], 1);
    expect(tr.courant!.ySide).toBeCloseTo(sommet[1], 1);
    // Tout le tracé reste dans les graduations.
    expect(Math.max(...tr.graduationsY)).toBeGreaterThanOrEqual(Math.max(...c.points.map((p) => p.centre)));
  });

  it('les libellés de la courbe existent dans toutes les langues', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of ['curve', 'curveNote', 'curveSide', 'curveCentre', 'curveAxisX', 'curveAxisY', 'curveCurrent', 'curveCapped']) {
        expect(d[`v2.xtc.${cle}`], `${langue} : v2.xtc.${cle}`).toBeTruthy();
      }
      for (const jeton of ['{sep}', '{side}', '{centre}']) expect(d['v2.xtc.curveCurrent']).toContain(jeton);
      // Rien que « Crosstalk » et la courbe : aucun autre produit nommé.
      expect(d['v2.xtc.curveNote']).not.toMatch(/crossfeed/i);
    }
  });
});

function reponse(status: number, corps: unknown): Response {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let diagnostics: { status: number; corps: unknown };
let demandes: Record<string, unknown>[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  demandes = [];
  diagnostics = { status: 200, corps: { plugin: 'crosstalk', diagnostics: { gain: 0.2, curve: COURBE } } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (u.includes(`${RACINE}/diagnostics`) && method === 'POST') {
      demandes.push(JSON.parse(String(init!.body)));
      return reponse(diagnostics.status, diagnostics.corps);
    }
    if (u.includes(`${RACINE}/zones/`)) {
      if (method === 'GET') return reponse(200, { plugin: 'crosstalk', zone_id: ZONE, settings: REGLAGE, active: true });
      return reponse(200, { plugin: 'crosstalk', zone_id: ZONE, settings: JSON.parse(String(init!.body)), applied_live: false });
    }
    if (u.endsWith(`${RACINE}/profiles`)) return reponse(200, { profiles: [] });
    return reponse(200, /\/(zones|devices|presets|plugins|profiles)(\?|$)/.test(u) ? [] : {});
  }));
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium' }));
  zones.set([{ id: ZONE, name: 'Salon', state: 'stopped', channel_layout: null } as any]);
  currentZoneId.set(ZONE);
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  presenceCrosstalk.set('inconnue');
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

const q = (sel: string) => cible!.querySelector(sel) as HTMLElement | null;
const monter = async () => {
  monte = mount(CrosstalkV2, { target: cible! });
  await jusqua(() => !!q('fieldset.reglages'));
};

describe('Crosstalk — la courbe à l’écran', () => {
  it('🔴 dessinée depuis les diagnostics du greffon, réglage en cours marqué à 6 dB (+1.7 / +1.8)', async () => {
    await monter();
    await jusqua(() => !!q('[data-xtc="courbe"]'));
    expect(q('[data-xtc="courbe"]'), 'courbe absente').toBeTruthy();
    // La demande porte la géométrie réglée de la zone.
    expect(demandes.at(-1)).toMatchObject({ angle_deg: 33.4, distance_m: 2.7, separation_db: 6, gain_ceiling_db: 6 });
    const resume = q('[data-xtc="courbe-resume"]')!.textContent!;
    expect(resume).toContain('6.0');
    expect(resume).toContain('+1.7');
    expect(resume).toContain('+1.8');
    expect(q('[data-xtc="courbe-plafonne"]')).toBeNull();
    // Le point du réglage est à l'abscisse « 6 dB » du tracé.
    const tr = traceCourbeCrosstalk(courbeCrosstalk({ curve: COURBE })!);
    const point = q('[data-xtc="courbe-courant"] circle.side') as unknown as SVGCircleElement;
    expect(Number(point.getAttribute('cx'))).toBeCloseTo(tr.x(6), 1);
    // Légende dans la langue de l'interface.
    const c = q('[data-xtc="courbe"]')!.textContent!;
    expect(c).toContain(get(t)('v2.xtc.curveSide' as any));
    expect(c).toContain(get(t)('v2.xtc.curveCentre' as any));
  });

  it('bouger l’angle redemande la courbe pour la nouvelle géométrie', async () => {
    await monter();
    await jusqua(() => demandes.length > 0);
    const avant = demandes.length;
    const angle = q('input[data-xtc="angle_deg"]') as HTMLInputElement;
    angle.value = '45';
    angle.dispatchEvent(new Event('input', { bubbles: true }));
    await jusqua(() => demandes.some((d) => d.angle_deg === 45), 3000);
    expect(demandes.length).toBeGreaterThan(avant);
    expect(demandes.at(-1)!.angle_deg).toBe(45);
  });

  it('serveur sans la route (404) : pas de courbe, pas d’erreur affichée', async () => {
    diagnostics = { status: 404, corps: { error: 'not found' } };
    await monter();
    await jusqua(() => demandes.length > 0);
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
    expect(q('[data-xtc="courbe"]')).toBeNull();
    expect(q('.err')).toBeNull();
  });
});
