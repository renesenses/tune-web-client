// @vitest-environment jsdom
//
// web#3260 (fil 2948, rc12) — « Je fais une modification sur un paramètre :
// le bouton "Enregistrer" reste grisé ».
//
// Cause : en paramétrique, `correspond()` ne comparait que la fréquence et le
// gain des bandes. Un changement de Q, de type de filtre ou de canal laissait
// la courbe « identique » au préréglage enregistré. Chaque champ persisté
// d'une bande doit désormais rendre le préréglage « modifié ».
//
// Harnais : celui de eqPresetEnCours2303 (vrai écran monté) et de
// qPlateauEgaliseur3083 (sélection d'un point du tracé).
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

const fr = lFr as unknown as Record<string, string>;
const PIECE = {
  id: 'p-peq', name: 'Pièce', eq_type: 'parametric',
  bands: [
    { freq: 120, gain: -3, q: 2.5, type: 'peak' },
    { freq: 4000, gain: 1.5, q: 0.9, type: 'peak', channel: 1 },
  ],
};

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

/** Applique « Pièce » puis sélectionne la bande `i` du tracé. */
async function preparer(i = 0): Promise<HTMLDivElement> {
  const el = await poser();
  await cliquer(bouton(el, 'Pièce'));
  const point = el.querySelectorAll<SVGCircleElement>('circle.band-dot')[i];
  expect(point, 'point de bande introuvable').toBeTruthy();
  point.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  el.querySelector('svg.peq-plot')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
  flushSync();
  expect(enregistrer(el).disabled, 'grisé juste après application').toBe(true);
  expect(modif(el)).toBeNull();
  return el;
}

async function saisir(el: HTMLElement, cle: 'freq' | 'gain' | 'q', valeur: string) {
  const champ = el.querySelector<HTMLInputElement>(`.peq-editor input[data-cle="${cle}"]`)!;
  expect(champ, `champ ${cle}`).toBeTruthy();
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  champ.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  await laisserCharger();
}

/** Les deux listes de l'éditeur : 0 = type de filtre, 1 = canal. */
async function choisir(el: HTMLElement, rang: 0 | 1, valeur: string) {
  const liste = el.querySelectorAll<HTMLSelectElement>('.peq-editor select')[rang];
  expect(liste, `liste ${rang}`).toBeTruthy();
  liste.value = valeur;
  liste.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  await laisserCharger();
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([PIECE]);
  mocks.updateEqPreset.mockImplementation(async (id: string, corps: any) => ({ id, ...corps }));
  mocks.createEqPreset.mockImplementation(async (corps: any) => ({ id: 'p-neuf', ...corps }));
  mocks.getDsp.mockResolvedValue({ crossfeed: { enabled: true, amount: 0.3, delay_ms: 0.5 } });
  mocks.setDsp.mockImplementation(async (_z: number, c: any) => ({ crossfeed: c.crossfeed, crossfeed_applied_live: true }));
  mocks.getLevelCompensation.mockResolvedValue(null);
  (SVGElement.prototype as any).setPointerCapture = () => {};
  (SVGElement.prototype as any).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0 });
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

describe('web#3260 — tout champ d’une bande paramétrique dégrise « Enregistrer »', () => {
  it('🔴 le Q', async () => {
    const el = await preparer(0);
    await saisir(el, 'q', '4');
    expect(enregistrer(el).disabled, 'Q changé, « Enregistrer » grisé').toBe(false);
    expect(modif(el)).not.toBeNull();
  });

  it('🔴 le type de filtre', async () => {
    const el = await preparer(0);
    await choisir(el, 0, 'notch');
    expect(enregistrer(el).disabled, 'type changé, « Enregistrer » grisé').toBe(false);
    expect(modif(el)).not.toBeNull();
  });

  it('🔴 le canal (les deux → gauche)', async () => {
    const el = await preparer(0);
    await choisir(el, 1, '0');
    expect(enregistrer(el).disabled, 'canal changé, « Enregistrer » grisé').toBe(false);
    expect(modif(el)).not.toBeNull();
  });

  it('🔴 le canal (droite → les deux)', async () => {
    const el = await preparer(1);
    await choisir(el, 1, 'both');
    expect(enregistrer(el).disabled, 'canal changé, « Enregistrer » grisé').toBe(false);
  });

  it('la fréquence et le gain (déjà couverts avant)', async () => {
    const el = await preparer(0);
    await saisir(el, 'freq', '150');
    expect(enregistrer(el).disabled).toBe(false);
    await saisir(el, 'freq', '120');
    expect(enregistrer(el).disabled).toBe(true);
    await saisir(el, 'gain', '2');
    expect(enregistrer(el).disabled).toBe(false);
  });

  it('revenir à la valeur d’origine regrise « Enregistrer »', async () => {
    const el = await preparer(0);
    await saisir(el, 'q', '4');
    expect(enregistrer(el).disabled).toBe(false);
    await saisir(el, 'q', '2.5');
    expect(enregistrer(el).disabled, 'Q revenu, toujours actif').toBe(true);

    await choisir(el, 0, 'low_shelf');
    expect(enregistrer(el).disabled).toBe(false);
    await choisir(el, 0, 'peak');
    expect(enregistrer(el).disabled, 'type revenu, toujours actif').toBe(true);

    await choisir(el, 1, '1');
    expect(enregistrer(el).disabled).toBe(false);
    await choisir(el, 1, 'both');
    expect(enregistrer(el).disabled, 'canal revenu, toujours actif').toBe(true);
    expect(modif(el)).toBeNull();
  });

  it('un réglage identique (Q absent ≡ 1,0, type absent ≡ peak) n’est pas « modifié »', async () => {
    mocks.listEqPresets.mockResolvedValue([{
      id: 'p-nu', name: 'Nu', eq_type: 'parametric',
      bands: [{ freq: 500, gain: 2 }],
    }]);
    const el = await poser();
    await cliquer(bouton(el, 'Nu'));
    expect(enregistrer(el).disabled).toBe(true);
    expect(modif(el)).toBeNull();
  });
});
