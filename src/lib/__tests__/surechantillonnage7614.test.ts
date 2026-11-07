/**
 * tune-server-rust#7614 — l'écran du greffon de suréchantillonnage.
 *
 * Le serveur décide de tout ce qui touche au son (filtres admis par le test
 * de la machine, réserve de niveau, cadence ouverte). Ici, on garde ce que
 * l'écran en fait : quels filtres il propose, quel message de contrainte il
 * montre, comment il écrit la réserve, ses routes, et son câblage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  filtresProposes, filtreNonAdmis, cleContrainte, libelleReserve, reserveMaxDb, resumeMachine,
  reglageParDefaut, setSurechantillonnageZone, lancerLeTestDeLaMachine, cleFiltre,
  type FiltreSurechantillonnage,
} from '../surechantillonnage';
import fr from '../locales/fr';

vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const filtre = (id: string, reserves: Record<string, number> = { x8: -1.5 }): FiltreSurechantillonnage => ({
  id, minimum_phase: id.endsWith('-pm'), default: id === 'polyvalent', headroom_db: reserves,
});
const CATALOGUE = ['polyvalent', 'polyvalent-pm', 'precision', 'precision-pm', 'resolution', 'resolution-pm'].map((id) => filtre(id));

describe('choix proposés', () => {
  it('désactivé par défaut, filtre polyvalent, aucun plafond', () => {
    expect(reglageParDefaut()).toEqual({ enabled: false, filter: 'polyvalent', max_rate_hz: null, max_ratio: null });
  });

  it('seuls les filtres admis par la machine, plus celui déjà choisi', () => {
    const proposes = filtresProposes(CATALOGUE, ['polyvalent', 'resolution'], 'precision');
    expect(proposes.map((f) => f.id)).toEqual(['polyvalent', 'precision', 'resolution']);
    expect(filtreNonAdmis(['polyvalent', 'resolution'], 'precision')).toBe(true);
    expect(filtreNonAdmis(['polyvalent'], 'polyvalent')).toBe(false);
  });

  it('sans verdict de la machine, tout le catalogue (la mesure se fait au premier enregistrement)', () => {
    expect(filtresProposes(CATALOGUE, null, 'polyvalent')).toHaveLength(6);
    expect(filtreNonAdmis(null, 'precision')).toBe(false);
  });

  it('chaque contrainte du serveur a son message, « désactivé » n’en a pas', () => {
    expect(cleContrainte('premium_required')).toBe('upsampling.constraint.premium');
    expect(cleContrainte('plugin_not_installed')).toBe('upsampling.constraint.notInstalled');
    expect(cleContrainte('pure')).toBe('upsampling.constraint.pure');
    expect(cleContrainte('machine_test_missing')).toBe('upsampling.constraint.machineTest');
    expect(cleContrainte('disabled')).toBeNull();
    expect(cleContrainte(null)).toBeNull();
  });

  it('la réserve affichée est la plus forte baisse, en dB, avec le vrai signe moins', () => {
    expect(reserveMaxDb(filtre('precision', { x2: -0.8, x16: -2.25 }))).toBe(-2.25);
    expect(libelleReserve(-2.25, 'fr')).toBe('−2,25 dB');
    expect(libelleReserve(-2.25, 'en')).toBe('−2.25 dB');
  });

  it('le résumé de la machine compte les filtres, pas les couples', () => {
    const v = {
      simd_path: 'avx2+fma', margin: 3, measured_at: 0,
      results: [
        { filter: 'polyvalent', from_hz: 44100, to_hz: 352800, realtime_factor: 17, admitted: true },
        { filter: 'polyvalent', from_hz: 44100, to_hz: 705600, realtime_factor: 11, admitted: true },
        { filter: 'precision', from_hz: 44100, to_hz: 705600, realtime_factor: 2.6, admitted: false },
      ],
    };
    expect(resumeMachine(v)).toEqual({ admis: 1, total: 2 });
    expect(resumeMachine(null)).toBeNull();
  });
});

describe('routes', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  const reponse = (corps: unknown) => new Response(JSON.stringify(corps), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

  it('PUT /upsampler/zones/{id} porte le réglage complet', async () => {
    const appel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponse({ settings: reglageParDefaut() }));
    await setSurechantillonnageZone(4, { ...reglageParDefaut(), enabled: true, max_ratio: 8 });
    const [url, init] = appel.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/upsampler\/zones\/4$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true, filter: 'polyvalent', max_rate_hz: null, max_ratio: 8 });
  });

  it('POST /upsampler/machine-test remesure', async () => {
    const appel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponse({ machine_test: null }));
    await lancerLeTestDeLaMachine();
    const [url, init] = appel.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/upsampler\/machine-test$/);
    expect(init.method).toBe('POST');
  });
});

describe('câblage de l’écran', () => {
  const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'];

  it('la vue `surechantillonnage` monte l’écran, et la carte du greffon l’ouvre', () => {
    expect(lire('src/components/v2/ShellV2.svelte')).toMatch(
      /\$activeView === 'surechantillonnage'\}\s*<SurechantillonnageV2 \/>/,
    );
    const plugins = lire('src/components/v2/PluginsV2.svelte');
    expect(plugins).toContain("p.name === 'upsampler' && isActive(p)");
    expect(plugins).toContain("activeView.set('surechantillonnage')");
    expect(plugins).toMatch(/DSP_PURE = new Set\(\[[^\]]*'upsampler'/);
  });

  it('l’écran dit le bit-perfect perdu, PURE, et la piste suivante', () => {
    const ecran = lire('src/components/v2/SurechantillonnageV2.svelte');
    expect(ecran).toContain("$t('upsampling.bitPerfect'");
    expect(ecran).toContain("$t('upsampling.nextTrack'");
    expect(fr['upsampling.bitPerfect']).toMatch(/bit-perfect/);
    expect(fr['upsampling.bitPerfect']).toMatch(/PURE/);
    expect(fr['upsampling.nextTrack']).toMatch(/piste suivante/);
  });

  it('chaque clef de l’écran existe dans les quinze langues', () => {
    const ecran = lire('src/components/v2/SurechantillonnageV2.svelte') + lire('src/lib/surechantillonnage.ts');
    const cles = new Set([...ecran.matchAll(/'(upsampling\.[A-Za-z.]+)'/g)].map((m) => m[1]));
    for (const id of ['polyvalent', 'polyvalent-pm', 'precision', 'precision-pm', 'resolution', 'resolution-pm']) {
      cles.add(cleFiltre(id));
    }
    cles.add('licenseFeature.upsampling');
    expect(cles.size).toBeGreaterThan(25);
    for (const l of LANGUES) {
      const source = lire(`src/lib/locales/${l}.ts`);
      const manquantes = [...cles].filter((c) => !source.includes(`"${c}"`));
      expect(manquantes, l).toEqual([]);
    }
  });
});
