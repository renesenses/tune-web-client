// @vitest-environment jsdom
//
// web#1750 — « Enregistrer » et « Enregistrer sous » dans l'Égaliseur et le
// Crossfeed (Tades, forum, fil 2020 : « pourquoi Enregistrer ce réglage
// impose-t-il de resaisir le nom ? Ne peut-on faire comme dans Windows ? »).
//
// Avant : un seul bouton, qui ouvrait une boîte de nom VIDE. Mettre à jour un
// préréglage demandait de retaper son nom lettre pour lettre ; dans l'EQ,
// l'homonyme était supprimé puis recréé (non atomique).
//
// Ces témoins MONTENT les vrais écrans et tiennent :
//   1. « Enregistrer » met à jour le préréglage en cours SANS demander de nom ;
//   2. « Enregistrer sous » passe par la boîte de saisie de l'application,
//      PRÉREMPLIE du nom en cours, et crée un nouveau préréglage ;
//   3. l'état « modifié, non enregistré » ;
//   4. EQ : un homonyme est mis à jour sur place (PUT), jamais supprimé.
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
import CrossfeedV2 from '../../components/v2/CrossfeedV2.svelte';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';

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

describe('#1750 — Égaliseur : Enregistrer / Enregistrer sous', () => {
  it('sans préréglage en cours : un seul geste, créer — boîte VIDE', async () => {
    const el = await poser(EqualizerV2);
    expect(bouton(el, fr['eq.save']), 'rien à mettre à jour').toBeUndefined();
    await cliquer(bouton(el, `+ ${fr['eq.savePreset']}`));
    expect(boite()?.kind).toBe('prompt');
    expect(boite()?.initial).toBe('');
    await repondre('Nuit');
    expect(mocks.createEqPreset).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nuit', eq_type: 'graphic' }));
    expect(mocks.updateEqPreset).not.toHaveBeenCalled();
  });

  it('🔴 « Enregistrer » met à jour le préréglage en cours, SANS redemander son nom', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, 'Salon soir'));

    const enreg = bouton(el, fr['eq.save']);
    expect(enreg, 'le geste « Enregistrer » existe une fois un préréglage appliqué').toBeTruthy();
    expect(enreg!.disabled, 'rien de modifié : rien à enregistrer').toBe(true);
    expect(modif(el)).toBeNull();

    // Un curseur bouge : le préréglage en cours est modifié.
    const curseur = el.querySelectorAll<HTMLInputElement>('.board input.v')[0];
    curseur.value = '6';
    curseur.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(modif(el)?.textContent).toBe(fr['eq.presetModified']);
    expect(bouton(el, fr['eq.save'])!.disabled).toBe(false);
    expect(bouton(el, fr['eq.save'])!.title).toBe(fr['eq.saveTitle'].replace('{name}', 'Salon soir'));

    await cliquer(bouton(el, fr['eq.save']));
    expect(boite(), 'aucune boîte de nom').toBeNull();
    expect(mocks.updateEqPreset).toHaveBeenCalledTimes(1);
    const [id, corps] = mocks.updateEqPreset.mock.calls[0];
    expect(id).toBe('p-a');
    expect(corps.name).toBe('Salon soir');
    expect(corps.bands[0].gain).toBe(6);
    expect(mocks.createEqPreset).not.toHaveBeenCalled();
    expect(mocks.deleteEqPreset).not.toHaveBeenCalled();
    expect(modif(el), 'enregistré : plus rien de modifié').toBeNull();
  });

  it('🔴 « Enregistrer sous » : boîte de l’application PRÉREMPLIE, puis création', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, 'Salon soir'));
    await cliquer(bouton(el, fr['eq.saveAs']));
    expect(boite()?.kind).toBe('prompt');
    expect(boite()?.initial, 'le nom en cours, pas une boîte vide').toBe('Salon soir');
    await repondre('Salon nuit');
    expect(mocks.createEqPreset).toHaveBeenCalledWith(expect.objectContaining({ name: 'Salon nuit' }));
    expect(mocks.updateEqPreset).not.toHaveBeenCalled();
    // Le nouveau devient celui en cours.
    expect(bouton(el, fr['eq.save'])!.title).toBe(fr['eq.saveTitle'].replace('{name}', 'Salon nuit'));
  });

  it('🔴 « Enregistrer sous » un nom existant : mis à jour SUR PLACE, jamais supprimé', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, `+ ${fr['eq.savePreset']}`));
    await repondre('Casque');
    expect(mocks.deleteEqPreset, 'supprimer puis recréer n’était pas atomique').not.toHaveBeenCalled();
    expect(mocks.createEqPreset).not.toHaveBeenCalled();
    expect(mocks.updateEqPreset).toHaveBeenCalledWith('p-b', expect.objectContaining({ name: 'Casque' }));
  });

  it('un préréglage intégré met fin à l’édition du préréglage personnel', async () => {
    const el = await poser(EqualizerV2);
    await cliquer(bouton(el, 'Salon soir'));
    expect(bouton(el, fr['eq.save'])).toBeTruthy();
    const plat = Array.from(el.querySelectorAll<HTMLButtonElement>('.presets:not(.mes) button'))[0];
    await cliquer(plat);
    expect(bouton(el, fr['eq.save'])).toBeUndefined();
    expect(bouton(el, `+ ${fr['eq.savePreset']}`)).toBeTruthy();
  });
});

describe('#1750 — Crossfeed : Enregistrer / Enregistrer sous', () => {
  const SALON_CF = { id: 'c-a', name: 'Salon', amount: 0.2, delay_ms: 0.4 };
  beforeEach(() => {
    mocks.listCrossfeedPresets.mockResolvedValue([SALON_CF]);
    mocks.saveCrossfeedPreset.mockImplementation(async (c: any) => (
      c.name === 'Salon' ? { ...c, id: 'c-a' } : { ...c, id: 'c-neuf' }
    ));
  });

  it('🔴 « Enregistrer » réécrit le préréglage en cours sous SON nom, sans boîte', async () => {
    const el = await poser(CrossfeedV2);
    await cliquer(bouton(el, 'Salon'));
    expect(bouton(el, fr['eq.save'])!.disabled).toBe(true);

    const niveau = el.querySelector<HTMLInputElement>(`input[aria-label="${fr['v2.cf.amountAria']}"]`)!;
    niveau.value = '0.35';
    niveau.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(modif(el)?.textContent).toBe(fr['eq.presetModified']);

    await cliquer(bouton(el, fr['eq.save']));
    expect(boite(), 'aucune boîte de nom').toBeNull();
    expect(mocks.saveCrossfeedPreset).toHaveBeenCalledTimes(1);
    expect(mocks.saveCrossfeedPreset.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'Salon', amount: 0.35 }));
    expect(modif(el)).toBeNull();
  });

  it('🔴 « Enregistrer sous » : boîte préremplie, nouveau nom, nouveau préréglage', async () => {
    const el = await poser(CrossfeedV2);
    await cliquer(bouton(el, 'Salon'));
    await cliquer(bouton(el, fr['eq.saveAs']));
    expect(boite()?.initial).toBe('Salon');
    await repondre('Bureau');
    expect(mocks.saveCrossfeedPreset.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'Bureau' }));
    expect(bouton(el, 'Bureau'), 'le nouveau préréglage est listé').toBeTruthy();
    expect(bouton(el, 'Salon'), 'l’original reste').toBeTruthy();
  });
});
