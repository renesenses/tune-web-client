// @vitest-environment jsdom
//
// Retour testeur du 01/11 : on ne savait pas effacer un préréglage importé
// (fichier REW / Equalizer APO). Ces témoins montent le VRAI écran et tiennent :
//   1. un préréglage de l'utilisateur, importé compris, a « Supprimer » ;
//      les préréglages fournis (Flat, Rock…) jamais ;
//   2. le premier clic ne supprime RIEN : il demande confirmation SUR PLACE
//      (aucune boîte native) ; « Annuler » ne supprime rien ;
//   3. confirmer appelle `DELETE /eq/presets/{id}` et retire le préréglage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  listEqPresets: vi.fn(),
  createEqPreset: vi.fn(),
  updateEqPreset: vi.fn(),
  deleteEqPreset: vi.fn(),
  importAutoEqPreset: vi.fn(),
  getLevelCompensation: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const IMPORTE = {
  id: 'p-rew',
  name: 'Salon REW',
  eq_type: 'parametric',
  source: 'autoeq',
  bands: [{ freq: 45, gain: -6, q: 4, type: 'peak' }],
};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 6; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(async () => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([IMPORTE]);
  mocks.deleteEqPreset.mockResolvedValue(undefined);
  mocks.getLevelCompensation.mockResolvedValue(null);
  locale.set('fr');
  currentZoneId.set(1);
  localStorage.clear();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(EqualizerV2, { target: hote });
  flushSync();
  await laisserCharger();
});
afterEach(() => {
  if (monte) unmount(monte);
  hote?.remove();
  monte = null;
  hote = null;
});

const mien = () => hote!.querySelector<HTMLElement>('.presets.mes .mien');
const bouton = (racine: Element, texte: string) =>
  Array.from(racine.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === texte);
const clic = (b: HTMLElement) => { b.click(); flushSync(); };

describe('supprimer un préréglage importé', () => {
  it('le préréglage importé a un bouton Supprimer ; les préréglages fournis n’en ont pas', () => {
    expect(mien()?.textContent).toContain('Salon REW');
    expect(mien()!.querySelector('button.x')?.getAttribute('aria-label')).toContain(fr['eq.deletePreset']);
    const fournis = hote!.querySelector('.presets:not(.mes)')!;
    expect(fournis.querySelectorAll('button.x').length).toBe(0);
  });

  it('le premier clic demande confirmation sur place, sans boîte native ni suppression', () => {
    const natif = vi.spyOn(window, 'confirm');
    clic(mien()!.querySelector<HTMLButtonElement>('button.x')!);
    expect(natif).not.toHaveBeenCalled();
    expect(mocks.deleteEqPreset).not.toHaveBeenCalled();
    expect(mien()!.textContent).toContain(fr['eq.deletePresetConfirm'].replace('{name}', 'Salon REW'));
    clic(bouton(mien()!, fr['common.cancel'])!);
    expect(mocks.deleteEqPreset).not.toHaveBeenCalled();
    expect(mien()!.querySelector('button.x')).toBeTruthy();
  });

  it('confirmer supprime par la route serveur et retire le préréglage', async () => {
    clic(mien()!.querySelector<HTMLButtonElement>('button.x')!);
    clic(bouton(mien()!, fr['eq.deletePreset'])!);
    await laisserCharger();
    expect(mocks.deleteEqPreset).toHaveBeenCalledWith('p-rew');
    expect(mien()).toBeNull();
  });
});
