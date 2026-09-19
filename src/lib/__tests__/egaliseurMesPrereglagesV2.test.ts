// @vitest-environment jsdom
//
// Phase 5 (web#1257) — « aucune perte d'accès ». Les préréglages ENREGISTRÉS
// de l'égaliseur (`/eq/presets`, partagés par tous les appareils) n'étaient
// atteints que par l'ancien `EqualizerView` :
//
//   listEqPresets    GET    /eq/presets
//   createEqPreset   POST   /eq/presets
//   deleteEqPreset   DELETE /eq/presets/{id}
//
// 🔴 CES TÉMOINS MONTENT LE VRAI `EqualizerV2`, avec la fiche du greffon telle
// que le serveur la rend (v0.9.156 : greffon facultatif). La confirmation de
// suppression est observée dans le bus `dialogs` — le témoin RÉPOND, il ne
// décide pas à la place de l'écran.
//
// Contre-épreuve (faite à la main, consignée dans la PR) : retirer l'appel à
// `api.listEqPresets()` ⇒ 1 à 4 rouges ; retirer `api.createEqPreset` ⇒ 2
// rouge ; retirer `api.deleteEqPreset` ⇒ 4 rouge ; lire les préréglages même
// greffon absent ⇒ 5 rouge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getPluginDetail: vi.fn(),
  getEqExpertSettings: vi.fn(),
  getEq: vi.fn(),
  setEq: vi.fn(),
  setEqExpertSettings: vi.fn(),
  installPlugin: vi.fn(),
  enablePlugin: vi.fn(),
  listEqPresets: vi.fn(),
  createEqPreset: vi.fn(),
  deleteEqPreset: vi.fn(),
}));
vi.mock('../api', () => mocks);

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 6; i++) await respirer(); flushSync(); }

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

const fiche = (installed: boolean) => ({
  name: 'equalizer', display_name: 'Égaliseur', description: '', version: '1.0.0', category: 'audio',
  compatible: true, update_available: false, status: installed ? 'active' : 'available',
  installed, install_proposed: false, existing_configuration: false,
});
const GRILLE = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const SALON = { id: 'p1', name: 'Salon', eq_type: 'graphic', bands: GRILLE.map((freq, i) => ({ freq, gain: i === 0 ? 6 : 0, q: 1 })) };
const puces = (el: HTMLElement) => [...el.querySelectorAll('.mes-presets .mp-apply')].map((b) => b.textContent?.trim());

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue(fiche(true));
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: false, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([SALON]);
  mocks.createEqPreset.mockImplementation(async (b: any) => ({ id: 'p2', ...b }));
  mocks.deleteEqPreset.mockResolvedValue(undefined);
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
});

describe('Égaliseur v2 — Mes préréglages', () => {
  it('1. listEqPresets : les préréglages du serveur s’affichent', async () => {
    const el = await poser();
    expect(mocks.listEqPresets).toHaveBeenCalled();
    expect(puces(el)).toEqual(['Salon']);
  });

  it('2. createEqPreset : enregistrer la courbe courante sous un nom', async () => {
    const el = await poser();
    const champ = el.querySelector('.mp-save input') as HTMLInputElement;
    champ.value = 'Casque';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (el.querySelector('.mp-save button') as HTMLButtonElement).click();
    await laisserCharger();
    expect(mocks.createEqPreset).toHaveBeenCalledTimes(1);
    const corps = mocks.createEqPreset.mock.calls[0][0];
    expect(corps.name).toBe('Casque');
    expect(corps.eq_type).toBe('graphic');
    expect(corps.bands.map((b: any) => b.freq)).toEqual(GRILLE);
    expect(puces(el)).toEqual(['Salon', 'Casque']);
  });

  it('3. rappeler un préréglage envoie SES bandes à la zone et allume l’égaliseur', async () => {
    const el = await poser();
    (el.querySelector('.mes-presets .mp-apply') as HTMLButtonElement).click();
    await laisserCharger();
    expect(mocks.setEq).toHaveBeenCalled();
    const [zone, corps] = mocks.setEq.mock.calls.at(-1)!;
    expect(zone).toBe(1);
    expect(corps.enabled).toBe(true);
    expect(corps.bands[0].gain).toBe(6);
  });

  it('4. deleteEqPreset : après confirmation danger seulement', async () => {
    const el = await poser();
    (el.querySelector('.mes-presets .mp-del') as HTMLButtonElement).click();
    for (let i = 0; i < 10 && !get(dialogs).length; i++) await respirer();
    let d = get(dialogs)[0];
    expect(d?.danger).toBe(true);
    dialogs.settle(d.id, false);
    await laisserCharger();
    expect(mocks.deleteEqPreset).not.toHaveBeenCalled();

    (el.querySelector('.mes-presets .mp-del') as HTMLButtonElement).click();
    for (let i = 0; i < 10 && !get(dialogs).length; i++) await respirer();
    d = get(dialogs)[0];
    dialogs.settle(d.id, true);
    await laisserCharger();
    expect(mocks.deleteEqPreset).toHaveBeenCalledWith('p1');
    expect(puces(el)).toEqual([]);
  });

  it('5. greffon non installé : ni lecture des préréglages, ni bloc', async () => {
    mocks.getPluginDetail.mockResolvedValue(fiche(false));
    const el = await poser();
    expect(mocks.listEqPresets).not.toHaveBeenCalled();
    expect(el.querySelector('.mes-presets')).toBeNull();
  });
});
