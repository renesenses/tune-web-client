// @vitest-environment jsdom
//
// web#3272 — le minuteur de `queueSave` (300 ms) relisait la zone ET la
// courbe au moment de partir : bouger un curseur sur la zone A puis changer
// de zone dans les 300 ms écrivait la courbe de A sur la zone B. L'écriture
// est désormais figée au geste, et part tout de suite vers SA zone quand on
// change de zone ou qu'on quitte l'écran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  listEqPresets: vi.fn(),
  createEqPreset: vi.fn(),
  updateEqPreset: vi.fn(),
  deleteEqPreset: vi.fn(),
  getDsp: vi.fn(),
  setDsp: vi.fn(),
  listCrossfeedPresets: vi.fn(),
  saveCrossfeedPreset: vi.fn(),
  deleteCrossfeedPreset: vi.fn(),
  getLevelCompensation: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';
import { preferences } from '../stores/preferences';

const fr = lFr as unknown as Record<string, string>;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 5; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(EqualizerV2, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

function bouton(el: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes button'))
    .find((b) => (b.textContent ?? '').trim() === texte);
}
const enregistrer = (el: HTMLElement) => bouton(el, fr['eq.save'])!;
const modif = (el: HTMLElement) => el.querySelector('.presets.mes .modif');

async function cliquer(b: HTMLButtonElement | undefined) {
  expect(b, 'bouton introuvable').toBeTruthy();
  b!.click();
  flushSync();
  await laisserCharger();
}


function boutonCtrl(el: HTMLElement, texte: string): HTMLButtonElement {
  const b = Array.from(el.querySelectorAll<HTMLButtonElement>('.ctrls button'))
    .find((x) => (x.textContent ?? '').trim() === texte);
  expect(b, `bouton « ${texte} » introuvable`).toBeTruthy();
  return b!;
}
async function clic(b: HTMLButtonElement) { b.click(); flushSync(); await laisserCharger(); }
/** Les curseurs de la courbe affichée (le canal en cours d'édition). */
const curseurs = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('.board input[type="range"]'));
async function regler(el: HTMLElement, i: number, v: number) {
  const c = curseurs(el)[i];
  c.value = String(v);
  c.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await laisserCharger();
}
const valeurs = (el: HTMLElement) => curseurs(el).map((c) => Number(c.value));

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([]);
  mocks.updateEqPreset.mockImplementation(async (id: string, corps: any) => ({ id, ...corps }));
  mocks.createEqPreset.mockImplementation(async (corps: any) => ({ id: 'p-neuf', ...corps }));
  mocks.getDsp.mockResolvedValue({ crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.5 } });
  mocks.setDsp.mockImplementation(async (_z: number, c: any) => ({ crossfeed: c.crossfeed, crossfeed_applied_live: true }));
  mocks.getLevelCompensation.mockResolvedValue(null);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  currentZoneId.set(1);
  localStorage.clear();
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  for (const r of get(dialogs)) dialogs.settle(r.id, null);
  localStorage.clear();
});

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
const appelsVers = (zid: number) => mocks.setEq.mock.calls.filter(([z]) => z === zid).map(([, c]) => c);
const premierGain = (c: any) => c.bands[0]?.gain;

describe('web#3272 — l’enregistrement différé garde sa zone', () => {
  it('🔴 changer de zone dans les 300 ms : la courbe part vers la zone d’ORIGINE, tout de suite', async () => {
    const el = await poser();
    mocks.setEq.mockClear();
    await regler(el, 0, 4);
    expect(mocks.setEq, 'parti avant le délai').not.toHaveBeenCalled();
    currentZoneId.set(2);
    flushSync();
    // Sans attendre le minuteur : le dernier geste est parti, vers la zone 1.
    expect(appelsVers(1).map(premierGain)).toEqual([4]);
    await attendre(400);
    await laisserCharger();
    expect(appelsVers(2).some((c) => premierGain(c) === 4), 'courbe de A écrite sur B').toBe(false);
    expect(appelsVers(1)).toHaveLength(1);
  });

  it('🔴 quitter l’écran dans les 300 ms : le geste part quand même, vers sa zone', async () => {
    const el = await poser();
    mocks.setEq.mockClear();
    await regler(el, 3, -2);
    unmount(monte as any);
    monte = null;
    expect(appelsVers(1).map((c) => c.bands[3].gain)).toEqual([-2]);
    currentZoneId.set(2);
    await attendre(400);
    expect(appelsVers(2)).toHaveLength(0);
  });

  it('sans changement de zone, le délai reste celui d’avant et écrit le DERNIER geste', async () => {
    const el = await poser();
    mocks.setEq.mockClear();
    await regler(el, 0, 2);
    await regler(el, 0, 5);
    expect(mocks.setEq).not.toHaveBeenCalled();
    await attendre(400);
    expect(appelsVers(1).map(premierGain)).toEqual([5]);
  });

  it('une écriture immédiate remplace celle qui attendait (pas de courbe plus ancienne après)', async () => {
    const el = await poser();
    mocks.setEq.mockClear();
    await regler(el, 0, 3);
    await clic(boutonCtrl(el, fr['v2.eq.unlink']));
    await attendre(400);
    expect(mocks.setEq).toHaveBeenCalledTimes(1);
    const corps = mocks.setEq.mock.calls[0][1];
    expect(corps.bands.some((b: any) => b.channel === 1)).toBe(true);
    expect(premierGain(corps)).toBe(3);
  });
});
