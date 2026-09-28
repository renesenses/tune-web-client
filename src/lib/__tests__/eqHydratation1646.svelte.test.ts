// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(), getEqExpertSettings: vi.fn(), getEq: vi.fn(),
  setEq: vi.fn(), getDsp: vi.fn(), listEqPresets: vi.fn(),
}));
vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';

const attendre = () => new Promise((resolve) => setTimeout(resolve, 0));
let hote: HTMLDivElement;
let instance: Record<string, unknown>;
async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(EqualizerV2, { target: hote });
  flushSync();
  for (let i = 0; i < 4; i++) await attendre();
  flushSync();
  return hote;
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getDsp.mockResolvedValue({});
  mocks.listEqPresets.mockResolvedValue([]);
  mocks.setEq.mockResolvedValue({ applied_live: true });
  currentZoneId.set(1);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  hote?.remove();
});

describe('#1646 — relecture de la courbe active', () => {
  it('affiche les bandes PEQ exactes et une première retouche les conserve', async () => {
    const bandes = [
      { freq: 70, gain: 4.5, q: 0.8, type: 'low_shelf' },
      { freq: 2700, gain: -3, q: 2.4, type: 'peak' },
    ];
    mocks.getEq.mockResolvedValue({ enabled: true, bands: bandes });
    const el = await monter();
    expect(el.querySelector('.peq-count')?.textContent).toContain('2/31');
    expect(el.querySelector('.board')).toBeNull();
    expect(mocks.setEq).not.toHaveBeenCalled();

    (el.querySelector('.peq-add') as HTMLButtonElement).click();
    flushSync();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(mocks.setEq).toHaveBeenCalledOnce();
    const [, reglage] = mocks.setEq.mock.calls[0];
    expect(reglage.bands.slice(0, 2)).toEqual(bandes);
    expect(reglage.bands).toHaveLength(3);
  });

  it('une grille exacte reste dans l’éditeur graphique', async () => {
    const freq = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    mocks.getEq.mockResolvedValue({ enabled: true, bands: freq.map((f, i) => ({ freq: f, gain: i === 2 ? 4 : 0, q: 1 })) });
    const el = await monter();
    expect(el.querySelectorAll('.board input.v')).toHaveLength(10);
    expect(el.querySelector('.peq-count')).toBeNull();
    expect(mocks.setEq).not.toHaveBeenCalled();
  });
});
