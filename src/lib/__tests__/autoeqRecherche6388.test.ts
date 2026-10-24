// @vitest-environment jsdom
//
// tune-server-rust#6388 (Tades, fil 2282) — chercher un casque dans la base
// AutoEq depuis l'Égaliseur, au lieu d'aller chercher le fichier sur GitHub.
// Le SERVEUR lit la base : l'écran envoie le nom cherché, liste chaque source
// de mesure, puis envoie le chemin du profil choisi. Ces témoins MONTENT le
// vrai écran.
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
  searchAutoEq: vi.fn(),
  importAutoEqFromDatabase: vi.fn(),
  getLevelCompensation: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import EqualizerV2 from '../../components/v2/EqualizerV2.svelte';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;

const RESULTATS = [
  { name: 'Sennheiser HD 650', source: 'crinacle', rig: 'GRAS 43AG-7', form: 'GRAS 43AG-7 over-ear', path: 'crinacle/GRAS 43AG-7 over-ear/Sennheiser HD 650' },
  { name: 'Sennheiser HD 650', source: 'oratory1990', rig: null, form: 'over-ear', path: 'oratory1990/over-ear/Sennheiser HD 650' },
];
const IMPORTE = {
  id: 'p-hd650',
  name: 'Sennheiser HD 650 (oratory1990)',
  eq_type: 'parametric',
  bands: [{ freq: 105, gain: 6.4, q: 0.7, type: 'low_shelf' }],
};

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

async function chercher(el: HTMLElement, q: string) {
  const ouvrir = Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => (b.textContent ?? '').trim() === fr['eq.autoeqSearch']);
  expect(ouvrir, 'aucun bouton « Rechercher dans AutoEq »').toBeTruthy();
  ouvrir!.click();
  flushSync();
  const champ = el.querySelector<HTMLInputElement>('.autoeq input[type="search"]');
  expect(champ, 'champ de recherche absent').toBeTruthy();
  champ!.value = q;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  el.querySelector<HTMLFormElement>('.autoeq-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  await laisserCharger();
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getPluginDetail.mockResolvedValue({ name: 'equalizer', installed: true });
  mocks.getEqExpertSettings.mockResolvedValue({ expert_bands: 10 });
  mocks.getEq.mockResolvedValue({ enabled: true, bands: [] });
  mocks.setEq.mockResolvedValue({ applied_live: true });
  mocks.listEqPresets.mockResolvedValue([]);
  mocks.getLevelCompensation.mockResolvedValue(null);
  currentZoneId.set(1);
  localStorage.clear();
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  localStorage.clear();
});

describe('#6388 — Égaliseur : chercher un casque dans AutoEq', () => {
  it('🔴 la recherche part au serveur et liste chaque source de mesure', async () => {
    mocks.searchAutoEq.mockResolvedValue({ query: 'hd650', results: RESULTATS, total: 2 });
    const el = await poser();
    await chercher(el, 'hd650');
    expect(mocks.searchAutoEq).toHaveBeenCalledWith('hd650');
    const lignes = Array.from(el.querySelectorAll('.autoeq-resultats li'));
    expect(lignes.map((l) => l.querySelector('.autoeq-source')?.textContent)).toEqual([
      'crinacle · GRAS 43AG-7',
      'oratory1990',
    ]);
  });

  it('🔴 choisir un profil l’importe par son chemin, sans fichier, et l’applique', async () => {
    mocks.searchAutoEq.mockResolvedValue({ query: 'hd650', results: RESULTATS, total: 2 });
    mocks.importAutoEqFromDatabase.mockResolvedValue({
      preset: IMPORTE, band_count: 1, ignored_filters: [], preamp_db: -6.1,
      reserved_headroom_db: 10.3, preamp_applied: false, preamp_covered_by_headroom: true,
    });
    const el = await poser();
    await chercher(el, 'hd650');
    el.querySelectorAll<HTMLButtonElement>('.autoeq-resultats button')[1].click();
    await laisserCharger();
    expect(mocks.importAutoEqFromDatabase).toHaveBeenCalledWith({ path: 'oratory1990/over-ear/Sennheiser HD 650' });
    expect(mocks.importAutoEqPreset, 'aucun fichier n’est envoyé').not.toHaveBeenCalled();
    const mien = Array.from(el.querySelectorAll<HTMLButtonElement>('.presets.mes .mien button'))
      .find((b) => (b.textContent ?? '').trim() === 'Sennheiser HD 650 (oratory1990)');
    expect(mien, 'le profil importé doit rejoindre Mes presets').toBeTruthy();
    expect(mocks.setEq).toHaveBeenCalled();
    expect(el.querySelector('.bilan-peq')?.textContent).toContain('-6.1');
  });

  it('🔴 serveur sans réseau ni copie (503) : l’écran le dit, pas « aucun résultat »', async () => {
    mocks.searchAutoEq.mockRejectedValue(Object.assign(new Error('autoeq_unreachable'), { status: 503 }));
    const el = await poser();
    await chercher(el, 'hd650');
    expect(el.querySelector('.autoeq-erreur')?.textContent).toBe(fr['eq.autoeqOffline']);
    expect(el.querySelector('.autoeq-vide')).toBeNull();
  });

  it('aucun résultat : dit tel quel', async () => {
    mocks.searchAutoEq.mockResolvedValue({ query: 'zzz', results: [], total: 0 });
    const el = await poser();
    await chercher(el, 'zzz');
    expect(el.querySelector('.autoeq-vide')?.textContent).toBe(fr['eq.autoeqNoResult']);
  });

  it('les clés AutoEq existent dans les 13 langues', () => {
    const cles = Object.keys(fr).filter((k) => k.startsWith('eq.autoeq'));
    expect(cles.length).toBe(10);
    expect(ONZE_LANGUES.length).toBe(13);
    for (const lang of ONZE_LANGUES) {
      const table = dictionnaire(lang);
      for (const k of cles) expect(table[k], `${lang} : ${k}`).toBeTruthy();
    }
  });
});
