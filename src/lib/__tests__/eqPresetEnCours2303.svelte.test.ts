// @vitest-environment jsdom
//
// web#2303 (Thierry, forum, fil 2377, rc7) — « Dans l'égaliseur, tu perds
// périodiquement les boutons Enregistrer et Enregistrer sous, pour revenir à
// l'ancien "Enregistrer ce réglage" ».
//
// Cause : l'effet de chargement de `EqualizerV2` lisait `$t` dans son corps
// et remettait le préréglage en cours à zéro à CHAQUE relance. Un
// dictionnaire qui arrive (`enregistrerDictionnaire`, `revision`) suffisait
// à le relancer. Seul un vrai changement de zone doit l'effacer (web#1750).
//
// Le harnais est celui de enregistrerSous1750.test.ts (vrais écrans montés).
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
import { enregistrerDictionnaire } from '../i18n';
import { zoneChangee } from '../eqPresetEnCours';

const fr = lFr as unknown as Record<string, string>;
const GRILLE = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const eqPreset = (id: string, name: string, gain: number) => ({
  id, name, eq_type: 'graphic', bands: GRILLE.map((freq) => ({ freq, gain, q: 1, type: 'peak' })),
});
const SALON = eqPreset('p-a', 'Salon soir', 2);
const CASQUE = eqPreset('p-b', 'Casque', -1);

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 5; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(Comp: any): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Comp, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

/** Les boutons de la rangée « Mes préréglages », par texte exact. */
function bouton(el: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes button'))
    .find((b) => (b.textContent ?? '').trim() === texte);
}
const modif = (el: HTMLElement) => el.querySelector('.presets.mes .modif');

async function cliquer(b: HTMLButtonElement | undefined) {
  expect(b, 'bouton introuvable').toBeTruthy();
  b!.click();
  flushSync();
  await laisserCharger();
}

/** La boîte de saisie ouverte (celle de l'application, pas du navigateur). */
function boite() {
  const file = get(dialogs);
  return file.length ? file[0] : null;
}
async function repondre(valeur: string | null) {
  const b = boite();
  expect(b, 'aucune boîte de saisie ouverte').not.toBeNull();
  dialogs.settle(b!.id, valeur);
  await laisserCharger();
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([SALON, CASQUE]);
  mocks.updateEqPreset.mockImplementation(async (id: string, corps: any) => ({ id, ...corps }));
  mocks.createEqPreset.mockImplementation(async (corps: any) => ({ id: 'p-neuf', ...corps }));
  mocks.getDsp.mockResolvedValue({ crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.5 } });
  mocks.setDsp.mockImplementation(async (_z: number, c: any) => ({ crossfeed: c.crossfeed, crossfeed_applied_live: true }));
  mocks.getLevelCompensation.mockResolvedValue(null);
  currentZoneId.set(1);
  localStorage.clear();
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  // Une boîte restée ouverte ne doit pas passer au témoin suivant.
  for (const r of get(dialogs)) dialogs.settle(r.id, null);
  localStorage.clear();
});


describe('web#2303 — le préréglage en cours survit aux relances du chargement', () => {
  it('🔴 une traduction qui arrive ne fait pas disparaître « Enregistrer » et « Enregistrer sous »', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, 'Salon soir'));
    expect(bouton(el, fr['eq.save'])).toBeTruthy();
    expect(bouton(el, fr['eq.saveAs'])).toBeTruthy();

    // `$t` réémet, comme à l'arrivée d'un chunk de langue.
    enregistrerDictionnaire('fr', lFr as any);
    flushSync();
    await laisserCharger();

    expect(bouton(el, fr['eq.save']), '« Enregistrer » a disparu').toBeTruthy();
    expect(bouton(el, fr['eq.saveAs']), '« Enregistrer sous » a disparu').toBeTruthy();
    expect(bouton(el, `+ ${fr['eq.savePreset']}`)).toBeUndefined();
  });

  it('la même zone réannoncée garde le préréglage en cours', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, 'Salon soir'));
    currentZoneId.set(1);
    flushSync();
    await laisserCharger();
    expect(bouton(el, fr['eq.save'])).toBeTruthy();
  });

  it('web#1750 tenu : un VRAI changement de zone l’efface', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, 'Salon soir'));
    currentZoneId.set(2);
    flushSync();
    await laisserCharger();
    expect(bouton(el, fr['eq.save'])).toBeUndefined();
    expect(bouton(el, `+ ${fr['eq.savePreset']}`)).toBeTruthy();
  });

  it('zoneChangee : premier chargement, même zone, autre zone', () => {
    expect(zoneChangee(undefined, 1)).toBe(false);
    expect(zoneChangee(1, 1)).toBe(false);
    expect(zoneChangee(null, null)).toBe(false);
    expect(zoneChangee(1, 2)).toBe(true);
    expect(zoneChangee(1, null)).toBe(true);
  });
});
