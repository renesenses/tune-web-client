// @vitest-environment jsdom
//
// web#2212 (Tades, Jean Valjean, fil 2314) — Égaliseur v2 en mode
// PARAMÉTRIQUE : « Remettre à plat » n'avait aucun effet. `reset()` remettait
// à zéro la grille graphique, puis `save()` renvoyait au serveur les bandes
// paramétriques, que rien n'avait touchées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(), getEqExpertSettings: vi.fn(), getEq: vi.fn(),
  setEq: vi.fn(), getDsp: vi.fn(), listEqPresets: vi.fn(), setDsp: vi.fn(),
}));
vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { NEUTRAL_PARAMETRIC_BAND } from '../eqReset';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

/** Une courbe paramétrique hors grille ISO : l'écran s'ouvre en paramétrique. */
const COURBE = [
  { freq: 45, gain: 3.5, q: 0.7, type: 'low_shelf' },
  { freq: 1700, gain: 2, q: 1.8, type: 'peak' },
  { freq: 7400, gain: -2.5, q: 4, type: 'peak' },
];

const attendre = () => new Promise((resolve) => setTimeout(resolve, 0));
const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: COURBE });
  mocks.listEqPresets.mockResolvedValue([]);
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.getDsp.mockResolvedValue({});
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' as never }));
  locale.set('fr');
  currentZoneId.set(1);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
});

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(EqualizerV2, { target: hote, props: {} });
  flushSync();
  await respirer();
  return hote;
}

describe('web#2212 — « Remettre à plat » en mode paramétrique', () => {
  it('🔴 envoie une courbe plate au serveur, pas les bandes paramétriques intactes', async () => {
    const el = await monter();
    expect(el.querySelector('.peq-count')?.textContent, 'l’écran ne s’est pas ouvert en paramétrique').toContain('3/31');
    expect(mocks.setEq).not.toHaveBeenCalled();

    (el.querySelector('.v2-actions .v2-btn') as HTMLButtonElement).click();
    await respirer();

    expect(mocks.setEq).toHaveBeenCalledTimes(1);
    const [zid, corps] = mocks.setEq.mock.calls[0];
    expect(zid).toBe(1);
    expect(corps.bands, 'la courbe paramétrique est repartie telle quelle').toEqual([NEUTRAL_PARAMETRIC_BAND]);
    expect(corps.bands.every((b: { gain: number }) => b.gain === 0)).toBe(true);
    // L'écran le montre aussi : un seul point, la bande neutre.
    expect(el.querySelector('.peq-count')?.textContent).toContain('1/31');
  });

  it('en mode graphique, la remise à plat envoie toujours la grille à zéro', async () => {
    const grille = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    mocks.getEq.mockResolvedValue({ enabled: true, bands: grille.map((f, i) => ({ freq: f, gain: i % 3, q: 1 })) });
    const el = await monter();
    expect(el.querySelector('.board')).not.toBeNull();

    (el.querySelector('.v2-actions .v2-btn') as HTMLButtonElement).click();
    await respirer();

    expect(mocks.setEq).toHaveBeenCalledTimes(1);
    const corps = mocks.setEq.mock.calls[0][1];
    expect(corps.bands).toHaveLength(10);
    expect(corps.bands.every((b: { gain: number }) => b.gain === 0)).toBe(true);
  });
});
