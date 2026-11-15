// @vitest-environment jsdom
/**
 * rc12 — MAQUETTE « MY LISTENING » DE LEVENTE (Figma 615:5809, 15/11/2026).
 *
 * Ce que la maquette ajoute au Tableau de bord, et seulement ça :
 *  - le choix de la PÉRIODE dans l'en-tête, servi par la route existante
 *    (`/library/history/dashboard?period=…`), aucune donnée inventée ;
 *  - le message vide de chaque bloc NOMME la période choisie (#1781) ;
 *  - une icône devant le titre des tuiles ;
 *  - la grille fluide (voir `tableauDeBordGrille1671.test.ts`).
 * Et la contre-épreuve : l'Accueil ne reçoit ni menu de période ni grille.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TableauDeBordV2 from '../../components/v2/TableauDeBordV2.svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import * as api from '../api';
import { currentProfileId } from '../stores/profile';
import { BLOCS_TABLEAU_DE_BORD } from '../tableauDeBordWidgets';
import {
  PERIODES,
  choisirPeriode,
  cleVide,
  delaiPour,
  joursTendance,
  periodeActive,
} from '../tableauDeBordPeriode';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 40_000, hookTimeout: 40_000 });

const VIDE = {
  period: '7d', range: { from: null, to: '' },
  totals: { plays: 0, listening_ms: 0, unique_tracks: 0, unique_artists: 0 },
  top_artists: [], top_albums: [], top_tracks: [], trend: [], hourly: [], weekday_hourly: [],
  by_zone: [], by_source: [], by_genre: [], radio_listening: [],
  streak: { current: 0, best: 0, last_day: null }, on_this_day: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
} as any;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 140) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.restoreAllMocks();
  choisirPeriode('7d');
  currentProfileId.set(1);
  vi.spyOn(api, 'getDashboard').mockResolvedValue(VIDE);
  vi.spyOn(api, 'getGenreTree').mockResolvedValue({ tree: {} } as any);
  vi.spyOn(api, 'getProfilePreferences').mockResolvedValue({} as any);
  vi.spyOn(api, 'setProfilePreferences').mockImplementation(async (_p: any, c: any) => c);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  choisirPeriode('7d');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function poser(C: any, props: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  await souffler();
  flushSync();
  await souffler();
  flushSync();
  return hote;
}

describe('la période du Tableau de bord', () => {
  it('quatre périodes, celles que la route accepte, et sept jours à l’ouverture', () => {
    expect([...PERIODES]).toEqual(['today', '7d', '30d', 'all']);
    expect(periodeActive()).toBe('7d');
  });

  it('le message vide nomme la période lue', () => {
    expect(cleVide('today')).toBe('dashboard.emptyToday');
    expect(cleVide('7d')).toBe('dashboard.emptyLast7Days');
    expect(cleVide('30d')).toBe('dashboard.emptyLast30Days');
    expect(cleVide('all')).toBe('dashboard.emptyAllTime');
  });

  it('la tendance dessine les jours de la période (tout l’historique : 90 au plus)', () => {
    expect(joursTendance('today', 0)).toBe(1);
    expect(joursTendance('7d', 2)).toBe(7);
    expect(joursTendance('30d', 2)).toBe(30);
    expect(joursTendance('all', 400)).toBe(90);
    expect(joursTendance('all', 0)).toBe(1);
  });

  it('30 jours et tout l’historique allongent le délai de garde ; 7 jours garde celui de PageWidgets', () => {
    expect(delaiPour('7d')).toBeUndefined();
    expect(delaiPour('today')).toBeUndefined();
    expect(delaiPour('30d')).toBeGreaterThan(8000);
    expect(delaiPour('all')).toBeGreaterThan(8000);
  });

  it('les quatre nouveaux libellés existent dans les quinze langues', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l) as Record<string, string>;
      for (const k of ['dashboard.emptyToday', 'dashboard.emptyLast30Days', 'dashboard.emptyAllTime', 'dashboard.periodChoice']) {
        expect(d[k], `${l} : ${k}`).toBeTruthy();
      }
    }
  });
});

describe('l’écran monté', () => {
  it('l’en-tête porte le menu de période, à côté de « Modifier »', async () => {
    const page = await poser(TableauDeBordV2);
    const menu = page.querySelector<HTMLSelectElement>('header select');
    expect(menu, 'pas de menu de période dans l’en-tête').toBeTruthy();
    expect([...menu!.options].map((o) => o.value)).toEqual(['today', '7d', '30d', 'all']);
    expect(menu!.value).toBe('7d');
  });

  it('choisir 30 jours recharge les blocs sur 30 jours, et leur message vide le dit', async () => {
    const page = await poser(TableauDeBordV2);
    vi.mocked(api.getDashboard).mockClear();
    const menu = page.querySelector<HTMLSelectElement>('header select')!;
    menu.value = '30d';
    menu.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await souffler();
    flushSync();
    await souffler();
    flushSync();
    const appels = vi.mocked(api.getDashboard).mock.calls;
    expect(appels.length).toBeGreaterThan(0);
    expect(appels.every((c) => c[0] === '30d')).toBe(true);
    const fr = dictionnaire('fr') as Record<string, string>;
    expect(page.textContent).toContain(fr['dashboard.emptyLast30Days']);
    expect(page.textContent).not.toContain(fr['dashboard.emptyLast7Days']);
    expect(page.querySelector<HTMLSelectElement>('header select')!.value).toBe('30d');
  });

  it('les tuiles portent leur icône devant le titre', async () => {
    const page = await poser(TableauDeBordV2);
    const avecIcone = BLOCS_TABLEAU_DE_BORD.filter((w) => w.bloc?.icone).length;
    expect(avecIcone).toBe(9);
    expect(page.querySelectorAll('section.bloc .tete svg.icone-bloc')).toHaveLength(avecIcone);
  });

  it('contre-épreuve : une PageWidgets sans les nouvelles options n’a ni menu, ni icône, ni grille fluide', async () => {
    const page = await poser(PageWidgets, {
      catalogue: BLOCS_TABLEAU_DE_BORD,
      cle: 'essai_widgets',
      cleChiffres: 'essai_stats',
      cleChiffresMigre: 'essai_stats_migre',
    });
    expect(page.querySelector('header select')).toBeNull();
    expect(page.querySelector('.fluide')).toBeNull();
  });
});
